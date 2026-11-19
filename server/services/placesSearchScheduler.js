import { randomUUID } from 'node:crypto';
import config from '../config/env.js';
import {
  historicalPlacesEfficiency, logPlacesAttempt, normalizePlacesText, PlacesStop,
  placesDatabase, placesSearchStats, placesUsage, recordPlacesPage, requestGooglePlaces,
} from './googlePlacesClient.js';
import { getPlacesPlan } from './placesSearchPlan.js';

const PAGE_SIZE = 20;
const RESULT_CEILING = 60;
const fieldMask = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents',
  'places.types', 'places.websiteUri', 'nextPageToken',
];
const pauses = new Set(['daily_lead_limit', 'daily_budget', 'google_daily_quota', 'google_rate_limit', 'shutdown']);
const livePagination = new Map();
const running = new Map();

function score(task, estimate, untouched) {
  if (!task.requests) return estimate + (untouched ? 9 : 2) - task.keyword * 4;
  const relevance = 1 - (task.irrelevant + task.duplicates) / Math.max(1, task.raw);
  const pagesRemaining = Math.max(0, Math.ceil((RESULT_CEILING - task.raw) / PAGE_SIZE));
  return (task.accepted + estimate) / (task.attempts + 1) + 3 * relevance + Math.min(2, pagesRemaining);
}

function createTask(region, parents = [], keyword = 0) {
  const path = [...parents, region.name];
  return {
    key: JSON.stringify([keyword, ...path.map(normalizePlacesText)]),
    region, path, keyword, requests: 0, attempts: 0, raw: 0, accepted: 0,
    irrelevant: 0, duplicates: 0, pageToken: '', lastSignature: '',
  };
}

function serializeTasks(tasks) {
  return tasks.map(({ pageToken, lastSignature, ...task }) => task);
}

let shuttingDown = false;
export async function cancelPlacesSearches() {
  shuttingDown = true;
  const searches = [...running.values()];
  for (const search of searches) search.controller.abort('shutdown');
  await Promise.all(searches.map(search => search.settled));
}

export async function schedulePlacesSearch(options) {
  const {
    id: incomingId = randomUUID(), owner, niche, area, country, geographyLevel, target, signal: callerSignal,
    remaining, onResume, collect, commit, onProgress,
  } = options;
  const maxRequests = config.GOOGLE_PLACES_REQUESTS_PER_SEARCH;
  const maxCost = config.GOOGLE_PLACES_SEARCH_COST_MICROS;
  const db = placesDatabase();
  const intent = JSON.stringify([owner, niche, area, country, geographyLevel, target].map(normalizePlacesText));
  const resumed = db.prepare(`
    SELECT * FROM google_places_searches WHERE intent = ? AND state IN ('paused', 'running')
    ORDER BY updated DESC LIMIT 1
  `).get(intent);
  const id = resumed?.id || incomingId;
  const started = resumed?.started || Date.now();
  const invocationStart = Date.now();
  const checkpoint = resumed ? JSON.parse(resumed.progress) : {
    target, ids: [], tasks: [], plan: null, keyword: 0, duplicateRequestsPrevented: 0,
    duplicates: 0, irrelevant: 0, otherRequests: 0, pagesExpired: 0,
  };
  const controller = new AbortController();
  const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal;
  const { promise: settled, resolve: finish } = Promise.withResolvers();
  running.set(id, { controller, settled });
  if (shuttingDown) controller.abort('shutdown');
  const pausedPages = livePagination.get(id);
  livePagination.delete(id);
  let tasks = pausedPages?.expires > Date.now() ? pausedPages.tasks : checkpoint.tasks.filter(task => !task.requests);
  if (resumed && tasks.length < checkpoint.tasks.length) checkpoint.pagesExpired += checkpoint.tasks.length - tasks.length;
  const write = db.prepare(`
    INSERT INTO google_places_searches(id, owner, intent, started, updated, state, progress)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated = excluded.updated, state = excluded.state, progress = excluded.progress
  `);
  function persist(state, summary) {
    checkpoint.tasks = serializeTasks(tasks);
    write.run(id, owner || null, intent, started, Date.now(), state, JSON.stringify({ ...checkpoint, summary }));
  }

  const pastYield = historicalPlacesEfficiency();
  const estimate = Math.max(1, pastYield ?? 10);
  const dailyAtStart = placesUsage();
  const budget = {
    theoreticalMinimumRequests: Math.ceil(target / PAGE_SIZE),
    historicalAverageLeadsPerRequest: pastYield == null ? null : Number(pastYield.toFixed(2)),
    estimatedRequests: Math.ceil(target / estimate),
    maxRequests, maxCostMicros: maxCost,
    dailyEstimatedRemaining: dailyAtStart.estimatedRemaining,
  };
  let reason = 'coverage_exhausted';
  let message = 'Available geographic areas and distinct search phrases were exhausted.';
  let providerError;
  let summary;
  const completed = new Set(tasks.map(task => task.key));
  const add = task => {
    if (completed.has(task.key)) return;
    completed.add(task.key);
    tasks.push(task);
  };
  const pauseForQuota = current => {
    if (current.dailyCircuitOpen) throw new PlacesStop('google_daily_quota', 'Google daily Text Search quota is exhausted. Resume after the Pacific-time reset.');
    if (current.rateLimitedUntil > Date.now() + 30000) {
      throw new PlacesStop('google_rate_limit', 'Google temporarily rate-limited Text Search. Resume after the cooldown.');
    }
    if (!current.estimatedRemaining || current.estimatedCostMicrosToday + config.GOOGLE_PLACES_TEXT_COST_MICROS > config.GOOGLE_PLACES_DAILY_COST_MICROS) {
      console.info('[Quota Manager] Local request budget reached.', id, 'daily_budget');
      throw new PlacesStop('daily_budget', 'Local daily Google Places request or estimated cost budget reached.');
    }
  };
  try {
    checkpoint.ids = onResume(checkpoint.ids);
    persist('running');
    db.prepare('INSERT OR IGNORE INTO google_places_jobs (job_id, search_id) VALUES (?, ?)').run(incomingId, id);
    console.info('[Google Places Budget]', id, JSON.stringify(budget));
    if (signal.aborted) throw new PlacesStop('cancelled', 'Search cancelled.');
    if (remaining() > 0) {
      const current = placesSearchStats(id);
      if (current.attempts >= maxRequests || current.estimatedCostMicros + config.GOOGLE_PLACES_TEXT_COST_MICROS > maxCost) {
        console.info('[Quota Manager] Local request budget reached.', id, 'search_budget');
        throw new PlacesStop('search_budget', 'Local per-search request or cost budget reached.');
      }
      pauseForQuota(dailyAtStart);
    }
    if (!checkpoint.plan && remaining() > 0) {
      const plan = await getPlacesPlan({ niche, area, country, geographyLevel, signal, onRequest: () => {
        checkpoint.otherRequests++;
        persist('running');
      } });
      checkpoint.plan = plan;
      add(createTask(plan.root));
      if (plan.level !== 'city') {
        for (const child of plan.root.children) add(createTask(child, [plan.root.name]));
      }
      persist('running');
    }
    const plan = checkpoint.plan;
    while (remaining() > 0) {
      if (signal.aborted) throw new PlacesStop('cancelled', 'Search cancelled.');
      if (!tasks.length) {
        if (!plan || checkpoint.keyword + 1 >= plan.phrases.length) break;
        checkpoint.keyword++;
        add(createTask(plan.root, [], checkpoint.keyword));
      }
      // One Google page per turn. Give unseen regions a chance, then reconsider using observed yields.
      const untouched = plan.level !== 'city' && remaining() >= PAGE_SIZE;
      tasks.sort((a, b) => score(b, estimate, untouched) - score(a, estimate, untouched));
      const task = tasks[0];
      const phrase = plan.phrases[task.keyword];
      const national = plan.level === 'country' && task.path.length === 1;
      const locationParts = [...new Map([...task.path].reverse().map(name => [normalizePlacesText(name), name])).values()];
      if (normalizePlacesText(locationParts.at(-1)) !== normalizePlacesText(country)) locationParts.push(country);
      const region = locationParts.join(', ');
      const body = { textQuery: `${phrase} in ${region}`, pageSize: PAGE_SIZE };
      if (task.pageToken) body.pageToken = task.pageToken;
      const mask = [...fieldMask, ...(config.GOOGLE_PLACES_CRM_LICENSED ? ['places.internationalPhoneNumber'] : [])].join(',');
      let page;
      try {
        page = await requestGooglePlaces({
          id, body, mask, phrase, region, signal, remaining, collected: () => checkpoint.ids.length,
          page: task.requests + 1, maxRequests, maxCost,
        });
      } catch (error) {
        if (error.reason !== 'duplicate') throw error;
        checkpoint.duplicateRequestsPrevented++;
        tasks.shift();
        persist('running');
        continue;
      }
      const { data, attempt } = page;
      const places = Array.isArray(data.places) ? data.places : [];
      const signature = JSON.stringify(places.map(place => place.id).sort());
      const repeated = task.lastSignature && signature === task.lastSignature;
      let counts;
      try {
        counts = repeated ? { ids: [], duplicates: places.length, irrelevant: 0 } :
          await collect(places, { country, area: task.region.name, national, phrase, signal });
      } catch (error) {
        logPlacesAttempt(attempt);
        throw error;
      }
      const { ids, duplicates, irrelevant } = counts;
      task.requests++;
      task.attempts += attempt.retry + 1;
      task.raw += places.length;
      task.accepted += ids.length;
      task.duplicates += duplicates;
      task.irrelevant += irrelevant;
      task.lastSignature = signature;
      checkpoint.ids.push(...ids);
      checkpoint.duplicates += duplicates;
      checkpoint.irrelevant += irrelevant;
      const useful = task.raw - task.duplicates - task.irrelevant;
      const saturated = task.raw >= RESULT_CEILING && task.accepted > 0 && useful / task.raw >= 0.25;
      const repeatedToken = Boolean(data.nextPageToken && data.nextPageToken === task.pageToken);
      const lowYield = ids.length === 0 && (duplicates + irrelevant >= places.length * 0.8);
      if (repeatedToken) {
        checkpoint.duplicateRequestsPrevented++;
        console.info('[Optimisation] Duplicate request prevented.', id, region, task.requests + 1);
      }
      tasks.shift();
      if (data.nextPageToken && remaining() > 0 && !signal.aborted && !repeated && !repeatedToken &&
          !lowYield && task.raw < RESULT_CEILING && task.requests < RESULT_CEILING / PAGE_SIZE) {
        task.pageToken = data.nextPageToken;
        tasks.push(task);
      } else if (data.nextPageToken) {
        console.info('[Optimisation] Unnecessary pagination skipped.', id, region);
      }
      if (saturated && remaining() > 0 && !signal.aborted) {
        for (const child of task.region.children) add(createTask(child, task.path, task.keyword));
      }
      db.transaction(() => {
        commit(ids, id, checkpoint.ids.length, checkpoint.duplicates);
        recordPlacesPage(attempt, { accepted: ids.length, duplicates, irrelevant });
        persist('running');
      })();
      logPlacesAttempt(attempt, {
        accepted: ids.length, duplicates, irrelevant, total: checkpoint.ids.length,
        queryEfficiency: Number((task.accepted / task.attempts).toFixed(2)),
      });
      if (places.length) console.info('[Optimisation] Place Details request avoided.', id, region, places.length);
      onProgress(checkpoint.ids.length, region);
    }
    if (checkpoint.ids.length >= target) {
      reason = 'target_reached';
      message = 'Requested lead target reached.';
      console.info('[Optimisation] Target reached. Pending tasks cancelled.', id);
    } else if (signal.aborted) {
      throw new PlacesStop('cancelled', 'Search cancelled.');
    } else if (remaining() <= 0) {
      reason = 'daily_lead_limit';
      message = 'The application daily lead limit was reached.';
    }
  } catch (error) {
    reason = signal.reason === 'shutdown' ? 'shutdown' : error.reason || 'provider_error';
    message = error.message;
    if (!error.reason) providerError = error;
  } finally {
    try {
      const attempts = placesSearchStats(id);
      const paused = pauses.has(reason);
      summary = {
        searchId: id, requestedLeads: target, finalUniqueLeads: checkpoint.ids.length, ...attempts,
        otherRequests: attempts.otherRequests + checkpoint.otherRequests,
        duplicateRequestsPrevented: checkpoint.duplicateRequestsPrevented,
        duplicateResults: checkpoint.duplicates, irrelevantResults: checkpoint.irrelevant,
        expiredPageCursors: checkpoint.pagesExpired,
        averageUniqueLeadsPerTextSearch: attempts.textSearchRequests ? Number((checkpoint.ids.length / attempts.textSearchRequests).toFixed(2)) : 0,
        executionTimeMs: (resumed ? JSON.parse(resumed.progress).summary?.executionTimeMs || 0 : 0) + Date.now() - invocationStart,
        terminationReason: reason, message, paused, budget, dailyUsage: placesUsage(),
      };
      if (paused && tasks.length) {
        if (livePagination.size >= 32) livePagination.delete(livePagination.keys().next().value);
        const cursorLifetime = 5 * 60000;
        const pagination = { tasks, expires: Date.now() + cursorLifetime };
        livePagination.set(id, pagination);
        setTimeout(() => {
          if (livePagination.get(id) === pagination) livePagination.delete(id);
        }, cursorLifetime).unref();
      }
      persist(paused ? 'paused' : providerError ? 'failed' : 'completed', summary);
      console.info('[Google Places Search Summary]', JSON.stringify(summary));
    } finally {
      running.delete(id);
      finish();
    }
  }
  return { id, summary, providerError };
}

export function savedPlacesSearch(id, owner) {
  const record = placesDatabase().prepare(`
    SELECT id, owner, state, progress, started, updated FROM google_places_searches
    WHERE id = coalesce((SELECT search_id FROM google_places_jobs WHERE job_id = ?), ?)
  `).get(id, id);
  if (!record || record.owner !== (owner || null)) return null;
  const progress = JSON.parse(record.progress);
  const interrupted = record.state === 'running' && !running.has(record.id);
  const summary = progress.summary || {
    ...placesSearchStats(record.id), searchId: record.id, requestedLeads: progress.target,
    finalUniqueLeads: progress.ids.length, duplicateRequestsPrevented: progress.duplicateRequestsPrevented,
    executionTimeMs: record.updated - record.started, dailyUsage: placesUsage(),
    ...(interrupted ? { terminationReason: 'interrupted' } : {}),
  };
  return { id, status: interrupted ? 'interrupted' : record.state, summary };
}

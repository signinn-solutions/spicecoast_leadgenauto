import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import config from '../config/env.js';
import { getDatabase } from './storageService.js';

const textEndpoint = 'https://places.googleapis.com/v1/places:searchText';
const active = new Map();
const quotaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' });
const initialized = new WeakSet();

export function placesDatabase() {
  const db = getDatabase();
  if (initialized.has(db)) return db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS google_places_attempts (
      id INTEGER PRIMARY KEY, project TEXT NOT NULL, method TEXT NOT NULL, search_id TEXT NOT NULL,
      day TEXT NOT NULL, started INTEGER NOT NULL, cost INTEGER NOT NULL, fingerprint TEXT NOT NULL,
      pagination INTEGER NOT NULL, retry INTEGER NOT NULL, status INTEGER, duration INTEGER,
      raw INTEGER NOT NULL DEFAULT 0, accepted INTEGER NOT NULL DEFAULT 0,
      duplicates INTEGER NOT NULL DEFAULT 0, irrelevant INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS google_places_attempts_usage ON google_places_attempts(project, method, day, started);
    CREATE INDEX IF NOT EXISTS google_places_attempts_search ON google_places_attempts(search_id, fingerprint);
    CREATE TABLE IF NOT EXISTS google_places_circuits (
      project TEXT NOT NULL, method TEXT NOT NULL, day TEXT NOT NULL, until_ms INTEGER NOT NULL,
      daily INTEGER NOT NULL, PRIMARY KEY(project, method)
    );
    CREATE TABLE IF NOT EXISTS google_places_searches (
      id TEXT PRIMARY KEY, owner TEXT, intent TEXT NOT NULL, started INTEGER NOT NULL,
      updated INTEGER NOT NULL, state TEXT NOT NULL, progress TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS google_places_search_intent ON google_places_searches(intent, updated);
    CREATE TABLE IF NOT EXISTS google_places_jobs (job_id TEXT PRIMARY KEY, search_id TEXT NOT NULL);
  `);
  initialized.add(db);
  return db;
}

export const normalizePlacesText = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export function placesFingerprint(endpoint, mask, body = {}) {
  const { textQuery, ...filters } = body;
  return createHash('sha256').update(JSON.stringify([
    endpoint, mask.split(',').map(field => field.trim()).sort(),
    normalizePlacesText(textQuery), canonical(filters),
  ])).digest('hex');
}

export class PlacesStop extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

function limits(method) {
  return method === 'text_search'
    ? { day: config.GOOGLE_PLACES_TEXT_PER_DAY, minute: config.GOOGLE_PLACES_TEXT_PER_MINUTE }
    : { day: config.GOOGLE_PLACES_OTHER_PER_DAY, minute: config.GOOGLE_PLACES_OTHER_PER_MINUTE };
}

function usage(db, now, project, method) {
  const day = quotaDate.format(now);
  const daily = db.prepare('SELECT count(*) AS attempts FROM google_places_attempts WHERE project = ? AND method = ? AND day = ?')
    .get(project, method, day);
  // A rolling minute may cross the daily reset boundary.
  const recent = db.prepare(`
    SELECT count(*) AS minute, min(started) AS oldest FROM google_places_attempts
    WHERE project = ? AND method = ? AND started > ?
  `).get(project, method, now - 60000);
  const cost = db.prepare('SELECT coalesce(sum(cost), 0) AS cost FROM google_places_attempts WHERE project = ? AND day = ?').get(project, day).cost;
  return { day, attempts: daily.attempts, ...recent, cost };
}

export function placesUsage(method = 'text_search') {
  const project = config.GOOGLE_PLACES_PROJECT;
  const db = placesDatabase();
  const now = Date.now();
  const current = usage(db, now, project, method);
  const budget = limits(method);
  const circuit = db.prepare('SELECT day, daily, until_ms FROM google_places_circuits WHERE project = ? AND method = ?').get(project, method);
  return {
    source: 'local_attempts', authoritative: false, day: current.day, timezone: 'America/Los_Angeles',
    attemptsToday: current.attempts, attemptsLastMinute: current.minute,
    dailyLimit: budget.day, perMinuteLimit: budget.minute,
    estimatedRemaining: Math.max(0, budget.day - current.attempts),
    estimatedCostMicrosToday: current.cost,
    concurrent: [...active.values()].filter(request => request.project === project && request.method === method).length,
    dailyCircuitOpen: Boolean(circuit?.daily && circuit.day === current.day),
    rateLimitedUntil: circuit?.until_ms > now ? circuit.until_ms : null,
  };
}

export function placesSearchStats(id) {
  const groups = placesDatabase().prepare(`
    SELECT method, count(*) AS attempts, count(CASE WHEN status BETWEEN 200 AND 299 THEN 1 END) AS success,
      count(CASE WHEN status IS NOT NULL AND (status < 200 OR status >= 300) THEN 1 END) AS failed,
      count(CASE WHEN status IS NULL THEN 1 END) AS outcomeUnknown,
      sum(pagination) AS pagination, sum(retry) AS retries, sum(cost) AS estimatedCostMicros
    FROM google_places_attempts WHERE search_id = ? GROUP BY method
  `).all(id);
  return {
    textSearchRequests: groups.find(group => group.method === 'text_search')?.attempts || 0,
    placeDetailsRequests: groups.find(group => group.method === 'place_details')?.attempts || 0,
    otherRequests: groups.filter(group => !['text_search', 'place_details'].includes(group.method)).reduce((sum, group) => sum + group.attempts, 0),
    ...Object.fromEntries(['attempts', 'success', 'failed', 'outcomeUnknown', 'pagination', 'retries', 'estimatedCostMicros'].map(key => [key, groups.reduce((sum, group) => sum + group[key], 0)])),
  };
}

export function historicalPlacesEfficiency() {
  const { average } = placesDatabase().prepare(`
    SELECT avg(accepted) AS average FROM (
      SELECT attempts.accepted FROM google_places_attempts AS attempts
      JOIN google_places_searches AS searches ON attempts.search_id = searches.id
      WHERE attempts.project = ? AND attempts.method = 'text_search'
        AND attempts.status IS NOT NULL ORDER BY attempts.id DESC LIMIT 200
    )
  `).get(config.GOOGLE_PLACES_PROJECT);
  return average;
}

function reserve(db, { project, method, id, fingerprint, cost, pagination, retry, maxRequests, maxCost }) {
  return db.transaction(() => {
    const now = Date.now();
    const job = db.prepare('SELECT count(*) AS attempts, coalesce(sum(cost), 0) AS cost FROM google_places_attempts WHERE search_id = ?').get(id);
    const current = usage(db, now, project, method);
    const limit = limits(method);
    if (job.attempts >= maxRequests || job.cost + cost > maxCost) return { stop: 'search_budget' };
    if (current.attempts >= limit.day || current.cost + cost > config.GOOGLE_PLACES_DAILY_COST_MICROS) return { stop: 'daily_budget' };
    const circuit = db.prepare('SELECT * FROM google_places_circuits WHERE project = ? AND method = ?').get(project, method);
    if (circuit?.daily && circuit.day === current.day) return { stop: 'google_daily_quota' };
    const previous = db.prepare(`
      SELECT status FROM google_places_attempts WHERE search_id = ? AND fingerprint = ? ORDER BY id DESC
    `).all(id, fingerprint);
    const duplicate = !retry && previous.length && previous[0].status !== 429;
    if (duplicate || active.has(`${project}:${fingerprint}`)) return { stop: 'duplicate' };
    if (circuit?.until_ms > now + 30000) return { stop: 'google_rate_limit' };
    if (circuit?.until_ms > now) return { wait: circuit.until_ms - now };
    if (current.minute >= limit.minute) return { wait: Math.max(1, current.oldest + 60000 - now) };
    if ([...active.values()].filter(item => item.project === project).length >= config.GOOGLE_PLACES_CONCURRENCY) return { wait: 50 };
    const inserted = db.prepare(`
      INSERT INTO google_places_attempts (project, method, search_id, day, started, cost, fingerprint, pagination, retry)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(project, method, id, current.day, now, cost, fingerprint, Number(pagination), Number(previous.length > 0));
    return { row: inserted.lastInsertRowid, number: job.attempts + 1, priorAttempts: previous.length };
  })();
}

function quotaError(response, data, retry) {
  const error = data?.error || {};
  const evidence = JSON.stringify(error);
  const header = response.headers?.get('retry-after');
  const retryInfo = error.details?.find?.(detail => detail['@type']?.endsWith('RetryInfo'))?.retryDelay;
  const retryMs = header == null ? (parseFloat(retryInfo) || 0) * 1000 :
    /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Math.max(0, Date.parse(header) - Date.now()) || 0;
  const daily = /per[\s_-]*day|daily/i.test(evidence) || (!header && !retryInfo && !/per[\s_/-]*(minute|second)|rate.?limit|short.term/i.test(evidence));
  return { daily, delay: Math.max(retryMs, (500 * 2 ** retry) + Math.floor(Math.random() * 250)) };
}

export function recordPlacesPage(attempt, counts) {
  placesDatabase().prepare('UPDATE google_places_attempts SET accepted = ?, duplicates = ?, irrelevant = ? WHERE id = ?')
    .run(counts.accepted, counts.duplicates, counts.irrelevant, attempt.row);
}

export function logPlacesAttempt(attempt, totals = {}) {
  console.info('[Google Places Request]', JSON.stringify({
    searchId: attempt.id, requestNumber: attempt.number, endpoint: attempt.endpoint,
    phrase: attempt.phrase, region: attempt.region, page: attempt.page,
    rawResults: attempt.raw, newUniqueLeads: totals.accepted ?? 0,
    duplicateResults: totals.duplicates ?? 0, irrelevantResults: totals.irrelevant ?? 0,
    totalCollectedLeads: totals.total ?? attempt.collected, httpStatus: attempt.status || null,
    responseTimeMs: attempt.duration, retry: attempt.retry, queryEfficiency: totals.queryEfficiency ?? null,
  }));
}

export async function requestGooglePlaces({
  id = randomUUID(), endpoint = textEndpoint, method = 'text_search', body, mask, phrase = body?.textQuery || '', region = '',
  page = 1, signal, remaining = () => 1, collected = () => 0, maxRequests = config.GOOGLE_PLACES_REQUESTS_PER_SEARCH,
  maxCost = config.GOOGLE_PLACES_SEARCH_COST_MICROS, cost = config.GOOGLE_PLACES_TEXT_COST_MICROS,
  maxRetries = 2, timeout = 10000, reuseStatusForMs = 0,
}) {
  const db = placesDatabase();
  const project = config.GOOGLE_PLACES_PROJECT;
  const fingerprint = placesFingerprint(endpoint, mask, body);
  const key = `${project}:${fingerprint}`;
  if (reuseStatusForMs && !signal?.aborted && db.prepare(`
    SELECT 1 FROM google_places_attempts WHERE project = ? AND method = ?
      AND fingerprint = ? AND started >= ? AND status BETWEEN 200 AND 299 LIMIT 1
  `).get(project, method, fingerprint, Date.now() - reuseStatusForMs)) {
    console.info('[Optimisation] Duplicate request prevented.', id, region, page);
    return { reused: true };
  }
  for (let retry = 0; retry <= maxRetries; retry++) {
    let reservation;
    do {
      if (signal?.aborted) throw new PlacesStop('cancelled', 'Search cancelled.');
      if (remaining() <= 0) throw new PlacesStop('target_reached', 'Lead target reached.');
      reservation = reserve(db, { project, method, id, fingerprint, cost, maxCost, maxRequests, pagination: Boolean(body?.pageToken), retry: retry > 0 });
      if (reservation.stop) {
        const messages = {
          search_budget: 'Local per-search request or cost budget reached.',
          daily_budget: 'Local daily request or cost budget reached.',
          google_daily_quota: 'Google daily Text Search quota is exhausted. Resume after the Pacific-time reset.',
          google_rate_limit: 'Google temporarily rate-limited Text Search. Resume after the cooldown.',
          duplicate: 'Identical Google Places request already attempted or in flight.',
        };
        if (reservation.stop.endsWith('budget')) console.info('[Quota Manager] Local request budget reached.', id, reservation.stop);
        if (reservation.stop === 'duplicate') console.info('[Optimisation] Duplicate request prevented.', id, region, page);
        throw new PlacesStop(reservation.stop, messages[reservation.stop]);
      }
      if (reservation.wait) {
        try { await wait(reservation.wait, undefined, { signal }); }
        catch (error) { if (signal?.aborted) throw new PlacesStop('cancelled', 'Search cancelled.'); throw error; }
      }
    } while (!reservation.row);

    active.set(key, { project, method });
    const attempt = { ...reservation, id, endpoint, phrase, region, page, retry: reservation.priorAttempts, collected: collected(), raw: 0, status: 0 };
    const started = Date.now();
    let response;
    let data;
    let failure;
    try {
      const requestTimeout = AbortSignal.timeout(timeout);
      response = await fetch(endpoint, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': config.GOOGLE_API_KEY, 'X-Goog-FieldMask': mask },
        body: body ? JSON.stringify(body) : undefined,
        signal: signal ? AbortSignal.any([signal, requestTimeout]) : requestTimeout,
      });
      attempt.status = response.status;
      data = await response.json();
      attempt.raw = Array.isArray(data?.places) ? data.places.length : 0;
    } catch (error) {
      failure = error;
    } finally {
      attempt.duration = Date.now() - started;
      active.delete(key);
      db.prepare('UPDATE google_places_attempts SET status = ?, duration = ?, raw = ? WHERE id = ?')
        .run(attempt.status, attempt.duration, attempt.raw, attempt.row);
    }

    if (attempt.status === 429) {
      const { daily, delay } = quotaError(response, data, retry);
      const now = Date.now();
      db.prepare(`
        INSERT INTO google_places_circuits(project,method,day,until_ms,daily) VALUES(?,?,?,?,?)
        ON CONFLICT(project,method) DO UPDATE SET day=excluded.day, until_ms=max(google_places_circuits.until_ms, excluded.until_ms),
          daily=CASE WHEN google_places_circuits.day=excluded.day THEN max(google_places_circuits.daily, excluded.daily) ELSE excluded.daily END
      `).run(project, method, quotaDate.format(now), daily ? 0 : now + delay, Number(daily));
      logPlacesAttempt(attempt);
      if (daily) throw new PlacesStop('google_daily_quota', 'Google daily Text Search quota is exhausted. Resume after the Pacific-time reset.');
      if (retry === maxRetries || delay > 30000) throw new PlacesStop('google_rate_limit', 'Google temporarily rate-limited Text Search. Resume after the cooldown.');
      continue;
    }
    if (failure || !response?.ok) {
      logPlacesAttempt(attempt);
      if (signal?.aborted) throw new PlacesStop('cancelled', 'Search cancelled.');
      const error = new Error(attempt.status >= 400 ? `Google Places returned HTTP ${attempt.status}.` : 'Google Places request failed or timed out.');
      error.statusCode = 502;
      error.providerStatus = attempt.status || undefined;
      throw error;
    }
    return { data, attempt };
  }
}

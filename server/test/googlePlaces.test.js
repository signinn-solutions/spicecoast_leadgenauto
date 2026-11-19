import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import { setTimeout as wait } from 'node:timers/promises';
import test from 'node:test';
import app from '../app.js';
import config from '../config/env.js';
import { executeLeadSearch } from '../services/leadFinderService.js';
import { closeStorage, loadLeadsHistory } from '../services/storageService.js';
import { placesDatabase, placesFingerprint, placesUsage, requestGooglePlaces } from '../services/googlePlacesClient.js';
import { savedPlacesSearch } from '../services/placesSearchScheduler.js';

const keys = ['DB_PATH', 'DAILY_USAGE_FILE', 'REPLY_USAGE_FILE', 'LEADS_HISTORY_FILE', 'SEEN_PLACES_FILE',
  'MAILBOX_HISTORY_FILE', 'OUTREACH_HISTORY_FILE', 'GOOGLE_API_KEY', 'GOOGLE_PLACES_PROJECT',
  'GOOGLE_PLACES_TEXT_PER_DAY', 'GOOGLE_PLACES_TEXT_PER_MINUTE', 'GOOGLE_PLACES_CONCURRENCY',
  'GOOGLE_PLACES_CRM_LICENSED', 'GOOGLE_PLACES_REQUESTS_PER_SEARCH', 'GOOGLE_PLACES_TEXT_COST_MICROS',
  'GOOGLE_PLACES_DAILY_COST_MICROS', 'GOOGLE_PLACES_SEARCH_COST_MICROS', 'DAILY_LEAD_LIMIT', 'MAX_LEADS_PER_SEARCH',
  'DEEPSEEK_API_KEY', 'NODE_ENV', 'ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'CORS_ORIGIN'];

function fixture(t) {
  const original = Object.fromEntries(keys.map(key => [key, config[key]]));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'spicecoast-places-'));
  for (const key of keys.slice(0, 7)) config[key] = path.join(directory, key);
  Object.assign(config, {
    GOOGLE_API_KEY: 'test-only', GOOGLE_PLACES_PROJECT: 'test-project', GOOGLE_PLACES_CRM_LICENSED: true,
    GOOGLE_PLACES_TEXT_PER_DAY: 500, GOOGLE_PLACES_TEXT_PER_MINUTE: 500, GOOGLE_PLACES_CONCURRENCY: 1,
    GOOGLE_PLACES_REQUESTS_PER_SEARCH: 60, GOOGLE_PLACES_TEXT_COST_MICROS: 35000,
    GOOGLE_PLACES_DAILY_COST_MICROS: 2100000, GOOGLE_PLACES_SEARCH_COST_MICROS: 2100000,
    DAILY_LEAD_LIMIT: 2000, MAX_LEADS_PER_SEARCH: 1000, DEEPSEEK_API_KEY: '',
    NODE_ENV: 'development', ADMIN_EMAIL: '', ADMIN_PASSWORD_HASH: '', CORS_ORIGIN: '*',
  });
  t.mock.method(console, 'info', () => {});
  const realFetch = globalThis.fetch;
  t.after(() => {
    closeStorage();
    Object.assign(config, original);
    globalThis.fetch = realFetch;
    for (const filename of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, filename));
    fs.rmdirSync(directory);
  });
  return realFetch;
}

const search = (count, options = {}, progress) => executeLeadSearch({
  engine: 'scraper', businessType: 'Spice Wholesale', city: 'India', country: 'India', requestedCount: count, ...options,
}, progress);

function pageFor(region, page = 0, size = 20) {
  return Array.from({ length: size }, (_, index) => {
    const id = `${region}-${page * 20 + index}`;
    return { id, displayName: { text: `Spice Wholesale ${id}` }, formattedAddress: region, internationalPhoneNumber: '+91 9999999999' };
  });
}

const dense = ({ textQuery, pageToken, pageSize }) => {
  const page = Number(pageToken || 0);
  const region = textQuery.split(' in ').at(-1);
  return Response.json({ places: pageFor(region, page, pageSize), ...(page < 2 ? { nextPageToken: String(page + 1) } : {}) });
};

function mockGoogle(handler) {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://places.googleapis.com/v1/places:searchText');
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.ok(body.pageSize <= 20);
    requests.push(body);
    return handler(body, options);
  };
  return requests;
}

test('Google Text Search reaches 20, 60, 120, 500 and 1,000 usable leads without requesting extra pages', async t => {
  fixture(t);
  const requests = mockGoogle(dense);
  await t.test('dynamic targets', async testCase => {
    for (const target of [20, 60, 120, 500, 1000]) {
      await testCase.test(String(target), async () => {
        const start = requests.length;
        const result = await search(target, { businessType: `Spice Wholesale target ${target}`, country: target === 20 ? 'Germany' : 'India', city: target === 20 ? 'Berlin' : 'India' });
        // Larger country fixtures reuse IDs by region, as real Google requests would. Use a fresh database per target.
        assert.equal(result.count, target);
        assert.equal(new Set(result.leads.map(lead => lead.id)).size, target);
        assert.equal(result.placesSummary.terminationReason, 'target_reached');
        assert.equal(requests.length - start, Math.ceil(target / 20));
        assert.equal(result.placesSummary.placeDetailsRequests, 0);
        assert.equal(result.placesSummary.budget.theoreticalMinimumRequests, Math.ceil(target / 20));
        const nextDb = config.DB_PATH.replace(/-target\d+$/, '') + `-target${target}`;
        closeStorage();
        config.DB_PATH = nextDb;
      });
    }
  });
});

test('sparse, duplicate-heavy and out-of-area pages give way to better regions and distinct DeepSeek phrases', async t => {
  fixture(t);
  config.DEEPSEEK_API_KEY = 'mock-ai';
  let aiRequests = 0;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('deepseek.com')) {
      aiRequests++;
      return Response.json({ choices: [{ message: { content: JSON.stringify({
        primary: 'Spice Wholesale', alternatives: ['Wholesale Spices', 'Seasoning distributors', 'Food importers'],
      }) } }] });
    }
    const body = JSON.parse(options.body);
    calls.push(body);
    const top = 'Hamburg, Germany';
    if (body.textQuery.startsWith('Spice Wholesale')) {
      return Response.json({ places: [
        ...pageFor('Paris, France', 0, 3),
        { ...pageFor(top, 0, 1)[0], displayName: { text: 'Spice Cafe' }, types: ['cafe'] },
      ], nextPageToken: 'unused' });
    }
    return Response.json({ places: pageFor(top, 1, 2) });
  };
  const result = await search(2, { city: 'Hamburg', country: 'Germany' });
  assert.equal(result.count, 2);
  assert.equal(loadLeadsHistory().searches[0].query, 'Spice Wholesale · Hamburg, Germany');
  assert.equal(result.placesSummary.irrelevantResults, 4);
  assert.equal(result.placesSummary.otherRequests, 1);
  assert.deepEqual(calls.map(call => call.textQuery), ['Spice Wholesale in Hamburg, Germany', 'Seasoning distributors in Hamburg, Germany']);
  assert.ok(calls.every(call => !call.pageToken));
  await search(2, { city: 'Hamburg', country: 'Germany' });
  assert.equal(aiRequests, 1, 'Reuse generated phrases');
});

test('repeated pages stop pagination and a sparse state does not trigger searches of its towns', async t => {
  fixture(t);
  const requests = mockGoogle(body => {
    const region = body.textQuery.split(' in ').at(-1);
    if (region === 'India') return Response.json({ places: pageFor(region), nextPageToken: 'repeated' });
    if (region === 'Kerala, India') return Response.json({ places: [] });
    return Response.json({ places: pageFor(region, 0, 1) });
  });
  const result = await search(21);
  assert.equal(result.count, 21);
  assert.equal(result.placesSummary.duplicateRequestsPrevented, 1);
  assert.equal(result.placesSummary.duplicateResults, 20);
  assert.deepEqual(requests.map(body => body.textQuery.split(' in ').at(-1)), ['India', 'India', 'Kerala, India', 'Maharashtra, India']);
});

test('daily quota opens a shared breaker, keeps the partial result, survives restart and resumes remaining regions', async t => {
  fixture(t);
  const requests = mockGoogle(body => {
    if (body.pageToken) return Response.json({ error: {
      message: "Quota exceeded for limit 'SearchTextRequest per day'",
      details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', metadata: { quota_limit: 'SearchTextRequestPerDay' } }],
    } }, { status: 429 });
    return dense(body);
  });
  const options = { ownerUserId: 'owner-1', searchId: 'daily-places-job' };
  const result = await search(40, options);
  assert.equal(result.count, 20);
  assert.equal(result.placesSummary.terminationReason, 'google_daily_quota');
  assert.equal(result.placesSummary.failed, 1);
  assert.equal(result.placesSummary.retries, 0);
  assert.equal((await search(20, { businessType: 'Different niche' })).placesSummary.terminationReason, 'google_daily_quota');
  assert.equal(requests.length, 2);
  assert.equal(loadLeadsHistory().leads.length, 20);
  assert.equal(savedPlacesSearch('daily-places-job', 'other-owner'), null);
  closeStorage();
  const childOutput = execFileSync(process.execPath, ['--input-type=module'], {
    input: `
      import config from './server/config/env.js';
      import { placesUsage } from './server/services/googlePlacesClient.js';
      import { savedPlacesSearch } from './server/services/placesSearchScheduler.js';
      config.DB_PATH = ${JSON.stringify(config.DB_PATH)};
      config.GOOGLE_PLACES_PROJECT = 'test-project';
      const saved = savedPlacesSearch('daily-places-job', 'owner-1');
      process.stdout.write(JSON.stringify([placesUsage().attemptsToday, placesUsage().dailyCircuitOpen, saved.status, saved.summary.finalUniqueLeads]));
    `, encoding: 'utf8',
  });
  assert.deepEqual(JSON.parse(childOutput), [2, true, 'paused', 20]);
  const nextDay = Date.now() + 86400000;
  t.mock.method(Date, 'now', () => nextDay);
  const resumed = await search(40, { ...options, searchId: 'resumed-job' });
  assert.equal(resumed.count, 40);
  assert.equal(resumed.placesSummary.searchId, 'daily-places-job');
  assert.equal(resumed.placesSummary.expiredPageCursors, 1);
  assert.equal(savedPlacesSearch('resumed-job', 'owner-1').summary.finalUniqueLeads, 40);
  assert.equal(requests.length, 3);
  assert.equal(requests.at(-1).pageToken, undefined);
  assert.doesNotMatch(requests.at(-1).textQuery, / in India$/);
});

test('temporary 429 respects Retry-After and retries through quota accounting', async t => {
  fixture(t);
  const started = [];
  const requests = mockGoogle(body => {
    started.push(Date.now());
    if (started.length === 1) return Response.json({ error: { message: 'Rate limit per minute' } }, { status: 429, headers: { 'Retry-After': '1' } });
    return dense(body);
  });
  const result = await search(20);
  assert.equal(result.count, 20);
  assert.equal(result.placesSummary.retries, 1);
  assert.equal(result.placesSummary.failed, 1);
  assert.equal(placesUsage().attemptsToday, 2);
  assert.ok(started[1] - started[0] >= 990);
  assert.deepEqual(requests[0], requests[1]);
});

test('a first page denied by daily quota can be dispatched after the quota day changes', async t => {
  fixture(t);
  let restored = false;
  const requests = mockGoogle(body => restored ? dense(body) :
    Response.json({ error: { message: 'Quota exceeded per day' } }, { status: 429 }));
  const paused = await search(20);
  assert.equal(paused.count, 0);
  assert.equal(paused.placesSummary.terminationReason, 'google_daily_quota');
  restored = true;
  const nextDay = Date.now() + 86400000;
  t.mock.method(Date, 'now', () => nextDay);
  const result = await search(20);
  assert.equal(result.count, 20);
  assert.equal(result.placesSummary.searchId, paused.placesSummary.searchId);
  assert.equal(result.placesSummary.retries, 1);
  assert.deepEqual(requests[0], requests[1]);
});

test('job, daily, cost, minute and concurrent quota checks reserve atomically and block duplicates', async t => {
  fixture(t);
  config.GOOGLE_PLACES_TEXT_PER_DAY = 3;
  const held = Promise.withResolvers();
  const requests = mockGoogle(async body => {
    if (body.textQuery === 'held') await held.promise;
    return dense(body);
  });
  const start = (id, query, options = {}) => requestGooglePlaces({
    id, mask: 'places.id', body: { textQuery: query, pageSize: 1 }, ...options,
  });
  const first = start('one', 'held', { maxRequests: 1 });
  await assert.rejects(start('two', '  HELD ', {}), { reason: 'duplicate' });
  const second = start('two', 'second');
  assert.equal(requests.length, 1);
  assert.equal(placesUsage().concurrent, 1);
  held.resolve();
  await Promise.all([first, second]);
  await assert.rejects(start('one', 'new', { maxRequests: 1 }), { reason: 'search_budget' });
  await assert.rejects(start('three', 'new', { maxCost: 34000 }), { reason: 'search_budget' });
  config.GOOGLE_PLACES_TEXT_PER_MINUTE = 1;
  const now = Date.now();
  placesDatabase().prepare('UPDATE google_places_attempts SET started = ?').run(now - 59980);
  await start('three', 'third');
  assert.equal(requests.length, 3);
  assert.equal(placesUsage().estimatedRemaining, 0);
  await assert.rejects(start('four', 'fourth'), { reason: 'daily_budget' });
  assert.equal(
    placesFingerprint('endpoint', 'b,a', { textQuery: '  Mixed Case', locationRestriction: { z: 1, a: 2 } }),
    placesFingerprint('endpoint', 'a,b', { locationRestriction: { a: 2, z: 1 }, textQuery: 'mixed case' })
  );
  assert.notEqual(placesFingerprint('endpoint', 'a,b', { pageToken: 'a' }), placesFingerprint('endpoint', 'a,b', { pageToken: 'b' }));
});

test('duplicate frontend-shaped submissions share an authenticated job, and cancellation aborts active Google requests', async t => {
  const realFetch = fixture(t);
  const api = app.listen(0, '127.0.0.1');
  await once(api, 'listening');
  t.after(() => new Promise(resolve => api.close(resolve)));
  const base = `http://127.0.0.1:${api.address().port}`;
  const started = Promise.withResolvers();
  let calls = 0;
  mockGoogle((body, { signal }) => {
    calls++;
    if (calls === 1) return dense(body);
    started.resolve();
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const submit = payload => realFetch(base + '/api/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }).then(response => response.json());
  const payload = { business_type: 'Spice Wholesale', city: 'India', country: 'India', count: 60 };
  const [first, duplicate] = await Promise.all([submit(payload), submit({ ...payload, business_type: '  SPICE   WHOLESALE ' })]);
  assert.ok(first.jobId);
  assert.equal(first.jobId, duplicate.jobId);
  assert.equal(Number(first.reused) + Number(duplicate.reused), 1);
  await started.promise;
  const cancel = await realFetch(base + first.statusUrl + '/cancel', { method: 'POST' });
  assert.equal(cancel.status, 202);
  let job;
  for (let i = 0; i < 20; i++) {
    job = await (await realFetch(base + first.statusUrl)).json();
    if (job.status === 'completed') break;
    await wait(20);
  }
  assert.equal(job.result.placesSummary.terminationReason, 'cancelled');
  assert.equal(job.result.count, 20);
  assert.equal(calls, 2);
  assert.equal(loadLeadsHistory().leads.length, 20);
});

test('default storage keeps independently published contacts and the Place ID, without Google listing fields', async t => {
  fixture(t);
  config.GOOGLE_PLACES_CRM_LICENSED = false;
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  t.mock.method(dns, 'resolveMx', async () => [{ exchange: 'mx.buyer.test', priority: 10 }]);
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('places.googleapis.com')) {
      assert.doesNotMatch(options.headers['X-Goog-FieldMask'], /PhoneNumber/);
      return Response.json({ places: [{ id: 'public-buyer', displayName: { text: 'Google Listing Label' }, formattedAddress: 'Some Google address in Hamburg, Germany', websiteUri: 'https://buyer.test', internationalPhoneNumber: '+91 9999999999' }] });
    }
    const location = new URL(url);
    const html = location.pathname === '/' ? '<meta property="og:site_name" content="Public Site Buyer"><a href="/contact">Contact</a>' : '<a href="mailto:purchasing@buyer.test">Email</a>';
    return new Response(html, { headers: { 'content-type': 'text/html' } });
  };
  const result = await search(1, { city: 'Hamburg', country: 'Germany' });
  assert.equal(result.count, 1);
  const saved = loadLeadsHistory().leads[0];
  assert.equal(saved.id, 'public-buyer');
  assert.equal(saved.name, 'Public Site Buyer');
  assert.equal(saved.email, 'purchasing@buyer.test');
  assert.equal(saved.address, null);
  assert.equal(saved.phone, '—');
  assert.doesNotMatch(JSON.stringify(saved), /Google Listing Label|Some Google address|9999999999/);
});

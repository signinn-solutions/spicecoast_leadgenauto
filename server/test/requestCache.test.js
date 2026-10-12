import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestCache, PAGE_RESOURCES, WORKSPACE_RESOURCES, ADMIN_TAB_RESOURCES, ADMIN_RESOURCES } from '../../frontend/src/requestCache.js';

const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

test('page reads are demand-driven, cached, deduplicated and explicitly refreshable', async () => {
  let time = 0;
  const calls = [];
  const cache = createRequestCache(async key => { calls.push(key); return json({ key }); }, () => {}, { now: () => time });
  const openPage = page => cache.loadMany(PAGE_RESOURCES[page].map(key => WORKSPACE_RESOURCES[key]));
  await openPage('admin');
  assert.deepEqual(calls, [], 'Superadmin must not fetch any workspace endpoints');
  await Promise.all([openPage('search'), openPage('search')]);
  assert.deepEqual(calls, ['/api/status']);
  await openPage('results');
  assert.deepEqual(calls, ['/api/status', '/api/leads']);
  await openPage('results');
  assert.equal(calls.length, 2, 'Reopening a fresh page should reuse data');
  time = 60001;
  assert.equal(calls.length, 2, 'Cache expiration must not initiate background requests');
  await openPage('results');
  assert.equal(calls.length, 4);
  await cache.loadMany(['/api/leads'], { force: true });
  assert.equal(calls.length, 5);
  assert.ok(!calls.some(key => key.includes('mailbox')), 'CRM must not load unrelated mail resources');
});

test('mutations invalidate hidden data without reads and prevent stale in-flight writes', async () => {
  let release;
  const applied = [];
  let calls = 0;
  const cache = createRequestCache(async () => {
    calls += 1;
    if (calls === 1) await new Promise(resolve => { release = resolve; });
    return json({ version: calls });
  }, (key, data) => applied.push(data.version));
  const oldRead = cache.loadMany(['leads']);
  cache.invalidate(['leads', 'lifecycle']);
  assert.equal(calls, 1, 'Invalidation must not trigger hidden-page requests');
  const freshRead = cache.loadMany(['leads']);
  release();
  await Promise.all([oldRead, freshRead]);
  assert.deepEqual(applied, [2], 'Response started before mutation must not overwrite current state');
  assert.equal(calls, 2);
});

test('concurrent refresh clicks share reads and failed resources are retryable', async () => {
  let release;
  let calls = 0;
  const cache = createRequestCache(async () => {
    calls += 1;
    if (calls === 1) await new Promise(resolve => { release = resolve; });
    return json({});
  }, () => {});
  const first = cache.loadMany(['status'], { force: true });
  const second = cache.loadMany(['status'], { force: true });
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  let fails = true;
  const retries = createRequestCache(async () => fails ? new Response('{"error":"Offline"}', { status: 503 }) : json({}), () => {});
  await assert.rejects(retries.loadMany(['status']), /Offline/);
  fails = false;
  await retries.loadMany(['status']);
});

test('admin tabs load only their resources and reuse shared health', async () => {
  const calls = [];
  const cache = createRequestCache(async key => { calls.push(key); return json({}); }, () => {});
  const openTab = tab => cache.loadMany(ADMIN_TAB_RESOURCES[tab].map(key => ADMIN_RESOURCES[key]));
  await openTab('overview');
  assert.deepEqual(calls, [ADMIN_RESOURCES.health, ADMIN_RESOURCES.users, ADMIN_RESOURCES.audit]);
  await openTab('integrations');
  assert.equal(calls.length, 3);
  await openTab('audit');
  assert.equal(calls.at(-1), ADMIN_RESOURCES.audit);
  assert.equal(calls.length, 3);
});

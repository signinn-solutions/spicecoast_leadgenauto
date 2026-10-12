import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import app from '../app.js';
import config from '../config/env.js';
import { hashPassword } from '../middleware/dashboardAuth.js';
import { createUser } from '../services/userService.js';
import { closeStorage, getTodayDateString, saveDailyUsage, saveReplyUsage, loadDailyUsage, loadReplyUsage } from '../services/storageService.js';

test('admin actions persist changes, report failures and revoke changed user sessions', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicecoast-admin-actions-'));
  const original = Object.fromEntries(Object.entries(config).filter(([key]) => Object.getOwnPropertyDescriptor(config, key)?.writable));
  const originalFetch = globalThis.fetch;
  let server;
  try {
    for (const key of ['DB_PATH', 'DAILY_USAGE_FILE', 'REPLY_USAGE_FILE', 'LEADS_HISTORY_FILE', 'SEEN_PLACES_FILE', 'MAILBOX_HISTORY_FILE', 'OUTREACH_HISTORY_FILE']) config[key] = path.join(dir, key);
    config.NODE_ENV = 'production';
    config.ADMIN_EMAIL = 'config-admin@example.test';
    config.ADMIN_PASSWORD_HASH = await hashPassword('Config-admin-test-password');
    config.HOSTINGER_API_TOKEN = '';
    config.GOOGLE_API_KEY = '';
    config.HUNTER_API_KEY = '';
    config.GROQ_API_KEY = '';
    await createUser({ name: 'Test Administrator', email: 'operator@example.test', password: 'Operator-test-password', role: 'superadmin' });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = async (email, password) => {
      const response = await originalFetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      assert.equal(response.status, 200);
      const payload = await response.json();
      return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: payload.csrfToken, user: payload.user };
    };
    const admin = await login('operator@example.test', 'Operator-test-password');
    const request = (route, method = 'GET', body, session = admin) => originalFetch(base + route, {
      method,
      headers: { cookie: session.cookie, 'X-CSRF-Token': session.csrf, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const engine of ['scraper', 'hunter']) {
      const switched = await request('/api/admin/system/engine', 'POST', { engine });
      assert.equal(switched.status, 200);
      const acknowledgement = await switched.json();
      assert.equal(acknowledgement.success, true);
      assert.equal(acknowledgement.discovery_engine, engine);
      assert.equal(acknowledgement.hunter_enabled, engine === 'hunter');
      closeStorage(); // Reopen storage to prove the choice survives beyond the current connection.
      const health = await (await request('/api/admin/system/health')).json();
      assert.equal(health.discovery_engine, engine);
    }
    assert.equal((await request('/api/admin/system/engine', 'POST', { engine: 'typo' })).status, 400);
    const today = getTodayDateString();
    saveDailyUsage(today, 7);
    saveReplyUsage(today, 4);
    assert.equal((await request('/api/admin/system/reset-daily-usage', 'POST', { type: 'leads' })).status, 200);
    assert.equal(loadDailyUsage().count, 0);
    assert.equal(loadReplyUsage().count, 4);
    assert.equal((await request('/api/admin/system/reset-daily-usage', 'POST', { type: 'replies' })).status, 200);
    assert.deepEqual(loadReplyUsage(), { date: today, count: 0 });
    assert.equal((await request('/api/admin/system/reset-daily-usage', 'POST', { type: 'typo' })).status, 400);
    assert.equal((await request('/api/admin/system/reset-hunter-quota', 'POST')).status, 200);

    // No external provider calls, messages, or production user mutations.
    globalThis.fetch = async () => { throw new Error('External requests prohibited in this test'); };
    for (const service of ['google_places', 'hunter', 'groq', 'hostinger']) {
      const response = await request('/api/admin/system/test-connection', 'POST', { service });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).ok, false);
    }
    config.HOSTINGER_API_TOKEN = 'test-only';
    const configCheck = await (await request('/api/admin/system/test-connection', 'POST', { service: 'hostinger' })).json();
    assert.equal(configCheck.verified, false);
    assert.match(configCheck.message, /have not been tested/);
    assert.equal((await request('/api/admin/system/test-connection', 'POST', { service: 'sqlite' })).status, 200);
    config.HUNTER_API_KEY = 'test-only-hunter';
    let discoverAllowed = false;
    globalThis.fetch = async (url, options) => {
      if (String(url).endsWith('/account')) return Response.json({ data: { plan_name: 'Test plan', requests: {} } });
      assert.deepEqual(JSON.parse(options.body), { organization: { domain: ['hunter.io'] } });
      return discoverAllowed ? Response.json({ data: [] }) : Response.json({ errors: [{ id: 'no_discover_access', code: 403 }] }, { status: 403 });
    };
    const noAccess = await (await request('/api/admin/system/test-connection', 'POST', { service: 'hunter' })).json();
    assert.equal(noAccess.authenticated, true);
    assert.equal(noAccess.discover_access, false);
    assert.equal(noAccess.ok, false);
    discoverAllowed = true;
    const access = await (await request('/api/admin/system/test-connection', 'POST', { service: 'hunter' })).json();
    assert.equal(access.discover_access, true);
    assert.equal(access.ok, true);

    const response = await request('/api/admin/users', 'POST', { name: 'Test Buyer', email: 'buyer@example.test', password: 'Buyer-test-password', role: 'user' });
    assert.equal(response.status, 201);
    const user = (await response.json()).user;
    let session = await login(user.email, 'Buyer-test-password');
    for (const route of ['/api/settings/toggle-hunter', '/api/leads/toggle-hunter']) {
      assert.equal((await request(route, 'POST', { enabled: true }, session)).status, 403, 'Only admin can enable optional Hunter');
    }
    await request('/api/admin/system/engine', 'POST', { engine: 'scraper' });
    const override = await request('/api/search', 'POST', { business_type: 'Spice buyers', city: 'Hamburg', country: 'Germany', engine: 'hunter', sync: true }, session);
    assert.equal(override.status, 503);
    assert.match((await override.json()).error, /Google Places/, 'A regular user cannot override the admin-selected scraper engine');
    assert.equal((await request('/api/admin/users', 'GET', undefined, session)).status, 403);
    assert.equal((await request(`/api/admin/users/${user.id}`, 'PUT', { status: 'suspended' })).status, 200);
    assert.equal((await request('/api/leads', 'GET', undefined, session)).status, 401);
    assert.equal((await request(`/api/admin/users/${user.id}`, 'PUT', { status: 'active', role: 'superadmin', name: 'Updated Buyer', notes: 'Updated notes' })).status, 200);
    session = await login(user.email, 'Buyer-test-password');
    assert.equal((await request('/api/admin/users', 'GET', undefined, session)).status, 200);
    assert.equal((await request(`/api/admin/users/${user.id}`, 'PUT', { role: 'user' })).status, 200);
    assert.equal((await request('/api/admin/users', 'GET', undefined, session)).status, 401);
    session = await login(user.email, 'Buyer-test-password');
    assert.equal((await request(`/api/admin/users/${user.id}`, 'PUT', { password: 'New-buyer-test-password' })).status, 200);
    assert.equal((await request('/api/leads', 'GET', undefined, session)).status, 401);
    session = await login(user.email, 'New-buyer-test-password');
    assert.equal((await request(`/api/admin/users/${admin.user.id}`, 'PUT', { status: 'suspended' })).status, 400);
    assert.equal((await request(`/api/admin/users/${user.id}`, 'DELETE')).status, 200);
    assert.equal((await request('/api/leads', 'GET', undefined, session)).status, 401);
    const logs = await (await request('/api/admin/audit-logs')).json();
    for (const action of ['user_created', 'user_updated', 'user_deleted', 'engine_switch', 'daily_usage_reset', 'quota_reset']) assert.ok(logs.logs.some(log => log.action === action), `Missing audit action ${action}`);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    closeStorage();
    globalThis.fetch = originalFetch;
    Object.assign(config, original);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

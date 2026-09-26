import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../app.js';
import config from '../config/env.js';
import { hashPassword } from '../middleware/dashboardAuth.js';

test('single-business dashboard authentication fails closed, protects mutations, and revokes sessions', async () => {
  const original = { ...config };
  config.NODE_ENV = 'production';
  config.ADMIN_EMAIL = '';
  config.ADMIN_PASSWORD_HASH = '';
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options) => fetch(base + path, options);
  try {
    assert.equal((await request('/api/status')).status, 503);
    assert.equal((await request('/api/auth/session')).status, 503);
    config.ADMIN_EMAIL = 'owner@example.test';
    config.ADMIN_PASSWORD_HASH = await hashPassword('test-only-long-password');
    assert.equal((await request('/api/status')).status, 401);
    const login = (password, extra = {}) => request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify({ email: config.ADMIN_EMAIL, password }) });
    assert.equal((await login('wrong')).status, 401);
    assert.equal((await login('test-only-long-password', { Origin: 'https://untrusted.test' })).status, 403);
    const response = await login('test-only-long-password');
    assert.equal(response.status, 200);
    const setCookie = response.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Strict/);
    const cookie = setCookie.split(';')[0];
    const session = await response.json();
    assert.equal(session.authenticated, true);
    assert.ok(session.csrfToken);
    const current = await request('/api/auth/session', { headers: { cookie } });
    assert.equal((await current.json()).authenticated, true);
    assert.equal((await request('/api/mailbox/toggle-autosend', { method: 'POST', headers: { cookie } })).status, 403);
    assert.equal((await request('/api/unknown', { headers: { cookie, Origin: 'https://untrusted.test' } })).status, 403);
    assert.equal((await request('/api/unknown', { headers: { cookie } })).status, 404);
    assert.equal((await request('/api/auth/logout', { method: 'POST', headers: { cookie, 'X-CSRF-Token': session.csrfToken } })).status, 200);
    assert.equal((await request('/api/status', { headers: { cookie } })).status, 401);
    const rotated = await login('test-only-long-password');
    const rotatedCookie = rotated.headers.get('set-cookie').split(';')[0];
    config.ADMIN_PASSWORD_HASH = await hashPassword('replacement-test-password');
    assert.equal((await request('/api/status', { headers: { cookie: rotatedCookie } })).status, 401);
    for (let i = 0; i < 10; i++) await login('wrong');
    assert.equal((await login('wrong')).status, 429);
    const webhook = await request('/webhook');
    assert.deepEqual(await webhook.json(), { status: 'ok', method: 'POST' });
    assert.equal((await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  } finally {
    for (const key of ['NODE_ENV', 'ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH']) config[key] = original[key];
    await new Promise(resolve => server.close(resolve));
  }
});

test('local development bypass is denied for foreign Host and Origin', async () => {
  const original = { ...config };
  Object.assign(config, { NODE_ENV: 'development', ADMIN_EMAIL: '', ADMIN_PASSWORD_HASH: '' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/api/auth/session')).status, 200);
    const foreignHostStatus = await new Promise((resolve, reject) => {
      const request = http.request({
        hostname: '127.0.0.1', port: server.address().port, path: '/api/auth/session',
        headers: { Host: 'untrusted.test' },
      }, (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      });
      request.on('error', reject);
      request.end();
    });
    assert.equal(foreignHostStatus, 503);
    assert.equal((await fetch(base + '/api/unknown', { headers: { Origin: 'https://untrusted.test' } })).status, 403);
  } finally {
    for (const key of ['NODE_ENV', 'ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH']) config[key] = original[key];
    await new Promise(resolve => server.close(resolve));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionConfig } from '../config/production.js';
import { dispatchOnce } from '../services/dispatchGuard.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import config from '../config/env.js';
import { getDatabase, closeStorage } from '../services/storageService.js';
import { seedDefaultUsers, hashUserPassword } from '../services/userService.js';

test('production creates no default users and rejects an existing active development password', async () => {
  const original = { NODE_ENV: config.NODE_ENV, DB_PATH: config.DB_PATH };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicecoast-production-'));
  try {
    config.DB_PATH = path.join(dir, 'test.sqlite');
    config.NODE_ENV = 'production';
    await seedDefaultUsers();
    assert.equal(getDatabase().prepare('SELECT count(*) count FROM users').get().count, 0);
    getDatabase().prepare("INSERT INTO users (id,email,password_hash,name,role,status) VALUES (?,?,?,?,?,?)").run('seed-test', 'admin@signinn.in', await hashUserPassword('Admin@Signinn123'), 'Seed', 'superadmin', 'active');
    await assert.rejects(seedDefaultUsers(), /development default password/);
    getDatabase().prepare("UPDATE users SET status='suspended'").run();
    await assert.doesNotReject(seedDefaultUsers());
  } finally { closeStorage(); Object.assign(config, original); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('production configuration fails closed and development remains available', () => {
  assert.doesNotThrow(() => validateProductionConfig({ NODE_ENV: 'development' }));
  const config = { NODE_ENV: 'production', ADMIN_EMAIL: 'owner@example.test', ADMIN_PASSWORD_HASH: `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}`, GROQ_API_KEY: 'test', DB_PATH: process.cwd() + '/data.sqlite', HOSTINGER_API_TOKEN: 'test', HOSTINGER_SEND_ENDPOINT: 'https://api.mail.hostinger.com/api/v1/mailboxes/ACtest/send', HOSTINGER_WEBHOOK_BEARER_TOKEN: 'test' };
  assert.doesNotThrow(() => validateProductionConfig(config));
  assert.throws(() => validateProductionConfig({ ...config, ADMIN_PASSWORD_HASH: '' }), /ADMIN_PASSWORD_HASH/);
  assert.throws(() => validateProductionConfig({ ...config, HOSTINGER_SEND_ENDPOINT: '' }), /HOSTINGER_MAILBOX_RESOURCE_ID/);
});

test('persisted dispatch states block uncertain retries and permit definitive rejection recovery', async () => {
  const record = {};
  const states = [];
  const persist = () => states.push(record.dispatch.state);
  await assert.rejects(dispatchOnce({ record, persist, send: async () => { throw new Error('connection lost'); } }));
  assert.deepEqual(states, ['sending', 'unknown']);
  let calls = 0;
  await assert.rejects(dispatchOnce({ record, persist, send: async () => { calls++; } }), /unconfirmed/);
  assert.equal(calls, 0);
  record.dispatch.state = 'rejected';
  await dispatchOnce({ record, persist, send: async () => ({ status: 'sent', messageId: 'test-message' }) });
  assert.equal(record.dispatch.messageId, 'test-message');
  assert.equal(record.dispatch.state, 'sent');
  await assert.rejects(dispatchOnce({ record, persist, send: async () => { calls++; } }));
  assert.equal(calls, 0);
});

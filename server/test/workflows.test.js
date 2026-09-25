import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import config from '../config/env.js';
import app from '../app.js';
import { sendEmailViaHostinger } from '../services/mailService.js';
import { processIncomingEmail } from '../services/webhookService.js';
import { extractDomain, isPlaceDuplicate, executeLeadSearch } from '../services/leadFinderService.js';
import { extractMetadataAndDraftReply } from '../services/deepseekService.js';
import {
  getTodayDateString, loadLeadsHistory, saveLeadsHistory, loadOutreachHistory,
  saveOutreachHistory, loadDailyUsage, saveDailyUsage, loadReplyUsage, loadMailboxHistory, saveMailboxHistory,
  loadSeenPlaces, loadAutoSendSetting, saveAutoSendSetting,
  closeStorage,
} from '../services/storageService.js';

test('lead discovery, drafts and quota stay within isolated storage', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicecoast-test-'));
  const names = [
    'DB_PATH', 'DAILY_USAGE_FILE', 'REPLY_USAGE_FILE', 'LEADS_HISTORY_FILE',
    'SEEN_PLACES_FILE', 'MAILBOX_HISTORY_FILE', 'OUTREACH_HISTORY_FILE',
  ];
  const original = Object.fromEntries(names.map((name) => [name, config[name]]));
  const originalKeys = {
    GOOGLE_API_KEY: config.GOOGLE_API_KEY,
    HUNTER_API_KEY: config.HUNTER_API_KEY,
    DEEPSEEK_API_KEY: config.DEEPSEEK_API_KEY,
    DAILY_LEAD_LIMIT: config.DAILY_LEAD_LIMIT,
  };
  const originalFetch = globalThis.fetch;
  try {
    for (const name of names) config[name] = path.join(dir, `${name}.json`);
    config.GOOGLE_API_KEY = '';
    config.HUNTER_API_KEY = '';
    config.DEEPSEEK_API_KEY = '';
    config.DAILY_LEAD_LIMIT = 2;
    globalThis.fetch = () => { throw new Error('Unexpected network request'); };

    assert.equal(extractDomain('https://www.Example.com/path'), 'example.com');
    assert.equal(isPlaceDuplicate({ id: 'a', name: 'Different' }, { a: { name: 'Original' } }), true);
    assert.equal(isPlaceDuplicate({ name: 'Same Company', website: 'https://same.example' }, {}, [
      { name: 'Other', website: 'https://www.same.example/about' },
    ]), true);

    await assert.rejects(
      executeLeadSearch({ businessType: '', city: 'Hamburg', country: 'Germany', requestedCount: 1, mode: 'simulated' }),
      { statusCode: 400 },
    );
    assert.equal(fs.existsSync(config.LEADS_HISTORY_FILE), false);

    const result = await executeLeadSearch({
      businessType: 'spice importer', city: 'Hamburg', country: 'Germany', requestedCount: 2, mode: 'simulated',
    });
    assert.equal(result.mode, 'simulated');
    assert.equal(result.count, 2);
    assert.equal(result.usage.remaining, 0);
    assert.equal(loadDailyUsage().count, 2);
    assert.equal(loadLeadsHistory().leads.length, 2);
    assert.ok(result.leads.every((lead) => lead.source === 'simulated'));
    assert.equal(loadOutreachHistory().length, result.leads.filter((lead) => lead.coldMailDraft).length);

    await assert.rejects(
      executeLeadSearch({ businessType: 'spice importer', city: 'Berlin', country: 'Germany', requestedCount: 1, mode: 'simulated' }),
      { statusCode: 429 },
    );
    assert.equal(loadLeadsHistory().leads.length, 2);
  } finally {
    closeStorage();
    Object.assign(config, original, originalKeys);
    globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('inbound inquiry fallback extracts buying context without sending', async () => {
  const originalKey = config.DEEPSEEK_API_KEY;
  config.DEEPSEEK_API_KEY = '';
  try {
    const result = await extractMetadataAndDraftReply(
      'Urgent quote for black pepper',
      'Please quote 5 MT black pepper CIF Rotterdam.',
      'buyer@example.com',
      'Alex',
    );
    assert.equal(result.metadata.intent, 'Price Quote Inquiry');
    assert.equal(result.metadata.requestedVolume, '5 Metric Tons');
    assert.equal(result.metadata.destinationPort, 'Rotterdam');
    assert.equal(result.metadata.priority, 'High');
    assert.ok(result.metadata.detectedProducts.includes('Malabar Black Pepper'));
    assert.match(result.reply, /Dear Alex/);
  } finally {
    config.DEEPSEEK_API_KEY = originalKey;
  }
});

test('POST send-coldmail rejects a simulated lead before configured transport', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicecoast-send-test-'));
  const original = {
    DB_PATH: config.DB_PATH,
    DAILY_USAGE_FILE: config.DAILY_USAGE_FILE,
    REPLY_USAGE_FILE: config.REPLY_USAGE_FILE,
    LEADS_HISTORY_FILE: config.LEADS_HISTORY_FILE,
    SEEN_PLACES_FILE: config.SEEN_PLACES_FILE,
    MAILBOX_HISTORY_FILE: config.MAILBOX_HISTORY_FILE,
    OUTREACH_HISTORY_FILE: config.OUTREACH_HISTORY_FILE,
    HOSTINGER_API_TOKEN: config.HOSTINGER_API_TOKEN,
  };
  const originalFetch = globalThis.fetch;
  let transportCalls = 0;
  let server;
  try {
    config.DB_PATH = path.join(dir, 'test.sqlite');
    config.DAILY_USAGE_FILE = path.join(dir, 'daily.json');
    config.REPLY_USAGE_FILE = path.join(dir, 'reply.json');
    config.LEADS_HISTORY_FILE = path.join(dir, 'leads.json');
    config.SEEN_PLACES_FILE = path.join(dir, 'seen.json');
    config.MAILBOX_HISTORY_FILE = path.join(dir, 'mailbox.json');
    config.OUTREACH_HISTORY_FILE = path.join(dir, 'outreach.json');
    config.HOSTINGER_API_TOKEN = 'configured-test-token';
    fs.writeFileSync(config.LEADS_HISTORY_FILE, JSON.stringify({
      leads: [{ id: 'sim-1', source: 'simulated', email: 'demo@example.test' }], searches: [],
    }));
    fs.writeFileSync(config.OUTREACH_HISTORY_FILE, JSON.stringify([{
      id: 'outreach-sim-1', leadId: 'sim-1', recipient: 'demo@example.test',
      subject: 'Draft', body: 'Test draft', status: 'pending_review',
    }]));
    globalThis.fetch = async () => {
      transportCalls++;
      throw new Error('Unexpected external transport call');
    };
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const response = await originalFetch(`http://127.0.0.1:${port}/api/mailbox/send-coldmail`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'outreach-sim-1', to: 'demo@example.test', subject: 'Draft', body: 'Test draft' }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /simulated/i);
    assert.equal(transportCalls, 0);
    assert.equal(loadOutreachHistory()[0].status, 'pending_review');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    closeStorage();
    globalThis.fetch = originalFetch;
    Object.assign(config, original);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Hostinger payload preserves cold subject and prefixes replies once', async () => {
  const originalToken = config.HOSTINGER_API_TOKEN;
  const originalFetch = globalThis.fetch;
  const subjects = [];
  try {
    config.HOSTINGER_API_TOKEN = 'configured-test-token';
    globalThis.fetch = async (_url, options) => {
      subjects.push(JSON.parse(options.body).subject);
      return { ok: true, json: async () => ({ status: 'sent' }) };
    };
    await sendEmailViaHostinger('buyer@example.test', 'New spice partnership', 'Hello');
    await sendEmailViaHostinger('buyer@example.test', 'Price inquiry', 'Hello', { reply: true });
    await sendEmailViaHostinger('buyer@example.test', 'Re: Price inquiry', 'Hello', { reply: true });
    assert.deepEqual(subjects, ['New spice partnership', 'Re: Price inquiry', 'Re: Price inquiry']);
  } finally {
    config.HOSTINGER_API_TOKEN = originalToken;
    globalThis.fetch = originalFetch;
  }
});

test('SQLite imports legacy data once, persists changes and preserves rollback files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicecoast-migration-test-'));
  const names = [
    'DB_PATH', 'DAILY_USAGE_FILE', 'REPLY_USAGE_FILE', 'LEADS_HISTORY_FILE',
    'SEEN_PLACES_FILE', 'MAILBOX_HISTORY_FILE', 'OUTREACH_HISTORY_FILE', 'AUTO_SEND',
  ];
  const original = Object.fromEntries(names.map((name) => [name, config[name]]));
  const source = {
    DAILY_USAGE_FILE: { date: getTodayDateString(), count: 7 },
    REPLY_USAGE_FILE: { date: getTodayDateString(), count: 3 },
    LEADS_HISTORY_FILE: { leads: [{ id: 'legacy-1', name: 'Legacy Buyer', source: 'live' }], searches: [{ id: 1 }] },
    SEEN_PLACES_FILE: { legacy: { id: 'legacy', name: 'Seen Buyer' } },
    MAILBOX_HISTORY_FILE: [{ id: 'message-1', status: 'drafted' }],
    OUTREACH_HISTORY_FILE: [{ id: 'outreach-1', status: 'pending_review' }],
  };
  try {
    config.DB_PATH = path.join(dir, 'store.sqlite');
    config.AUTO_SEND = false;
    for (const [key, value] of Object.entries(source)) {
      config[key] = path.join(dir, `${key}.json`);
      fs.writeFileSync(config[key], JSON.stringify(value));
    }
    const originalBytes = Object.fromEntries(Object.keys(source).map((key) => [key, fs.readFileSync(config[key], 'utf8')]));
    assert.equal(loadDailyUsage().count, 7);
    assert.equal(loadReplyUsage().count, 3);
    assert.equal(loadLeadsHistory().leads[0].name, 'Legacy Buyer');
    assert.equal(loadMailboxHistory()[0].id, 'message-1');
    assert.equal(loadOutreachHistory()[0].id, 'outreach-1');
    assert.equal(loadSeenPlaces().legacy.name, 'Seen Buyer');
    assert.equal(loadAutoSendSetting(), false);
    assert.ok(fs.existsSync(config.DB_PATH));

    saveLeadsHistory({ leads: [{ id: 'saved-1', name: 'Saved Buyer' }], searches: [] });
    saveDailyUsage(getTodayDateString(), 9);
    saveAutoSendSetting(true);
    fs.writeFileSync(config.LEADS_HISTORY_FILE, JSON.stringify({ leads: [], searches: [] }));
    const originalDb = config.DB_PATH;
    config.DB_PATH = path.join(dir, 'other.sqlite');
    assert.equal(loadLeadsHistory().leads.length, 0);
    config.DB_PATH = originalDb;
    assert.equal(loadLeadsHistory().leads[0].name, 'Saved Buyer');
    assert.equal(loadDailyUsage().count, 9);
    assert.equal(loadAutoSendSetting(), true);
    for (const key of Object.keys(source)) {
      if (key === 'LEADS_HISTORY_FILE') continue;
      assert.equal(fs.readFileSync(config[key], 'utf8'), originalBytes[key]);
    }
    assert.equal(fs.readFileSync(config.LEADS_HISTORY_FILE, 'utf8'), JSON.stringify({ leads: [], searches: [] }));

    // Rollback can re-import the preserved legacy files after removing this temporary DB.
    config.DB_PATH = path.join(dir, 'other.sqlite');
    loadLeadsHistory();
    fs.writeFileSync(config.LEADS_HISTORY_FILE, originalBytes.LEADS_HISTORY_FILE);
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${originalDb}${suffix}`, { force: true });
    config.DB_PATH = originalDb;
    assert.equal(loadLeadsHistory().leads[0].name, 'Legacy Buyer');
    assert.equal(loadDailyUsage().count, 7);
  } finally {
    closeStorage();
    Object.assign(config, original);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('concurrent lead searches consume only one remaining quota slot', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicecoast-concurrent-leads-'));
  const keys = [
    'DB_PATH', 'DAILY_USAGE_FILE', 'REPLY_USAGE_FILE', 'LEADS_HISTORY_FILE',
    'SEEN_PLACES_FILE', 'MAILBOX_HISTORY_FILE', 'OUTREACH_HISTORY_FILE',
    'GOOGLE_API_KEY', 'HUNTER_API_KEY', 'DEEPSEEK_API_KEY', 'DAILY_LEAD_LIMIT',
  ];
  const original = Object.fromEntries(keys.map((key) => [key, config[key]]));
  const originalFetch = globalThis.fetch;
  try {
    for (const key of keys.filter((key) => key.endsWith('_FILE') || key === 'DB_PATH')) {
      config[key] = path.join(dir, `${key}.db`);
    }
    config.GOOGLE_API_KEY = '';
    config.HUNTER_API_KEY = '';
    config.DEEPSEEK_API_KEY = '';
    config.DAILY_LEAD_LIMIT = 1;
    globalThis.fetch = async () => { throw new Error('Unexpected network call'); };
    const options = { businessType: 'spice importer', city: 'Hamburg', country: 'Germany', requestedCount: 1, mode: 'simulated' };
    const results = await Promise.allSettled([executeLeadSearch(options), executeLeadSearch(options)]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.statusCode === 429).length, 1);
    assert.equal(loadDailyUsage().count, 1);
    assert.equal(loadLeadsHistory().leads.length, 1);
    assert.equal(loadLeadsHistory().searches.length, 1);
  } finally {
    closeStorage();
    Object.assign(config, original);
    globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('concurrent inbound drafts consume one reply slot and preserve mailbox history', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicecoast-concurrent-replies-'));
  const keys = [
    'DB_PATH', 'DAILY_USAGE_FILE', 'REPLY_USAGE_FILE', 'LEADS_HISTORY_FILE',
    'SEEN_PLACES_FILE', 'MAILBOX_HISTORY_FILE', 'OUTREACH_HISTORY_FILE',
    'DEEPSEEK_API_KEY', 'DAILY_REPLY_LIMIT', 'AUTO_SEND',
  ];
  const original = Object.fromEntries(keys.map((key) => [key, config[key]]));
  const originalFetch = globalThis.fetch;
  try {
    for (const key of keys.filter((key) => key.endsWith('_FILE') || key === 'DB_PATH')) {
      config[key] = path.join(dir, `${key}.db`);
    }
    config.DEEPSEEK_API_KEY = '';
    config.DAILY_REPLY_LIMIT = 1;
    config.AUTO_SEND = false;
    globalThis.fetch = async () => { throw new Error('Unexpected network call'); };
    const payload = { from: 'buyer@example.test', subject: 'Black pepper price quote', message: 'Please quote 5 MT CIF Rotterdam.' };
    const results = await Promise.all([
      processIncomingEmail(payload, '', true, false),
      processIncomingEmail({ ...payload, from: 'second@example.test' }, '', true, false),
    ]);
    assert.deepEqual(results.map((r) => r.response.status).sort(), ['blocked', 'drafted']);
    assert.equal(loadReplyUsage().count, 1);
    assert.equal(loadMailboxHistory().length, 1);
    assert.equal(loadMailboxHistory()[0].status, 'drafted');
  } finally {
    closeStorage();
    Object.assign(config, original);
    globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('concurrent sends dispatch each saved draft once', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicecoast-concurrent-send-'));
  const keys = [
    'DB_PATH', 'DAILY_USAGE_FILE', 'REPLY_USAGE_FILE', 'LEADS_HISTORY_FILE',
    'SEEN_PLACES_FILE', 'MAILBOX_HISTORY_FILE', 'OUTREACH_HISTORY_FILE', 'HOSTINGER_API_TOKEN',
  ];
  const original = Object.fromEntries(keys.map((key) => [key, config[key]]));
  const originalFetch = globalThis.fetch;
  let server;
  let providerCalls = 0;
  try {
    for (const key of keys.filter((key) => key.endsWith('_FILE') || key === 'DB_PATH')) {
      config[key] = path.join(dir, `${key}.db`);
    }
    config.HOSTINGER_API_TOKEN = 'configured-test-token';
    saveLeadsHistory({ leads: [{ id: 'live-1', source: 'live', email: 'buyer@example.test' }], searches: [] });
    saveOutreachHistory([{
      id: 'outreach-live-1', leadId: 'live-1', source: 'live', recipient: 'buyer@example.test',
      subject: 'Spice partnership', body: 'Hello buyer', status: 'pending_review',
    }]);
    saveMailboxHistory([{
      id: 'message-1', sender: 'inquiry@example.test', subject: 'Price inquiry',
      draftReply: 'Thank you', status: 'drafted',
    }]);
    globalThis.fetch = async () => {
      providerCalls++;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { ok: true, json: async () => ({ status: 'sent' }) };
    };
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const postTwice = async (route, payload) => Promise.all([1, 2].map(() => originalFetch(`${baseUrl}${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })));

    const outreachResponses = await postTwice('/api/mailbox/send-coldmail', {
      id: 'outreach-live-1', to: 'buyer@example.test', subject: 'Spice partnership', body: 'Hello buyer',
    });
    assert.deepEqual(outreachResponses.map((res) => res.status).sort(), [200, 409]);
    assert.equal(providerCalls, 1);
    assert.equal(loadOutreachHistory()[0].status, 'sent');

    const replyResponses = await postTwice('/api/mailbox/send-draft', {
      id: 'message-1', to: 'inquiry@example.test', subject: 'Price inquiry', reply: 'Thank you',
    });
    assert.deepEqual(replyResponses.map((res) => res.status).sort(), [200, 409]);
    assert.equal(providerCalls, 2);
    assert.equal(loadMailboxHistory()[0].status, 'sent');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    closeStorage();
    Object.assign(config, original);
    globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

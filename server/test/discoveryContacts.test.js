import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import config from '../config/env.js';
import { executeLeadSearch, resetHunterQuotaState } from '../services/leadFinderService.js';
import { closeStorage, loadLeadsHistory, saveLeadsHistory, saveHunterSetting } from '../services/storageService.js';

test('discovery uses POST, saves phone OR email contacts, and exposes failures honestly', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicecoast-contacts-'));
  const original = Object.fromEntries(Object.entries(config).filter(([key]) => Object.getOwnPropertyDescriptor(config, key)?.writable));
  const originalFetch = globalThis.fetch;
  const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  const options = { businessType: 'Spice importer', city: 'Hamburg', country: 'Germany', requestedCount: 3, mode: 'live', engine: 'hunter' };
  try {
    for (const key of ['DB_PATH', 'DAILY_USAGE_FILE', 'REPLY_USAGE_FILE', 'LEADS_HISTORY_FILE', 'SEEN_PLACES_FILE', 'MAILBOX_HISTORY_FILE', 'OUTREACH_HISTORY_FILE']) config[key] = path.join(dir, key);
    config.HUNTER_API_KEY = 'test-only';
    config.GOOGLE_API_KEY = '';
    config.DAILY_LEAD_LIMIT = 200;
    resetHunterQuotaState();
    saveHunterSetting(true);
    globalThis.fetch = async (url, request = {}) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/discover')) {
        assert.equal(request.method, 'POST');
        assert.equal(request.headers['Content-Type'], 'application/json');
        assert.match(JSON.parse(request.body).query, /Hamburg, Germany/);
        return json({ data: [
          { organization: 'Phone Buyer', phone_number: '+49 40 123456' },
          { organization: 'Email Buyer', domain: 'email-buyer.test', emails: ['buyer@email-buyer.test'] },
          { organization: 'No Contact Buyer' },
        ] });
      }
      if (parsed.pathname.endsWith('/email-verifier')) return json({ data: { status: 'unknown' } });
      throw new Error('Unexpected outbound request');
    };
    const result = await executeLeadSearch(options);
    assert.equal(result.count, 2);
    assert.equal(result.contactsMissing, 1);
    assert.equal(result.mode, 'live');
    assert.ok(result.leads.every(lead => lead.source === 'live'));
    assert.equal(result.leads.find(lead => lead.name === 'Phone Buyer').emailStatus, 'not_found');
    assert.equal(result.leads.find(lead => lead.name === 'Email Buyer').emailStatus, 'unknown');
    assert.equal(loadLeadsHistory().leads.length, 2);
    const duplicate = await executeLeadSearch(options);
    assert.equal(duplicate.count, 0);
    assert.equal(duplicate.duplicatesSkipped, 2);
    assert.equal(duplicate.mode, 'live');

    globalThis.fetch = async () => json({}, 403);
    await assert.rejects(executeLeadSearch(options), { statusCode: 502 });
    config.GOOGLE_API_KEY = 'test-only-google';
    let crossedEngine = false;
    globalThis.fetch = async (url) => {
      if (!String(url).includes('hunter.io')) crossedEngine = true;
      return json({}, 403);
    };
    await assert.rejects(executeLeadSearch(options), { statusCode: 502 });
    assert.equal(crossedEngine, false, 'Hunter must not automatically change engines');
    globalThis.fetch = async () => json({ places: [] });
    const empty = await executeLeadSearch({ ...options, engine: 'scraper' });
    assert.equal(empty.count, 0);
    assert.equal(empty.mode, 'live');
    saveHunterSetting(false);
    globalThis.fetch = async (url) => {
      assert.ok(String(url).includes('places.googleapis.com'), 'Search must follow the persisted admin engine');
      return json({ places: [{ id: 'admin-engine-phone', displayName: { text: 'Admin Engine Buyer' }, nationalPhoneNumber: '+49 11122233' }] });
    };
    const { engine, ...defaultOptions } = options;
    assert.equal((await executeLeadSearch(defaultOptions)).count, 1);
    await assert.rejects(executeLeadSearch({ ...options, engine: 'typo' }), { statusCode: 400 });

    saveLeadsHistory({ leads: [{ id: 'legacy', name: 'Legacy Buyer', source: 'hunter', email: 'legacy@buyer.test' }], searches: [] });
    const legacy = loadLeadsHistory().leads[0];
    assert.equal(legacy.source, 'live');
    assert.equal(legacy.discoveryEngine, 'hunter');
  } finally {
    closeStorage();
    Object.assign(config, original);
    globalThis.fetch = originalFetch;
    resetHunterQuotaState();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

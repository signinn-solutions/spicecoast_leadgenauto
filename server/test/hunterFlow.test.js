import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import config from '../config/env.js';
import { searchHunterCompanies, processHunterCompany, resetHunterQuotaState } from '../services/leadFinderService.js';
import { closeStorage, saveHunterSetting } from '../services/storageService.js';

test('Hunter paginates consistently, handles plan limits and selects a verified contact with phone', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicecoast-hunter-flow-'));
  const original = Object.fromEntries(Object.entries(config).filter(([key]) => Object.getOwnPropertyDescriptor(config, key)?.writable));
  const originalFetch = globalThis.fetch;
  const json = (data, status = 200) => Response.json(data, { status });
  try {
    for (const key of ['DB_PATH', 'DAILY_USAGE_FILE', 'REPLY_USAGE_FILE', 'LEADS_HISTORY_FILE', 'SEEN_PLACES_FILE', 'MAILBOX_HISTORY_FILE', 'OUTREACH_HISTORY_FILE']) config[key] = path.join(dir, key);
    config.HUNTER_API_KEY = 'test-only';
    saveHunterSetting(true);
    resetHunterQuotaState();
    let paginationAllowed = true;
    let nextPageCalls = 0;
    globalThis.fetch = async (url, options) => {
      assert.equal(options.headers['X-API-KEY'], 'test-only');
      assert.equal(new URL(url).searchParams.has('api_key'), false);
      assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body);
      if (body.offset === 100) {
        nextPageCalls++;
        assert.deepEqual(body.headquarters_location, { include: [{ country: 'DE' }] });
        assert.equal(body.query, undefined, 'Reuse resolved filters instead of consuming another AI query');
        return paginationAllowed ? json({ data: [{ domain: 'last-buyer.com', organization: 'Last Buyer' }] }) : json({ errors: [{ id: 'pagination_error', code: 400 }] }, 400);
      }
      return json({ data: Array.from({ length: 100 }, (_, index) => ({ domain: `buyer-${index}.com`, organization: `Buyer ${index}` })), meta: { filters: { headquarters_location: { include: [{ country: 'DE' }] } } } });
    };
    const query = { businessType: 'Spice buyers', city: 'Hamburg', country: 'Germany', neededCount: 101 };
    const all = await searchHunterCompanies(query);
    assert.equal(all.companies.length, 101);
    assert.equal(nextPageCalls, 1);
    assert.equal(all.companies[0].address, '');
    assert.equal(all.companies[0].city, '');
    assert.equal(all.companies[0].targetCity, 'Hamburg');
    paginationAllowed = false;
    const limited = await searchHunterCompanies(query);
    assert.equal(limited.companies.length, 100);
    assert.match(limited.warnings[0], /Premium/);

    let pendingCalls = 0;
    const verified = [];
    globalThis.fetch = async url => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/domain-search')) {
        assert.equal(parsed.searchParams.get('limit'), '10');
        return json({ data: { emails: [
          { value: 'sales@buyer.com', confidence: 99 },
          { value: 'sales2@buyer.com', confidence: 80, phone_number: '+49 40 123456', first_name: 'Alex', last_name: 'Buyer' },
        ] } });
      }
      const email = parsed.searchParams.get('email');
      verified.push(email);
      if (email === 'sales@buyer.com') return json({ data: { status: 'invalid' } });
      if (pendingCalls++ === 0) return json({ errors: [{ code: 202, id: 'verification_in_progress' }] }, 202);
      return json({ data: { status: 'valid' } });
    };
    const result = await processHunterCompany({ id: 'buyer', name: 'Buyer', domain: 'buyer.com' }, 0, { cleanCity: 'Hamburg', cleanCountry: 'Germany', cleanType: 'Spice buyers', today: '2026-10-12' });
    assert.equal(result.leadObj.email, 'sales2@buyer.com');
    assert.equal(result.leadObj.emailStatus, 'deliverable');
    assert.equal(result.leadObj.phone, '+49 40 123456');
    assert.equal(result.leadObj.contactName, 'Alex Buyer');
    assert.equal(result.leadObj.address, '');
    assert.deepEqual(verified, ['sales@buyer.com', 'sales2@buyer.com', 'sales2@buyer.com']);
  } finally {
    closeStorage();
    Object.assign(config, original);
    globalThis.fetch = originalFetch;
    resetHunterQuotaState();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

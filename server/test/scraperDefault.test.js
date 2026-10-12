import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import config from '../config/env.js';
import { executeLeadSearch, scrapeEmailsFromWebsite } from '../services/leadFinderService.js';
import { extractPhoneNumbersFromHtml } from '../services/emailScraper.js';
import { closeStorage, loadHunterSetting, loadLeadsHistory } from '../services/storageService.js';

test('default scraper saves website phone and email contacts without any Hunter requests', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicecoast-scraper-default-'));
  const original = Object.fromEntries(Object.entries(config).filter(([key]) => Object.getOwnPropertyDescriptor(config, key)?.writable));
  const originalFetch = globalThis.fetch;
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  t.mock.method(dns, 'resolveMx', async domain => {
    if (domain === 'unknown-buyer.com') throw Object.assign(new Error('Temporary DNS error'), { code: 'SERVFAIL' });
    return [{ exchange: `mail.${domain}`, priority: 10 }];
  });
  const calls = [];
  const html = text => new Response(text, { headers: { 'content-type': 'text/html' } });
  try {
    for (const key of ['DB_PATH', 'DAILY_USAGE_FILE', 'REPLY_USAGE_FILE', 'LEADS_HISTORY_FILE', 'SEEN_PLACES_FILE', 'MAILBOX_HISTORY_FILE', 'OUTREACH_HISTORY_FILE']) config[key] = path.join(dir, key);
    config.GOOGLE_API_KEY = 'test-only';
    config.HUNTER_API_KEY = 'must-never-be-used';
    config.DAILY_LEAD_LIMIT = 200;
    assert.equal(loadHunterSetting(), false, 'New workspaces must default to scraper');
    globalThis.fetch = async url => {
      const parsed = new URL(url);
      calls.push(parsed.href);
      if (parsed.hostname.includes('hunter.io')) throw new Error('Scraper must not call Hunter');
      if (parsed.hostname === 'places.googleapis.com') return Response.json({ places: [
        { id: 'directory-phone', displayName: { text: 'Directory phone' }, nationalPhoneNumber: '+49 1234567' },
        { id: 'website-phone', displayName: { text: 'Website phone' }, websiteUri: 'https://phone-buyer.com' },
        { id: 'website-email', displayName: { text: 'Website email' }, websiteUri: 'https://email-buyer.com' },
        { id: 'unknown-email', displayName: { text: 'Unknown email' }, websiteUri: 'https://unknown-buyer.com' },
        { id: 'blocked-phone', displayName: { text: 'Blocked website phone' }, websiteUri: 'https://blocked-buyer.com', nationalPhoneNumber: '+49 7778889' },
        { id: 'empty', displayName: { text: 'No contacts' } },
      ] });
      if (parsed.pathname === '/robots.txt') return new Response(`User-agent: *\n${parsed.hostname === 'blocked-buyer.com' ? 'Disallow: /' : 'Allow: /'}`, { headers: { 'content-type': 'text/plain' } });
      if (parsed.hostname === 'blocked-buyer.com' || parsed.hostname === 'www.blocked-buyer.com') throw new Error('Robots disallow must prevent page reads');
      if (parsed.hostname === 'phone-buyer.com' && parsed.pathname === '/') return html('<a href="tel:+49%2040%20987654">Call us</a>');
      if (parsed.hostname === 'email-buyer.com' && parsed.pathname === '/') return html('<a href="mailto:info@email-buyer.com">Info</a><a href="/contact">Contact</a>');
      if (parsed.hostname === 'email-buyer.com' && parsed.pathname === '/contact') return html('<a href="mailto:purchasing@email-buyer.com">Procurement</a>');
      if (parsed.hostname === 'unknown-buyer.com' && parsed.pathname === '/') return html('<a href="mailto:sales@unknown-buyer.com">Sales</a>');
      return new Response('', { status: 404 });
    };
    const result = await executeLeadSearch({ businessType: 'Spice buyers', city: 'Hamburg', country: 'Germany', requestedCount: 6 });
    assert.equal(result.count, 5);
    assert.equal(result.contactsMissing, 1);
    assert.equal(loadLeadsHistory().leads.length, 5);
    assert.ok(!calls.some(url => url.includes('hunter.io')));
    const websitePhone = result.leads.find(lead => lead.id === 'website-phone');
    assert.equal(websitePhone.phone, '+49 40 987654');
    const email = result.leads.find(lead => lead.id === 'website-email');
    assert.equal(email.email, 'purchasing@email-buyer.com', 'Do not stop at a generic homepage email');
    assert.equal(email.emailStatus, 'mx_valid');
    assert.equal(email.emailVerification, 'domain_mx');
    assert.equal(result.leads.find(lead => lead.id === 'unknown-email').emailStatus, 'unknown');
    assert.equal(result.leads.find(lead => lead.id === 'blocked-phone').phoneStatus, 'valid');

    calls.length = 0;
    assert.deepEqual(await scrapeEmailsFromWebsite('http://127.0.0.1/private'), []);
    assert.equal(calls.length, 0, 'No unprotected fallback may fetch a private address');
  } finally {
    closeStorage();
    Object.assign(config, original);
    globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('published phone extraction ignores assets and arbitrary numbers', () => {
  assert.deepEqual(extractPhoneNumbersFromHtml('<a href="tel:+49%2040%20123456">Call</a><script>{"telephone":"+49 40 987654"}</script>20261012 <img src="logo123456.png">'), ['+49 40 123456', '+49 40 987654']);
});

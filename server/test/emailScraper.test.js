import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scrapeEmailsForWebsite,
  extractEmailsFromHtml,
  findContactLinks,
  isPrivateIp,
} from '../services/emailScraper.js';
import {
  findEmails,
  verifyEmail,
  scrapeEmailsFromWebsite,
  isHunterQuotaExceeded,
  resetHunterQuotaState,
  setHunterQuotaExceeded,
} from '../services/leadFinderService.js';
import { loadHunterSetting, saveHunterSetting } from '../services/storageService.js';
import config from '../config/env.js';

test('isPrivateIp detects private, loopback, and cloud metadata IPs correctly (SSRF protection)', () => {
  assert.equal(isPrivateIp('127.0.0.1'), true);
  assert.equal(isPrivateIp('10.0.0.1'), true);
  assert.equal(isPrivateIp('172.16.0.1'), true);
  assert.equal(isPrivateIp('172.31.255.255'), true);
  assert.equal(isPrivateIp('192.168.1.1'), true);
  assert.equal(isPrivateIp('169.254.169.254'), true); // AWS/GCP metadata
  assert.equal(isPrivateIp('100.64.0.1'), true); // Carrier-grade NAT
  assert.equal(isPrivateIp('::1'), true);

  assert.equal(isPrivateIp('8.8.8.8'), false);
  assert.equal(isPrivateIp('104.26.10.1'), false);
  assert.equal(isPrivateIp('142.250.190.46'), false);
});

test('extractEmailsFromHtml extracts plain, mailto, obfuscated, and Cloudflare emails', () => {
  const html = `
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Acme Spices",
            "email": "purchasing@acmespices.com"
          }
        </script>
      </head>
      <body>
        <a href="mailto:sales@acmespices.com?subject=Inquiry">Send Orders</a>
        <p>Inquiries: info [at] acmespices [dot] com</p>
        <p>Direct: contact at acmespices dot com</p>
        <!-- Obfuscated tag splitting -->
        <p>Export: export@<span>acmespices.com</span></p>
        <!-- Cloudflare email-protection for orders@acmespices.com with key 0x12 -->
        <!-- orders@acmespices.com: 'o'^0x12=0x7d, 'r'^0x12=0x60, 'd'^0x12=0x76, 'e'^0x12=0x77, 'r'^0x12=0x60, 's'^0x12=0x61, '@'^0x12=0x52, ... -->
        <span data-cfemail="7d121f19180f0e3d1c1e10180e0d141e180e531e1210"></span>
        <img src="logo@2x.png" /> <!-- Ignored bad extension -->
      </body>
    </html>
  `;

  const results = extractEmailsFromHtml(html);
  const emails = results.map((r) => r.email);

  assert.ok(emails.includes('purchasing@acmespices.com'));
  assert.ok(emails.includes('sales@acmespices.com'));
  assert.ok(emails.includes('info@acmespices.com'));
  assert.ok(emails.includes('contact@acmespices.com'));
  assert.ok(emails.includes('export@acmespices.com'));
  assert.ok(!emails.some((e) => e.includes('logo@2x.png')));
});

test('findContactLinks discovers relative and absolute contact links on the same domain', () => {
  const html = `
    <div>
      <a href="/contact-us">Contact Us</a>
      <a href="https://acmespices.com/about">About The Team</a>
      <a href="/wholesale-inquiry">Wholesale Inquiry</a>
      <a href="https://facebook.com/acmespices">Facebook (external)</a>
      <a href="/catalog.pdf">Download Catalog (file)</a>
    </div>
  `;
  const links = findContactLinks(html, 'https://acmespices.com');
  assert.ok(links.includes('https://acmespices.com/contact-us'));
  assert.ok(links.includes('https://acmespices.com/wholesale-inquiry'));
  assert.ok(links.includes('https://acmespices.com/about'));
  assert.ok(!links.some((l) => l.includes('facebook.com')));
  assert.ok(!links.some((l) => l.includes('catalog.pdf')));
});

test('scrapeEmailsForWebsite discovers and ranks emails by spice outreach priority', async () => {
  const originalFetch = globalThis.fetch;
  const mockPages = {
    'https://spicetrade-example.com/': `
      <html>
        <body>
          <h1>Welcome to SpiceTrade Example</h1>
          <p>Email: general@spicetrade-example.com</p>
          <a href="/contact">Get in Touch</a>
        </body>
      </html>
    `,
    'https://spicetrade-example.com/contact': `
      <html>
        <body>
          <h2>Contact Procurement</h2>
          <a href="mailto:purchasing@spicetrade-example.com">Purchasing Team</a>
          <p>Sales: sales@spicetrade-example.com</p>
          <p>Support: support@spicetrade-example.com</p>
        </body>
      </html>
    `,
  };

  globalThis.fetch = async (url) => {
    const u = new URL(url).toString();
    if (u.endsWith('/robots.txt')) {
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'User-agent: *\nDisallow: /admin\n',
      };
    }
    const clean = u.replace(/#.*$/, '');
    if (mockPages[clean]) {
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => mockPages[clean],
      };
    }
    return { ok: false, status: 404 };
  };

  try {
    const res = await scrapeEmailsForWebsite('https://spicetrade-example.com', {
      maxPages: 2,
      checkMx: false,
      allowPrivateHosts: true,
    });

    assert.equal(res.domain, 'spicetrade-example.com');
    assert.ok(res.emails.length >= 3);

    // Tier 1 roles (purchasing, sales) should outscore Tier 2 (general) and low (support)
    const emailsList = res.emails.map((e) => e.email);
    assert.ok(emailsList.includes('purchasing@spicetrade-example.com'));
    assert.ok(emailsList.includes('sales@spicetrade-example.com'));

    const purchasingScore = res.emails.find((e) => e.email === 'purchasing@spicetrade-example.com')?.score;
    const supportScore = res.emails.find((e) => e.email === 'support@spicetrade-example.com')?.score;
    assert.ok(purchasingScore > supportScore, 'Purchasing score must exceed support score');
    assert.equal(res.best?.email, 'purchasing@spicetrade-example.com');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Hunter quota detection does not call Hunter again; scraper can be run independently', async () => {
  const originalFetch = globalThis.fetch;
  const originalHunterKey = config.HUNTER_API_KEY;
  const originalHunterSetting = loadHunterSetting();
  resetHunterQuotaState();

  try {
    saveHunterSetting(true);
    config.HUNTER_API_KEY = 'test_hunter_key';
    assert.equal(isHunterQuotaExceeded(), false);

    // 1. Simulate Hunter returning HTTP 429 Rate / Monthly Quota Limit
    globalThis.fetch = async (url) => {
      if (url.includes('api.hunter.io')) {
        return {
          status: 429,
          ok: false,
          json: async () => ({ errors: [{ id: 'usage_limit_reached', code: 429 }] }),
        };
      }
      return { ok: false };
    };

    const hunterEmails = await findEmails('cardamomworld.com');
    assert.deepEqual(hunterEmails, []);
    assert.equal(isHunterQuotaExceeded(), true);

    // 2. Next call should skip Hunter.io and directly use scraper fallback
    let hunterCalled = false;
    globalThis.fetch = async (url) => {
      if (url.includes('api.hunter.io')) {
        hunterCalled = true;
        return { status: 429, ok: false };
      }
      if (url.includes('cardamomworld.com')) {
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'text/html' }),
          text: async () => '<p>Export: export@cardamomworld.com</p>',
        };
      }
      return { ok: false };
    };

    const emails = await findEmails('cardamomworld.com');
    assert.deepEqual(emails, []);
    assert.equal(hunterCalled, false, 'Hunter should not be called when quota is exceeded');

    // Scraper should successfully discover email
    const fallbackResults = await scrapeEmailsFromWebsite('https://cardamomworld.com', 'cardamomworld.com');
    assert.ok(fallbackResults.length > 0);
    assert.equal(fallbackResults[0].value, 'export@cardamomworld.com');
    assert.equal(fallbackResults[0].source, 'website');
  } finally {
    globalThis.fetch = originalFetch;
    config.HUNTER_API_KEY = originalHunterKey;
    saveHunterSetting(originalHunterSetting);
    resetHunterQuotaState();
  }
});

test('toggling off Hunter API setting completely bypasses Hunter and routes discovery through inbuilt mail scraper', async () => {
  const originalHunterKey = config.HUNTER_API_KEY;
  const originalHunterSetting = loadHunterSetting();
  const originalFetch = globalThis.fetch;

  try {
    config.HUNTER_API_KEY = 'configured_key';
    saveHunterSetting(false);
    assert.equal(loadHunterSetting(), false);

    let hunterCalled = false;
    globalThis.fetch = async (url) => {
      if (url.includes('api.hunter.io')) {
        hunterCalled = true;
        return { ok: true, json: async () => ({ data: { emails: [{ value: 'should-not-be-called@domain.com' }] } }) };
      }
      return { ok: false };
    };

    // findEmails and verifyEmail should bypass Hunter when setting is false
    const hunterEmails = await findEmails('cardamomworld.com');
    assert.deepEqual(hunterEmails, []);
    assert.equal(hunterCalled, false, 'Hunter API must not be called when toggled off');

    const verifyStatus = await verifyEmail('test@cardamomworld.com');
    assert.equal(verifyStatus, 'unknown');
    assert.equal(hunterCalled, false, 'Hunter verification must not be called when toggled off');

    // Re-enabling restores Hunter
    saveHunterSetting(true);
    assert.equal(loadHunterSetting(), true);
  } finally {
    globalThis.fetch = originalFetch;
    config.HUNTER_API_KEY = originalHunterKey;
    saveHunterSetting(originalHunterSetting);
  }
});


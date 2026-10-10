import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import config from '../config/env.js';
import { closeStorage } from '../services/storageService.js';
import { crawlWebsiteContacts, extractPublishedEmails, robotsAllows } from '../services/contactCrawlerService.js';
import { fetchWebsiteResource } from '../services/websiteService.js';
let dir, previous;
beforeEach(() => {
  closeStorage();
  previous = config.DB_PATH;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signinn-crawler-'));
  config.DB_PATH = path.join(dir, 'one.sqlite');
});
afterEach(() => {
  closeStorage();
  config.DB_PATH = previous;
  fs.rmSync(dir, {
    recursive: true,
    force: true
  });
});
const page = (url, body, status = 200) => ({
  url,
  body,
  status,
  type: url.endsWith('/robots.txt') ? 'text/plain' : 'text/html'
});
test('published extraction decodes mailto, entities, obfuscation, split tags, JSON-LD and Cloudflare; rejects junk', () => {
  const email = 'sales@spices.test',
    key = 34,
    hex = key.toString(16) + [...email].map(c => (c.charCodeAt(0) ^ key).toString(16).padStart(2, '0')).join('');
  const html = '<a href="mailto:info%40spices.test?subject=hi">Email</a><p>office&#64;spices&#46;test</p><p>hello [at] spices [dot] test</p><p>trade@<span>spices.test</span></p><span data-cfemail="' + hex + '"></span><script type="application/ld+json">{"email":"orders@spices.test"}</script><script>const email="fake@spices.test"</script><p>logo@2x.png noreply@spices.test a..b@spices.test info@example.com</p>';
  const found = extractPublishedEmails(html, 'https://spices.test/contact', 'spices.test');
  assert.deepEqual(found.map(x => x.value).sort(), ['hello', 'info', 'office', 'orders', 'sales', 'trade'].map(x => x + '@spices.test').sort());
  assert.ok(found.every(x => x.domainMatch && x.sourceUrl.endsWith('/contact')));
  assert.doesNotThrow(() => extractPublishedEmails('&#9999999999999;', 'https://spices.test', 'spices.test'));
});
test('robots supports agent groups, wildcard rules, longest match and allow ties', () => {
  const policy = 'User-agent: *\nDisallow: /\nUser-agent: SigninnContactBot\nDisallow: /private*\nAllow: /private/contact$\nDisallow: /same\nAllow: /same';
  assert.equal(robotsAllows(policy, 'https://spices.test/'), true);
  assert.equal(robotsAllows(policy, 'https://spices.test/private/contact'), true);
  assert.equal(robotsAllows(policy, 'https://spices.test/private/contact/more'), false);
  assert.equal(robotsAllows(policy, 'https://spices.test/same'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /', 'https://spices.test/'), false);
});
test('crawler follows linked contacts despite a homepage email and excludes external or disallowed pages', async () => {
  const calls = [];
  const fetchResource = async (url, options) => {
    calls.push(url);
    assert.equal(await options.allowUrl(new URL(url)), true);
    if (url.endsWith('/robots.txt')) return page(url, 'User-agent: *\nDisallow: /private');
    if (url === 'https://spices.test/') return page(url, 'support@spices.test <a href="/enquiries">Contact us</a><a href="https://evil.test/contact">Contact</a><a href="/private/contact">Contact</a>');
    if (url.endsWith('/enquiries')) return page(url, 'sales@spices.test');
    return page(url, '', 404);
  };
  const result = await crawlWebsiteContacts('https://spices.test/', {
    fetchResource,
    delayMs: 0,
    useCache: false
  });
  assert.equal(result.emails[0].value, 'sales@spices.test');
  assert.equal(result.emails[0].sourceUrl, 'https://spices.test/enquiries');
  assert.equal(result.pagesFetched, 2);
  assert.ok(result.blocked > 0);
  assert.ok(calls.every(url => !url.includes('evil') && !url.includes('/private')));
  assert.ok(calls.length <= 7);
});
test('robots denial and unavailable policies fail closed; absent robots permits crawling', async () => {
  for (const status of [401, 403, 429, 503]) {
    const calls = [];
    const result = await crawlWebsiteContacts('https://spices.test/', {
      useCache: false,
      delayMs: 0,
      fetchResource: async url => {
        calls.push(url);
        return page(url, '', status);
      }
    });
    assert.equal(result.emails.length, 0);
    assert.equal(calls.length, 1);
  }
  const denied = await crawlWebsiteContacts('https://spices.test/', {
    useCache: false,
    fetchResource: async url => page(url, 'User-agent: *\nDisallow: /')
  });
  assert.equal(denied.pagesFetched, 0);
  const absent = await crawlWebsiteContacts('https://spices.test/', {
    useCache: false,
    maxPages: 1,
    delayMs: 0,
    fetchResource: async url => page(url, url.endsWith('/robots.txt') ? '' : 'info@spices.test', url.endsWith('/robots.txt') ? 404 : 200)
  });
  assert.equal(absent.emails.length, 1);
});
test('redirect policy rejects private and off-site redirects and disallowed destination paths', async () => {
  await crawlWebsiteContacts('https://spices.test/', {
    useCache: false,
    delayMs: 0,
    maxPages: 1,
    fetchResource: async (url, opts) => {
      if (url.endsWith('/robots.txt')) return page(url, 'User-agent: *\nDisallow: /secret');
      for (const dest of ['http://127.0.0.1/contact', 'https://other.test/contact', 'https://spices.test/secret', 'http://spices.test/contact']) assert.equal(await opts.allowUrl(new URL(dest)), false);
      assert.equal(await opts.allowUrl(new URL('https://www.spices.test/contact')), true);
      return page(url, 'sales@spices.test');
    }
  });
  await assert.rejects(fetchWebsiteResource('http://127.0.0.1'));
  await assert.rejects(fetchWebsiteResource('https://spices.test/', {
    allowUrl: () => false
  }));
});
test('cache is bounded to the tenant database and avoids repeated crawl requests', async () => {
  let calls = 0;
  const fetchResource = async url => {
    calls++;
    return page(url, url.endsWith('/robots.txt') ? '' : 'info@spices.test', url.endsWith('/robots.txt') ? 404 : 200);
  };
  const opts = {
    fetchResource,
    maxPages: 1,
    delayMs: 0
  };
  await crawlWebsiteContacts('https://spices.test/', opts);
  const again = await crawlWebsiteContacts('https://spices.test/', opts);
  assert.equal(again.cached, true);
  assert.equal(calls, 2);
  config.DB_PATH = path.join(dir, 'two.sqlite');
  const other = await crawlWebsiteContacts('https://spices.test/', opts);
  assert.equal(other.cached, false);
  assert.equal(calls, 4);
});
test('whole-crawl deadline cancels fetches and page limits cap requests', async () => {
  const result = await crawlWebsiteContacts('https://spices.test/', {
    useCache: false,
    budgetMs: 30,
    fetchResource: async (url, {
      signal
    }) => url.endsWith('/robots.txt') ? page(url, '', 404) : new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(page(url, '')), 500);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(signal.reason);
      }, {
        once: true
      });
    })
  });
  assert.equal(result.reason, 'time_budget');
  assert.equal(result.pagesFetched, 0);
  let count = 0;
  await crawlWebsiteContacts('https://spices.test/', {
    useCache: false,
    maxPages: 1,
    delayMs: 0,
    fetchResource: async url => {
      count++;
      return page(url, '<a href="/contact">Contact</a>');
    }
  });
  assert.equal(count, 2);
});

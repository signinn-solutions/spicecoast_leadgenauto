import { fetchWebsiteResource } from './websiteService.js';
import { getDatabase } from './storageService.js';
const BAD_DOMAINS = new Set(['example.com', 'domain.com', 'yourdomain.com', 'email.com', 'sentry.io', 'wixpress.com', 'schema.org', 'wordpress.org', 'cloudflare.com', 'googleapis.com', 'gravatar.com', 'github.com', 'google.com']);
const CONTACT = /contact|about|team|company|impressum|kontakt|enquir|reach|locations/i;
const ASSET = /\.(?:png|jpe?g|gif|svg|webp|css|js|woff2?|ttf|eot|ico|pdf|zip)(?:$|\?)/i;
const normalizeHost = host => host.toLowerCase().replace(/^www\./, '');
export function decodeEntities(text) {
  return String(text).replace(/&#(x[0-9a-f]+|\d+);?/gi, (_m, n) => {
    const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/&(amp|commat|period|quot|apos|lt|gt|nbsp);/gi, (_m, n) => ({
    amp: '&',
    commat: '@',
    period: '.',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
    nbsp: ' '
  })[n.toLowerCase()]);
}
export function extractPublishedEmails(html, sourceUrl, domain) {
  let text = String(html).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script\b(?![^>]*type\s*=\s*["']application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  text = decodeEntities(text);
  const decoded = [];
  text = text.replace(/data-cfemail\s*=\s*["']([a-f0-9]+)["']/gi, (_m, hex) => {
    if (hex.length % 2 || hex.length < 4) return '';
    const key = parseInt(hex.slice(0, 2), 16);
    decoded.push(hex.slice(2).match(/../g).map(pair => String.fromCharCode(parseInt(pair, 16) ^ key)).join(''));
    return '';
  });
  text = text.replace(/mailto:([^"'<>\s]+)/gi, (_m, value) => {
    try {
      return ' ' + decodeURIComponent(value).split('?')[0] + ' ';
    } catch {
      return '';
    }
  });
  text = text.replace(/<\/?(?:span|b|strong|em|i|u|font|wbr|small|mark|abbr)\b[^>]*>/gi, '');
  text = text.replace(/\s*(?:\[at\]|\(at\))\s*/gi, '@').replace(/\s*(?:\[dot\]|\(dot\))\s*/gi, '.');
  text += ' ' + decoded.join(' ');
  const found = new Map();
  for (const match of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}/gi)) {
    const value = match[0].toLowerCase();
    const [local, host] = value.split('@');
    if (value.length > 254 || local.length > 64 || local.includes('..') || local.startsWith('.') || local.endsWith('.') || ASSET.test(value) || host.split('.').some(part => !part || part.startsWith('-') || part.endsWith('-')) || [...BAD_DOMAINS].some(b => host === b || host.endsWith('.' + b)) || /^(?:no-?reply|donotreply)@/.test(value)) continue;
    found.set(value, {
      value,
      source: 'website',
      sourceUrl,
      method: 'published',
      domainMatch: normalizeHost(host) === normalizeHost(domain)
    });
  }
  return [...found.values()];
}
export function robotsAllows(text, target, agent = 'signinncontactbot') {
  const groups = [];
  let current = null;
  let hasRules = false;
  for (const line of String(text).split(/\r?\n/)) {
    const clean = line.split('#')[0].trim();
    const sep = clean.indexOf(':');
    if (sep < 0) continue;
    const key = clean.slice(0, sep).trim().toLowerCase(),
      value = clean.slice(sep + 1).trim();
    if (key === 'user-agent') {
      if (!current || hasRules) {
        current = {
          agents: [],
          rules: []
        };
        groups.push(current);
        hasRules = false;
      }
      current.agents.push(value.toLowerCase());
    } else if (current && ['allow', 'disallow', 'crawl-delay'].includes(key)) {
      hasRules = true;
      current.rules.push({
        key,
        value
      });
    }
  }
  const matching = groups.map(g => ({
    ...g,
    score: Math.max(-1, ...g.agents.map(a => a === '*' ? 0 : agent.includes(a) ? a.length : -1))
  })).filter(g => g.score >= 0);
  const best = Math.max(-1, ...matching.map(g => g.score));
  let winner = null;
  const path = new URL(target).pathname + new URL(target).search;
  for (const group of matching.filter(g => g.score === best)) for (const rule of group.rules) {
    if (rule.key === 'crawl-delay') continue;
    if (!rule.value) continue;
    const anchored = rule.value.endsWith('$');
    const raw = anchored ? rule.value.slice(0, -1) : rule.value;
    const pattern = '^' + raw.split('*').map(p => p.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&')).join('.*') + (anchored ? '$' : '');
    if (new RegExp(pattern).test(path)) {
      const length = Buffer.byteLength(raw.replace(/\*/g, ''));
      if (!winner || length > winner.length || length === winner.length && rule.key === 'allow') winner = {
        ...rule,
        length
      };
    }
  }
  return !winner || winner.key === 'allow';
}
function cacheTable() {
  const db = getDatabase();
  db.exec('CREATE TABLE IF NOT EXISTS contact_cache (url TEXT PRIMARY KEY, expires INTEGER NOT NULL, report TEXT NOT NULL)');
  return db;
}
export async function crawlWebsiteContacts(input, {
  fetchResource = fetchWebsiteResource,
  useCache = true,
  maxPages = 6,
  budgetMs = 15000,
  delayMs = 200
} = {}) {
  let initial;
  try {
    initial = new URL(/^https?:\/\//i.test(input) ? input : 'https://' + input);
    if (!['http:', 'https:'].includes(initial.protocol) || initial.username || initial.password) return {
      emails: [],
      reason: 'invalid_url',
      pagesFetched: 0
    };
    initial.hash = '';
  } catch {
    return {
      emails: [],
      reason: 'invalid_url',
      pagesFetched: 0
    };
  }
  const db = useCache ? cacheTable() : null;
  const cached = db?.prepare('SELECT report FROM contact_cache WHERE url=? AND expires>?').get(initial.href, Date.now());
  if (cached) return {
    ...JSON.parse(cached.report),
    cached: true
  };
  const signal = AbortSignal.timeout(Math.max(1, Math.min(budgetMs, 15000)));
  const domain = normalizeHost(initial.hostname),
    policies = new Map();
  const visited = new Set(),
    emails = new Map();
  let pagesFetched = 0,
    blocked = 0,
    failures = 0,
    pauseMs = Math.max(0, delayMs);
  const inScope = url => normalizeHost(url.hostname) === domain && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && (!url.port || ['80', '443'].includes(url.port)) && !(initial.protocol === 'https:' && url.protocol === 'http:');
  const permitted = async url => {
    if (!inScope(url)) return false;
    if (!policies.has(url.origin)) {
      try {
        const res = await fetchResource(url.origin + '/robots.txt', {
          signal,
          allowUrl: next => inScope(next) && next.origin === url.origin
        });
        if (res.status === 200) for (const match of res.body.matchAll(/^\s*crawl-delay\s*:\s*(\d+(?:\.\d+)?)\s*(?:#.*)?$/gim)) pauseMs = Math.max(pauseMs, Number(match[1]) * 1000);
        policies.set(url.origin, res.status === 404 || res.status === 410 ? '' : res.status === 200 ? res.body : null);
      } catch {
        policies.set(url.origin, null);
      }
    }
    const policy = policies.get(url.origin);
    return policy !== null && robotsAllows(policy, url.href);
  };
  const queue = [initial.href];
  let seeded = false;
  while (queue.length && visited.size < Math.max(1, Math.min(maxPages, 6)) && !signal.aborted) {
    const page = queue.shift();
    if (visited.has(page)) continue;
    visited.add(page);
    try {
      if (!(await permitted(new URL(page)))) {
        blocked++;
        continue;
      }
      const res = await fetchResource(page, {
        signal,
        allowUrl: permitted
      });
      if (res.status !== 200 || res.type && !/(text\/html|application\/xhtml)/i.test(res.type)) {
        failures++;
        continue;
      }
      const finalUrl = new URL(res.url || page);
      if (!(await permitted(finalUrl))) {
        blocked++;
        continue;
      }
      pagesFetched++;
      visited.add(finalUrl.href);
      for (const item of extractPublishedEmails(res.body, finalUrl.href, domain)) if (!emails.has(item.value)) emails.set(item.value, item);
      const links = [];
      for (const m of res.body.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        if (!CONTACT.test(m[1] + ' ' + m[2].replace(/<[^>]*>/g, ''))) continue;
        try {
          const url = new URL(decodeEntities(m[1]), finalUrl);
          url.hash = '';
          if (inScope(url) && !ASSET.test(url.pathname) && !url.search && !visited.has(url.href)) links.push(url.href);
        } catch {}
      }
      queue.unshift(...[...new Set(links)].slice(0, 12));
      if (!seeded) {
        seeded = true;
        queue.push(...['/contact', '/contact-us', '/about', '/impressum'].map(path => new URL(path, finalUrl).href));
      }
      if (queue.length && pauseMs > 0) await new Promise(resolve => {
        const timer = setTimeout(done, Math.min(pauseMs, 15000));
        function done() {
          clearTimeout(timer);
          signal.removeEventListener('abort', done);
          resolve();
        }
        signal.addEventListener('abort', done, {
          once: true
        });
        if (signal.aborted) done();
      });
    } catch {
      failures++;
    }
  }
  const priority = value => /^(info|contact|sales|hello|office|enquir(?:y|ies))@/.test(value) ? 1 : 0;
  const report = {
    emails: [...emails.values()].sort((a, b) => Number(b.domainMatch) - Number(a.domainMatch) || priority(b.value) - priority(a.value) || a.value.localeCompare(b.value)).slice(0, 20),
    pagesFetched,
    blocked,
    failures,
    reason: signal.aborted ? 'time_budget' : pagesFetched ? 'completed' : blocked ? 'robots_or_scope_blocked' : 'unavailable',
    checkedAt: new Date().toISOString(),
    cached: false
  };
  if (db) {
    db.prepare('DELETE FROM contact_cache WHERE expires<?').run(Date.now());
    db.prepare('INSERT INTO contact_cache(url,expires,report) VALUES(?,?,?) ON CONFLICT(url) DO UPDATE SET expires=excluded.expires,report=excluded.report').run(initial.href, Date.now() + (report.emails.length ? 7 * 86400000 : 3600000), JSON.stringify(report));
    db.prepare('DELETE FROM contact_cache WHERE url IN (SELECT url FROM contact_cache ORDER BY expires DESC LIMIT -1 OFFSET 2000)').run();
  }
  return report;
}

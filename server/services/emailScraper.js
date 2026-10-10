/**
 * emailScraper.js — free-first email discovery for a business website.
 *
 * Zero dependencies. Needs Node 18+ (global fetch, AbortSignal.timeout).
 *
 * USAGE (from your Express service):
 *   import { scrapeEmailsForWebsite } from './emailScraper.js';
 *   const r = await scrapeEmailsForWebsite('https://www.example-spices.com');
 *   // r.best -> { email, confidence, score, source, type, sameDomain, hasMx, pages }
 *   // r.emails -> every candidate, best first
 *
 * WATERFALL (suggested):
 *   1. r = scrapeEmailsForWebsite(site)
 *   2. if (r.best && r.best.hasMx !== false) -> use it (still verify before sending)
 *   3. else -> fall back to the paid finder (Hunter etc.)
 *
 * CLI test:  node emailScraper.js https://some-business-site.com
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULTS = {
  maxPages: 4,              // homepage + up to 3 contact-type pages
  timeoutMs: 8000,
  maxBytes: 1_500_000,      // stop reading a page after ~1.5 MB
  maxRedirects: 3,
  delayMs: 400,             // pause between pages of the same site
  userAgent: 'Mozilla/5.0 (compatible; SpiceCoastBot/1.0; +https://thespicecoast.com)',
  botToken: 'spicecoastbot',// matched against robots.txt User-agent lines
  respectRobots: true,
  checkMx: true,
  allowPrivateHosts: false, // keep false in production (SSRF guard); true only for local tests
};

/* ------------------------------------------------------------------ */
/* Static lists                                                        */
/* ------------------------------------------------------------------ */

// Common generic TLDs. Any 2-letter TLD is also accepted (country codes).
const GTLDS = new Set([
  'com', 'net', 'org', 'info', 'biz', 'edu', 'gov', 'mil', 'int', 'name', 'pro', 'mobi',
  'asia', 'tel', 'travel', 'coop', 'aero', 'museum', 'shop', 'store', 'online', 'site',
  'tech', 'app', 'dev', 'xyz', 'top', 'club', 'trade', 'trading', 'global', 'group',
  'company', 'foods', 'food', 'farm', 'organic', 'market', 'supply', 'exchange',
  'international', 'agency', 'business', 'solutions', 'services', 'email', 'cloud',
  'digital', 'world', 'today',
]);

// File extensions that look like TLDs inside strings such as "logo@2x.png"
const BAD_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js', 'json', 'woff', 'woff2', 'ttf',
  'eot', 'ico', 'pdf', 'mp4', 'mp3', 'map', 'ts', 'php', 'html', 'htm', 'xml', 'txt', 'zip',
]);

const JUNK_DOMAINS = [
  'example.com', 'example.org', 'example.net', 'domain.com', 'yourdomain.com',
  'yourcompany.com', 'yoursite.com', 'mysite.com', 'email.com', 'test.com', 'sentry.io',
  'wixpress.com', 'schema.org', 'w3.org',
];

// Placeholder-looking local parts and addresses that can never be a sales contact
const JUNK_LOCALS = new Set([
  'your', 'name', 'yourname', 'user', 'username', 'email', 'youremail', 'johndoe',
  'john.doe', 'jane.doe', 'firstname.lastname', 'first.last', 'test', 'someone', 'xxx',
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'postmaster',
  'abuse', 'hostmaster', 'unsubscribe', 'bounce', 'bounces',
]);

const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.in', 'yahoo.co.in', 'yahoo.co.uk',
  'hotmail.com', 'outlook.com', 'live.com', 'rediffmail.com', 'aol.com', 'icloud.com',
  'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'web.de',
]);

// Role words that suggest a buying/selling contact (best for B2B spice outreach)
const ROLE_TIER1 = new Set([
  'purchase', 'purchasing', 'procurement', 'buying', 'buyer', 'buyers', 'import', 'imports',
  'export', 'exports', 'sales', 'order', 'orders', 'trade', 'trading', 'commercial',
  'business', 'enquiry', 'enquiries', 'inquiry', 'inquiries', 'supply', 'sourcing', 'wholesale',
]);
const ROLE_TIER2 = new Set(['info', 'contact', 'hello', 'office', 'admin', 'mail', 'team', 'general']);
const ROLE_LOW = new Set([
  'support', 'help', 'service', 'customercare', 'accounts', 'accounting', 'billing', 'finance',
  'invoice', 'hr', 'careers', 'jobs', 'press', 'media', 'marketing', 'legal', 'security',
  'webmaster', 'privacy', 'dpo', 'gdpr', 'copyright',
]);

const SOURCE_BASE = { mailto: 40, cloudflare: 40, jsonld: 35, text: 25, obfuscated: 20 };

const CONTACT_LINK_RE =
  /(contact|kontakt|contacto|contatto|contactez|reach-?us|get-?in-?touch|enquir|inquir|impressum|imprint|legal-?notice|mentions-?legales|aviso-?legal|about|team|company|wholesale|export|import|trade)/i;
const CONTACT_PAGE_RE = /(contact|kontakt|contacto|contatto|contactez|impressum|imprint|enquir|inquir|get-?in-?touch)/i;
const SKIP_LINK_EXT_RE = /\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|pptx?|mp4|mp3)(\?|$)/i;

/* ------------------------------------------------------------------ */
/* Safety: block requests to private / internal addresses (SSRF)       */
/* ------------------------------------------------------------------ */

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l.startsWith('::ffff:') && net.isIPv4(l.slice(7))) return isPrivateIp(l.slice(7));
    return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
  }
  return true;
}

async function assertPublicHost(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('blocked private address');
    return;
  }
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
      throw new Error('blocked private address');
    }
  } catch (e) {
    if (e.message === 'blocked private address') throw e;
    // Allow non-resolving mock hostnames in test environment or offline execution
    if (process.env.NODE_ENV === 'test' || e.code === 'ENOTFOUND') {
      return;
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* Fetching                                                            */
/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readCapped(res, maxBytes) {
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
      if (total >= maxBytes) {
        await reader.cancel();
        break;
      }
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
  }
  if (typeof res.text === 'function') {
    return await res.text();
  }
  return '';
}

async function fetchText(url, opts, typeRe = /text\/html|application\/xhtml/i) {
  let current = url;
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    const u = new URL(current);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('unsupported protocol');
    if (!opts.allowPrivateHosts) await assertPublicHost(u.hostname);

    const res = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(opts.timeoutMs),
      headers: {
        'user-agent': opts.userAgent,
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
        'accept-language': 'en',
      },
    });

    const loc = res.headers?.get ? res.headers.get('location') : null;
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers?.get ? (res.headers.get('content-type') || '') : '';
    if (type && !typeRe.test(type)) throw new Error(`unexpected content-type: ${type || 'none'}`);
    return { text: await readCapped(res, opts.maxBytes), finalUrl: current };
  }
  throw new Error('too many redirects');
}

/* ------------------------------------------------------------------ */
/* robots.txt (simplified: User-agent groups, Allow/Disallow prefixes) */
/* ------------------------------------------------------------------ */

function parseRobots(txt, botToken) {
  const star = [];
  const bot = [];
  let group = [];
  let collecting = false;
  for (const raw of String(txt || '').split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (collecting) { group = []; collecting = false; }
      group.push(val.toLowerCase());
    } else if (key === 'allow' || key === 'disallow') {
      collecting = true;
      if (!val) continue; // empty Disallow = allow everything
      const rule = { allow: key === 'allow', path: val };
      if (group.includes('*')) star.push(rule);
      if (group.some((a) => a !== '*' && botToken.includes(a))) bot.push(rule);
    }
  }
  return bot.length ? bot : star;
}

function robotsAllows(rules, pathname) {
  let best = null;
  for (const r of rules) {
    if (pathname.startsWith(r.path) && (!best || r.path.length > best.path.length)) best = r;
  }
  return !best || best.allow;
}

/* ------------------------------------------------------------------ */
/* Email extraction                                                    */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /[a-z0-9][a-z0-9._%+\-]*@[a-z0-9\-]+(?:\.[a-z0-9\-]+)*\.[a-z0-9]{2,24}/gi;

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', commat: '@', period: '.', lowbar: '_',
};

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED_ENTITIES[n.toLowerCase()] ?? m);
}

function visibleText(html) {
  const noBlocks = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ');
  // Inline tags vanish (so "info@<span>acme.com</span>" stays intact); other tags become spaces.
  const flat = noBlocks
    .replace(/<\/?(?:span|b|strong|em|i|u|font|wbr|small|a|mark|abbr)\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(flat).replace(/\s+/g, ' ');
}

function deobfuscate(text) {
  return String(text || '')
    .replace(/\s*[[({<]\s*(?:at|@)\s*[\])}>]\s*/gi, '@')
    .replace(/\s*[[({<]\s*dot\s*[\])}>]\s*/gi, '.')
    .replace(
      /\b([a-z0-9._%+-]+)\s+at\s+([a-z0-9-]+(?:\s+dot\s+[a-z0-9-]+)+)\b/gi,
      (_, local, domain) => `${local}@${domain.replace(/\s+dot\s+/gi, '.')}`,
    );
}

function decodeCloudflare(hex) {
  if (!/^[0-9a-f]{4,}$/i.test(hex) || hex.length % 2) return '';
  const key = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

function collectJsonLdEmails(node, cb) {
  if (Array.isArray(node)) return node.forEach((n) => collectJsonLdEmails(n, cb));
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k.toLowerCase() === 'email' && typeof v === 'string') cb(v.replace(/^mailto:/i, ''));
      else collectJsonLdEmails(v, cb);
    }
  }
}

const validTld = (t) => !BAD_EXT.has(t) && (t.length === 2 || GTLDS.has(t));
const domainMatches = (d, list) => list.some((x) => d === x || d.endsWith(`.${x}`));

/** Returns a normalized email string, or null if it's invalid / junk. */
function cleanEmail(raw) {
  let e = String(raw).trim().toLowerCase().replace(/^[<"'([\s]+|[>"')\].,;:\s]+$/g, '');
  if ((e.match(/@/g) || []).length !== 1) return null;
  const [local, domain0] = e.split('@');
  if (!local || local.length > 64 || /\.\./.test(local) || /^\.|\.$/.test(local)) return null;

  // Trim trailing labels until the TLD is plausible ("acme.com.contact" -> "acme.com")
  const labels = domain0.split('.');
  while (labels.length > 2 && !validTld(labels[labels.length - 1])) labels.pop();
  if (labels.length < 2 || !validTld(labels[labels.length - 1])) return null;
  if (labels.some((l) => !l || l.length > 63 || /^-|-$/.test(l))) return null;
  const domain = labels.join('.');

  if (domain.length > 253) return null;
  if (JUNK_LOCALS.has(local) || domainMatches(domain, JUNK_DOMAINS)) return null;
  return `${local}@${domain}`;
}

/** Pulls every email-looking address out of one HTML page, tagged by how it was found. */
export function extractEmailsFromHtml(html) {
  const hits = [];
  const add = (raw, source) => {
    const email = cleanEmail(raw);
    if (email) hits.push({ email, source });
  };

  const rawHtml = String(html || '');
  for (const m of rawHtml.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)) add(decodeCloudflare(m[1]), 'cloudflare');
  for (const m of rawHtml.matchAll(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi)) add(decodeCloudflare(m[1]), 'cloudflare');

  for (const m of rawHtml.matchAll(/href\s*=\s*["']\s*mailto:([^"'>]+)/gi)) {
    let v = decodeEntities(m[1]);
    try { v = decodeURIComponent(v); } catch { /* keep raw */ }
    v.split('?')[0].split(/[;,]/).forEach((x) => add(x, 'mailto'));
  }

  for (const m of rawHtml.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectJsonLdEmails(JSON.parse(m[1].trim()), (e) => add(e, 'jsonld')); } catch { /* bad JSON */ }
  }

  const text = visibleText(rawHtml);
  const plain = new Set();
  for (const m of text.matchAll(EMAIL_RE)) {
    const e = cleanEmail(m[0]);
    if (e) { plain.add(e); hits.push({ email: e, source: 'text' }); }
  }
  const deob = deobfuscate(text);
  if (deob !== text) {
    for (const m of deob.matchAll(EMAIL_RE)) {
      const e = cleanEmail(m[0]);
      if (e && !plain.has(e)) hits.push({ email: e, source: 'obfuscated' });
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ */
/* Finding contact-type pages on the same site                         */
/* ------------------------------------------------------------------ */

const stripWww = (h) => (h || '').replace(/^www\./, '');

export function findContactLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const scored = new Map();
  const rawHtml = String(html || '');
  for (const m of rawHtml.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeEntities(m[1]).trim();
    if (/^(mailto:|tel:|javascript:|data:)/i.test(href) || SKIP_LINK_EXT_RE.test(href)) continue;
    let u;
    try { u = new URL(href, base); } catch { continue; }
    if (!['http:', 'https:'].includes(u.protocol)) continue;
    if (stripWww(u.hostname) !== stripWww(base.hostname)) continue; // same site only
    const label = m[2].replace(/<[^>]+>/g, ' ');
    const haystack = `${u.pathname} ${label}`;
    if (!CONTACT_LINK_RE.test(haystack)) continue;
    const score = CONTACT_PAGE_RE.test(haystack) ? 2 : 1; // contact/impressum before about/team
    u.hash = '';
    const key = u.toString();
    if (u.pathname === base.pathname || key === base.toString()) continue;
    scored.set(key, Math.max(scored.get(key) ?? 0, score));
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([url]) => url);
}

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

const sameSite = (emailDomain, siteHost) => {
  const a = stripWww(emailDomain);
  const b = stripWww(siteHost);
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
};

function classifyLocal(local) {
  const bare = (local || '').replace(/[0-9]+$/, '');
  if (ROLE_TIER1.has(bare)) return { type: 'generic', bonus: 25 };
  if (ROLE_TIER2.has(bare)) return { type: 'generic', bonus: 12 };
  if (ROLE_LOW.has(bare)) return { type: 'generic', bonus: -15 };
  return { type: 'personal', bonus: 10 }; // unknown local part: likely a named mailbox
}

function scoreCandidate(c, siteHost) {
  const [local, domain] = c.email.split('@');
  const { type, bonus } = classifyLocal(local);
  const sameDomain = sameSite(domain, siteHost);
  const freemail = FREEMAIL.has(domain);

  const bestSourceScore = Math.max(...[...c.sources].map((s) => SOURCE_BASE[s] ?? 0));
  let score = bestSourceScore + bonus;
  score += sameDomain ? 30 : freemail ? 5 : -10;
  if ([...c.pages].some((p) => {
    try { return CONTACT_PAGE_RE.test(new URL(p).pathname); } catch { return false; }
  })) score += 10;
  score += Math.min(10, (c.pages.size - 1) * 5);

  return { type, sameDomain, freemail, score };
}

const confidenceOf = (score) => (score >= 85 ? 'high' : score >= 55 ? 'medium' : 'low');

/* ------------------------------------------------------------------ */
/* MX check                                                            */
/* ------------------------------------------------------------------ */

const mxCache = new Map();

/** true = domain can receive mail, false = it can't, null = lookup inconclusive. */
async function domainCanReceiveMail(domain) {
  if (process.env.NODE_ENV === 'test') return true;
  if (mxCache.has(domain)) return mxCache.get(domain);
  let ok;
  try {
    const mx = await dns.resolveMx(domain);
    ok = mx.some((r) => r.exchange && r.exchange !== '.'); // "null MX" (RFC 7505) = no mail
  } catch (e) {
    if (e.code === 'ENODATA' || e.code === 'ENOTFOUND') {
      try {
        const a = await dns.resolve4(domain);
        ok = a.length > 0;
      } catch {
        ok = false;
      } // implicit MX
    } else {
      ok = null; // timeout / server failure: don't punish the address
    }
  }
  mxCache.set(domain, ok);
  return ok;
}

/* ------------------------------------------------------------------ */
/* Main entry                                                          */
/* ------------------------------------------------------------------ */

function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) throw new Error('empty URL');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  u.hash = '';
  return u.toString();
}

export async function scrapeEmailsForWebsite(website, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const result = { website, domain: null, pagesChecked: [], emails: [], best: null, errors: [] };

  let startUrl;
  try {
    startUrl = normalizeUrl(website);
  } catch {
    result.errors.push('invalid website URL');
    return result;
  }
  result.domain = stripWww(new URL(startUrl).hostname);

  let robotsRules = null;
  if (opts.respectRobots) {
    try {
      const { text } = await fetchText(new URL('/robots.txt', startUrl).toString(), opts, /text\//i);
      robotsRules = parseRobots(text, opts.botToken);
    } catch { /* no robots.txt or unreachable: proceed */ }
  }

  const found = new Map(); // email -> { email, sources:Set, pages:Set }
  const visited = new Set();
  const queue = [startUrl];
  let siteHost = result.domain;
  let firstPage = true;

  while (queue.length && result.pagesChecked.length < opts.maxPages) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    if (robotsRules && !robotsAllows(robotsRules, new URL(url).pathname)) {
      result.errors.push(`robots.txt disallows ${new URL(url).pathname}`);
      continue;
    }

    try {
      const { text: html, finalUrl } = await fetchText(url, opts);
      result.pagesChecked.push(finalUrl);

      for (const hit of extractEmailsFromHtml(html)) {
        const entry = found.get(hit.email) ?? { email: hit.email, sources: new Set(), pages: new Set() };
        entry.sources.add(hit.source);
        entry.pages.add(finalUrl);
        found.set(hit.email, entry);
      }

      if (firstPage) {
        firstPage = false;
        siteHost = stripWww(new URL(finalUrl).hostname); // follow redirects like acme.com -> acme-group.com
        result.domain = siteHost;
        const links = findContactLinks(html, finalUrl);
        const origin = new URL(finalUrl).origin;
        queue.push(...(links.length ? links : [`${origin}/contact`, `${origin}/contact-us`]));
      }
    } catch (e) {
      result.errors.push(`${url}: ${e.message}`);
    }
    if (queue.length) await sleep(opts.delayMs);
  }

  const candidates = [...found.values()].map((c) => {
    const s = scoreCandidate(c, siteHost);
    return {
      email: c.email,
      source: [...c.sources].sort((a, b) => (SOURCE_BASE[b] ?? 0) - (SOURCE_BASE[a] ?? 0))[0],
      type: s.type,
      sameDomain: s.sameDomain,
      freemail: s.freemail,
      score: s.score,
      confidence: confidenceOf(s.score),
      hasMx: null,
      pages: [...c.pages],
    };
  });

  if (opts.checkMx) {
    const domains = [...new Set(candidates.map((c) => c.email.split('@')[1]))];
    const mx = new Map(await Promise.all(domains.map(async (d) => [d, await domainCanReceiveMail(d)])));
    for (const c of candidates) {
      c.hasMx = mx.get(c.email.split('@')[1]);
      if (c.hasMx === false) c.score -= 60; // domain can't receive mail: effectively unusable
      c.confidence = confidenceOf(c.score);
    }
  }

  result.emails = candidates.sort((a, b) => b.score - a.score).slice(0, 10);
  result.best = result.emails.find((c) => c.hasMx !== false) ?? null;
  return result;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const site = process.argv[2];
  if (!site) {
    console.error('Usage: node emailScraper.js https://business-website.com');
    process.exit(1);
  }
  scrapeEmailsForWebsite(site).then((r) => console.log(JSON.stringify(r, null, 2)));
}

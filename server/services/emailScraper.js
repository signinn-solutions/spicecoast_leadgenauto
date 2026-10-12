/**
 * emailScraper.js (v2) — free-first email discovery for a business website.
 *
 * Zero dependencies. Needs Node 18+ (global fetch, AbortSignal.timeout).
 *
 * USAGE:
 *   import { scrapeEmailsForWebsite } from './emailScraper.js';
 *   const r = await scrapeEmailsForWebsite('https://www.example-spices.com');
 *   r.best                // top candidate or null
 *   r.status              // WHY it worked or failed (see STATUS below)
 *   r.failure             // { kind, detail, hint } when status !== 'ok'
 *   r.fallbackRecommended // true -> hand this lead to the paid finder
 *   r.attempts            // every request made: url, status, ms, emails found
 *
 * STATUS values:
 *   ok                   best email found
 *   no_usable_email      emails found, but their domains can't receive mail
 *   no_email_found       site read fine, but lists no email address
 *   contact_form_only    only a contact form (no address published)
 *   likely_js_rendered   page content is built by JavaScript; raw HTML is an empty shell
 *   blocked_by_site      site refuses automated requests (403/429/challenge)
 *   robots_disallowed    robots.txt forbids fetching the page
 *   unreachable          DNS / TLS / timeout / HTTP error: site down or misconfigured
 *   not_a_business_site  the "website" is a social or directory page
 *   rejected_address     points at a private/internal address (safety block)
 *   invalid_url
 *
 * CLI test:  node emailScraper.js https://some-business-site.com
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULTS = {
  maxPages: 6,              // pages successfully read per site (homepage + contact-type pages)
  maxAttempts: 12,          // hard cap on requests per site, including guesses that 404
  timeoutMs: 10000,         // 10s is plenty; 15s was stalling on dead hosts
  retries: 1,               // one retry on timeout / connection reset / 5xx
  maxBytes: 3_000_000,      // footers (where emails live) sit at the END of big pages
  maxRedirects: 4,
  delayMs: 300,             // pause between pages of the same site
  userAgent: 'Mozilla/5.0 (compatible; SpiceCoastBot/1.0; +https://thespicecoast.com)',
  botToken: 'spicecoastbot',
  respectRobots: true,
  checkMx: true,
  allowPrivateHosts: false, // keep false in production (SSRF guard); true only in tests
  earlyExit: true,          // stop crawling as soon as a high-confidence on-domain email is found
};

/* ------------------------------------------------------------------ */
/* Static lists                                                        */
/* ------------------------------------------------------------------ */

// Common generic TLDs. Any 2-letter TLD is accepted too (country codes).
// Unlisted TLDs are still accepted when the email is on the site's OWN domain.
const GTLDS = new Set([
  'com', 'net', 'org', 'info', 'biz', 'edu', 'gov', 'mil', 'int', 'name', 'pro', 'mobi',
  'asia', 'tel', 'travel', 'coop', 'aero', 'museum', 'shop', 'store', 'online', 'site',
  'tech', 'app', 'dev', 'xyz', 'top', 'club', 'trade', 'trading', 'global', 'group',
  'company', 'foods', 'food', 'farm', 'organic', 'market', 'supply', 'exchange',
  'international', 'agency', 'business', 'solutions', 'services', 'email', 'cloud',
  'digital', 'world', 'today', 'live', 'life', 'one', 'space', 'website', 'network',
  'systems', 'zone', 'center', 'bio', 'eco', 'link', 'page', 'direct', 'express',
  'delivery', 'catering', 'restaurant', 'cafe', 'coffee',
]);

const BAD_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js', 'json', 'woff', 'woff2', 'ttf',
  'eot', 'ico', 'pdf', 'mp4', 'mp3', 'map', 'ts', 'php', 'html', 'htm', 'xml', 'txt', 'zip',
]);

const JUNK_DOMAINS = [
  'example.com', 'example.org', 'example.net', 'domain.com', 'yourdomain.com',
  'yourcompany.com', 'yoursite.com', 'mysite.com', 'email.com', 'test.com', 'sentry.io',
  'wixpress.com', 'schema.org', 'w3.org', 'wix.com', 'squarespace.com', 'weebly.com',
  'shopify.com', 'wordpress.org', 'wordpress.com', 'gravatar.com', 'godaddy.com',
  'cloudflare.com', 'googleapis.com', 'jquery.com', 'bootstrapcdn.com', 'fontawesome.com',
];

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

// Social / directory pages that Google Places sometimes lists as the "website"
const NOT_BUSINESS_SITES = [
  'facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com',
  'youtube.com', 'youtu.be', 'tiktok.com', 'pinterest.com', 'wa.me', 'whatsapp.com',
  'linktr.ee', 'google.com', 'goo.gl', 'g.page', 'yelp.com', 'tripadvisor.com',
  'yellowpages.com', 'justdial.com', 'indiamart.com', 'tradeindia.com', 'exportersindia.com',
  'alibaba.com', 'made-in-china.com', 'europages.com', 'kompass.com',
];

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

const SOURCE_BASE = { mailto: 40, cloudflare: 40, jsonld: 35, text: 25, obfuscated: 20, script: 15 };

// "contact" in many languages/scripts (Latin words are matched anywhere in the URL or link text)
const CONTACT_WORDS =
  'contact|contatt|contato|contacto|kontakt|kontak|contactez|iletisim|iletişim|reach-?us|get-?in-?touch|enquir|inquir|impressum|imprint|legal-?notice|mentions-?legales|aviso-?legal|联系|聯絡|聯繫|お問い合わせ|連絡|문의|اتصل|تواصل|контакт|संपर्क|ติดต่อ|liên\\s?hệ';
const ABOUT_WORDS =
  'about|team|company|wholesale|export|import|trade|ueber-?uns|uber-?uns|chi-?siamo|quienes-?somos|a-?propos|sobre|hakkimizda|关于|關於|من-?نحن';
const CONTACT_LINK_RE = new RegExp(`(${CONTACT_WORDS}|${ABOUT_WORDS})`, 'i');
const CONTACT_PAGE_RE = new RegExp(`(${CONTACT_WORDS})`, 'i');
const SKIP_LINK_EXT_RE = /\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|pptx?|mp4|mp3)(\?|$)/i;
const HTML_TYPE_RE = /text\/html|application\/xhtml/i;

const STATUS_HINTS = {
  no_usable_email: 'Emails were found but their domains cannot receive mail. Use the paid finder.',
  no_email_found: 'The site loaded fine but does not publish an email address. Use the paid finder.',
  contact_form_only: 'The site only offers a contact form. Use the paid finder.',
  likely_js_rendered:
    'Page content is built in the browser by JavaScript, so the raw HTML is an empty shell. Use the paid finder (or add a headless browser later).',
  blocked_by_site:
    'The site refuses automated requests. Use the paid finder; do not try to bypass the block.',
  robots_disallowed: 'robots.txt forbids fetching this page. Respect it and use the paid finder.',
  unreachable: 'The site could not be loaded (DNS / TLS / timeout / HTTP error). Often a dead or misconfigured website.',
  not_a_business_site: 'The listed "website" is a social or directory page, not the business\'s own site.',
  rejected_address: 'The URL points at a private/internal address and was blocked for safety.',
  invalid_url: 'The website value is not a valid URL.',
};

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
  const addrs = await dns.lookup(hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error('blocked private address');
  }
  // Residual risk: DNS rebinding between this check and fetch(). Acceptable for an
  // internal tool that only scrapes URLs coming from Google Places.
}

/* ------------------------------------------------------------------ */
/* Fetching, with classified errors                                    */
/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripWww = (h) => h.replace(/^www\./, '');
const domainMatches = (d, list) => list.some((x) => d === x || d.endsWith(`.${x}`));

class FetchError extends Error {
  constructor(kind, message, status = null) {
    super(message);
    this.kind = kind; // timeout | dns | tls | connection | blocked | http_error | not_html | private | unsupported | redirect_loop
    this.status = status;
  }
}

function classifyFetchError(e) {
  if (e instanceof FetchError) return e;
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return new FetchError('timeout', 'request timed out');
  const code = e?.cause?.code || e?.code || '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new FetchError('dns', `DNS lookup failed (${code})`);
  if (/CERT|SSL|TLS|ALTNAME/i.test(code)) return new FetchError('tls', `TLS/certificate problem (${code})`);
  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') return new FetchError('timeout', `connection timed out (${code})`);
  if (code) return new FetchError('connection', `connection failed (${code})`);
  return new FetchError('connection', e?.message || 'fetch failed');
}

async function readCapped(res, maxBytes) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    if (typeof res.text === 'function') {
      const full = await res.text();
      return full.slice(0, maxBytes);
    }
    return '';
  }
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

const discard = async (res) => { try { await res.body?.cancel(); } catch { /* ignore */ } };

async function fetchOnce(url, opts, { typeRe = HTML_TYPE_RE, sniff = true } = {}) {
  let current = url;
  const t0 = Date.now();
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    const u = new URL(current);
    if (!['http:', 'https:'].includes(u.protocol)) throw new FetchError('unsupported', 'unsupported protocol');
    if (!opts.allowPrivateHosts) {
      try {
        await assertPublicHost(u.hostname);
      } catch (e) {
        throw e.message === 'blocked private address' ? new FetchError('private', 'blocked private address') : classifyFetchError(e);
      }
    }

    let res;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(opts.timeoutMs),
        headers: {
          'user-agent': opts.userAgent,
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
          'accept-language': 'en',
        },
      });
    } catch (e) {
      throw classifyFetchError(e);
    }

    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      await discard(res);
      current = new URL(loc, current).toString();
      continue;
    }
    if (res.headers.get('cf-mitigated')) {
      await discard(res);
      throw new FetchError('blocked', 'Cloudflare challenge page', res.status);
    }
    if ([401, 403, 429].includes(res.status)) {
      await discard(res);
      throw new FetchError('blocked', `HTTP ${res.status} (site refuses automated access)`, res.status);
    }
    if (!res.ok) {
      await discard(res);
      throw new FetchError('http_error', `HTTP ${res.status}`, res.status);
    }

    const contentType = res.headers.get('content-type') || '';
    let text;
    try {
      text = await readCapped(res, opts.maxBytes);
    } catch (e) {
      throw classifyFetchError(e);
    }
    const typeOk = typeRe.test(contentType);
    // Some servers send no/wrong content-type for perfectly good HTML: sniff the body.
    const sniffOk =
      sniff && (!contentType || /octet-stream|text\/plain/i.test(contentType)) &&
      /<\s*(html|head|body|!doctype)/i.test(text.slice(0, 2048));
    if (!typeOk && !sniffOk) throw new FetchError('not_html', `unexpected content-type: ${contentType || 'none'}`, res.status);
    return { text, finalUrl: current, status: res.status, ms: Date.now() - t0 };
  }
  throw new FetchError('redirect_loop', 'too many redirects');
}

/** fetchOnce + one retry for transient problems (timeouts, resets, 5xx). */
async function fetchText(url, opts, extra) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOnce(url, opts, extra);
    } catch (e) {
      const retryable = ['timeout', 'connection'].includes(e.kind) || (e.kind === 'http_error' && e.status >= 500);
      if (!retryable || attempt >= opts.retries) throw e;
      await sleep(opts.retryDelayMs ?? 800);
    }
  }
}

/* ------------------------------------------------------------------ */
/* robots.txt (simplified: User-agent groups, Allow/Disallow prefixes) */
/* ------------------------------------------------------------------ */

function parseRobots(txt, botToken) {
  const star = [];
  const bot = [];
  let group = [];
  let collecting = false;
  for (const raw of txt.split(/\r?\n/)) {
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
      if (!val) continue;
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

const LOCAL_CH = /[a-z0-9._%+\-]/i;
const DOMAIN_CH = /[a-z0-9.\-]/i;
const MAX_CANDIDATES = 3000;

/**
 * Linear-time email candidate finder. Walks outward from each '@' (max 64 chars left,
 * 254 right) instead of running one big regex, which goes quadratic on long unbroken
 * runs such as base64 blobs or minified JavaScript.
 */
function* emailCandidates(s) {
  let i = -1;
  let n = 0;
  while (n < MAX_CANDIDATES && (i = s.indexOf('@', i + 1)) !== -1) {
    let a = i;
    while (a > 0 && i - a < 64 && LOCAL_CH.test(s[a - 1])) a--;
    let b = i + 1;
    while (b < s.length && b - i < 254 && DOMAIN_CH.test(s[b])) b++;
    const local = s.slice(a, i).replace(/^[^a-z0-9]+/i, '');
    const domain = s.slice(i + 1, b);
    if (local && domain) { n++; yield `${local}@${domain}`; }
  }
}

/** Only the stretches of text around "[at]" / "dot" markers get the heavier de-obfuscation regexes. */
function deobfuscateWindows(text) {
  const marker = /\bdot\b|[[({<]\s*(?:at|@)\s*[\])}>]/gi;
  const windows = [];
  for (const m of text.matchAll(marker)) {
    if (windows.length >= 200) break;
    const start = Math.max(0, m.index - 80);
    const end = Math.min(text.length, m.index + 120);
    const last = windows.at(-1);
    if (last && start <= last[1]) last[1] = end;
    else windows.push([start, end]);
  }
  return windows.map(([a, b]) => deobfuscate(text.slice(a, b))).join(' ');
}
const FINAL_EMAIL_RE = /^[a-z0-9][a-z0-9._%+\-]*@[a-z0-9\-]+(?:\.[a-z0-9\-]+)+$/;

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', commat: '@', period: '.', lowbar: '_', colon: ':',
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Math.min(parseInt(d, 10), 0x10ffff)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED_ENTITIES[n.toLowerCase()] ?? m);
}

function visibleText(html) {
  const noBlocks = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ');
  // Inline tags vanish (so "info@<span>acme.com</span>" stays intact); other tags become spaces.
  const flat = noBlocks
    .replace(/<\/?(?:span|b|strong|em|i|u|font|wbr|small|a|mark|abbr)\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(flat).replace(/\s+/g, ' ');
}

function deobfuscate(text) {
  return text
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

/** Normalizes an email string, or returns null if invalid / junk. siteHost enables lenient TLDs for the site's own domain. */
function cleanEmail(raw, siteHost) {
  const e = String(raw).trim().toLowerCase().replace(/^[<"'([\s]+|[>"')\].,;:\s]+$/g, '');
  if ((e.match(/@/g) || []).length !== 1) return null;
  const [local, domain0] = e.split('@');
  if (!local || local.length > 64 || /\.\./.test(local) || /^\.|\.$/.test(local)) return null;

  const labels = domain0.split('.');
  const onSite = siteHost && (stripWww(domain0) === siteHost || domain0.endsWith(`.${siteHost}`));
  if (!onSite) {
    // Trim trailing labels until the TLD is plausible ("acme.com.contact" -> "acme.com")
    while (labels.length > 2 && !validTld(labels[labels.length - 1])) labels.pop();
    if (labels.length < 2 || !validTld(labels[labels.length - 1])) return null;
  } else if (labels.length < 2) {
    return null;
  }
  if (labels.some((l) => !l || l.length > 63 || /^-|-$/.test(l))) return null;
  const domain = labels.join('.');
  if (domain.length > 253) return null;
  if (BAD_EXT.has(labels[labels.length - 1])) return null;
  if (JUNK_LOCALS.has(local) || domainMatches(domain, JUNK_DOMAINS)) return null;

  const out = `${local}@${domain}`;
  return FINAL_EMAIL_RE.test(out) ? out : null;
}

/** Pulls every email-looking address out of one HTML page, tagged by how it was found. */
export function extractEmailsFromHtml(html, { siteHost = null } = {}) {
  const hits = [];
  const add = (raw, source) => {
    const email = cleanEmail(raw, siteHost);
    if (email) hits.push({ email, source });
  };

  for (const m of html.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)) add(decodeCloudflare(m[1]), 'cloudflare');
  for (const m of html.matchAll(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi)) add(decodeCloudflare(m[1]), 'cloudflare');

  // Decode entities on the WHOLE html first: some sites encode even the "mailto:" word.
  const decodedHtml = decodeEntities(html);
  for (const m of decodedHtml.matchAll(/href\s*=\s*["']\s*mailto:([^"'>]+)/gi)) {
    let v = m[1];
    try { v = decodeURIComponent(v); } catch { /* keep raw */ }
    v.split('?')[0].split(/[;,]/).forEach((x) => add(x, 'mailto'));
  }

  for (const m of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectJsonLdEmails(JSON.parse(m[1].trim()), (e) => add(e, 'jsonld')); } catch { /* bad JSON */ }
  }

  const text = visibleText(html);
  const plain = new Set();
  for (const c of emailCandidates(text)) {
    const e = cleanEmail(c, siteHost);
    if (e) { plain.add(e); hits.push({ email: e, source: 'text' }); }
  }
  for (const c of emailCandidates(deobfuscateWindows(text))) {
    const e = cleanEmail(c, siteHost);
    if (e && !plain.has(e)) hits.push({ email: e, source: 'obfuscated' });
  }

  // Site builders (Wix, Next.js, ...) often keep the contact email only inside script JSON.
  const scripts = [...html.matchAll(/<script\b(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1])
    .join(' ')
    .replace(/\\u0040|\\x40/gi, '@')
    .replace(/\\u002e|\\x2e/gi, '.');
  for (const c of emailCandidates(scripts)) add(c, 'script');

  return hits;
}

/* ------------------------------------------------------------------ */
/* Finding contact-type pages                                          */
/* ------------------------------------------------------------------ */

export function findContactLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const scored = new Map();
  let seen = 0;
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["'][^>]*>/gi)) {
    if (++seen > 3000) break;
    // Label = the text right after the opening tag, up to </a> or 300 chars (keeps this linear
    // even on broken pages with thousands of unclosed anchors).
    const after = html.slice(m.index + m[0].length, m.index + m[0].length + 300);
    const closeAt = after.search(/<\/a/i);
    m[2] = closeAt === -1 ? after : after.slice(0, closeAt);
    const href = decodeEntities(m[1]).trim();
    if (/^(mailto:|tel:|javascript:|data:)/i.test(href) || SKIP_LINK_EXT_RE.test(href)) continue;
    let u;
    try { u = new URL(href, base); } catch { continue; }
    if (!['http:', 'https:'].includes(u.protocol)) continue;
    if (stripWww(u.hostname) !== stripWww(base.hostname)) continue; // same site only
    const label = m[2].replace(/<[^>]+>/g, ' ');
    let pathName = u.pathname;
    try { pathName = decodeURIComponent(pathName); } catch { /* keep encoded */ }
    const haystack = `${pathName} ${label}`;
    if (!CONTACT_LINK_RE.test(haystack)) continue;
    const score = CONTACT_PAGE_RE.test(haystack) ? 2 : 1; // contact/impressum before about/team
    u.hash = '';
    const key = u.toString();
    if (u.pathname === base.pathname) continue;
    scored.set(key, Math.max(scored.get(key) ?? 0, score));
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([url]) => url);
}

/** Tiny "redirect pages": <meta http-equiv=refresh> or window.location = '...'. */
function findClientRedirect(html, baseUrl) {
  const meta = html.match(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["']?\s*\d+\s*;\s*url\s*=\s*([^"'>\s]+)/i);
  const js = html.match(/(?:window\.|document\.|top\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']|location\.replace\(\s*["']([^"']+)["']\s*\)/i);
  const target = meta?.[1] || js?.[1] || js?.[2];
  if (!target) return null;
  try { return new URL(decodeEntities(target), baseUrl).toString(); } catch { return null; }
}

const BUILDER_RE = /id=["'](?:root|__next|app|__nuxt)["']|ng-app|data-reactroot|__NUXT__|static\.parastorage\.com|wixstatic\.com|squarespace\.com/i;
const looksLikeJsShell = (html) => visibleText(html).length < 500 && /<script/i.test(html) && BUILDER_RE.test(html);
const hasContactForm = (html) => /<form\b/i.test(html) && /<textarea\b/i.test(html);

async function contactUrlsFromSitemap(origin, siteHost, opts, allowed) {
  const grab = async (u) => {
    if (!(await allowed(u))) throw new Error('robots');
    const r = await fetchText(u, { ...opts, retries: 0 }, { typeRe: /xml|text\//i, sniff: false });
    return [...r.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]));
  };
  const sameHost = (l) => { try { return stripWww(new URL(l).hostname) === siteHost; } catch { return false; } };
  try {
    let locs = await grab(`${origin}/sitemap.xml`);
    const children = locs.filter((l) => /\.xml(\?|$)/i.test(l) && sameHost(l));
    if (children.length) locs = await grab(children.find((c) => /page/i.test(c)) ?? children[0]);
    return locs
      .filter((l) => sameHost(l) && CONTACT_PAGE_RE.test(new URL(l).pathname))
      .slice(0, 2);
  } catch {
    return [];
  }
}

const guessedPaths = (origin, siteHost) => {
  const paths = ['/contact', '/contact-us', '/contactus', '/about', '/about-us'];
  if (/\.(de|at|ch)$/.test(siteHost)) paths.push('/impressum', '/kontakt');
  return paths.map((p) => origin + p);
};

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

const sameSite = (emailDomain, siteHost) => {
  const a = stripWww(emailDomain);
  const b = stripWww(siteHost);
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
};

function classifyLocal(local) {
  const bare = local.replace(/[0-9]+$/, '');
  if (ROLE_TIER1.has(bare)) return { type: 'generic', bonus: 25 };
  if (ROLE_TIER2.has(bare)) return { type: 'generic', bonus: 12 };
  if (ROLE_LOW.has(bare)) return { type: 'generic', bonus: -15 };
  return { type: 'personal', bonus: 10 };
}

function scoreCandidate(c, siteHost) {
  const [local, domain] = c.email.split('@');
  const { type, bonus } = classifyLocal(local);
  const sameDomain = sameSite(domain, siteHost);
  const freemail = FREEMAIL.has(domain);

  const bestSourceScore = Math.max(...[...c.sources].map((s) => SOURCE_BASE[s] ?? 0));
  let score = bestSourceScore + bonus;
  score += sameDomain ? 30 : freemail ? 5 : -10;
  if ([...c.pages].some((p) => CONTACT_PAGE_RE.test(new URL(p).pathname))) score += 10;
  score += Math.min(10, (c.pages.size - 1) * 5);
  return { type, sameDomain, freemail, score };
}

const confidenceOf = (score) => (score >= 85 ? 'high' : score >= 55 ? 'medium' : 'low');

function hasHighConfidenceCandidate(found, siteHost) {
  for (const c of found.values()) {
    const s = scoreCandidate(c, siteHost);
    if (s.score >= 80 && s.sameDomain) return true;
  }
  return false;
}

const mxCache = new Map();

/** true = domain can receive mail, false = it can't, null = lookup inconclusive. */
async function domainCanReceiveMail(domain) {
  if (mxCache.has(domain)) return mxCache.get(domain);
  let ok;
  try {
    const mx = await dns.resolveMx(domain);
    ok = mx.some((r) => r.exchange && r.exchange !== '.');
  } catch (e) {
    if (e.code === 'ENODATA' || e.code === 'ENOTFOUND') {
      try { ok = (await dns.resolve4(domain)).length > 0; } catch { ok = false; }
    } else {
      ok = null;
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

/** https<->http and www<->bare variants: many small sites only work on one of them. */
function homepageVariants(url) {
  const flip = (x) => { const v = new URL(x); v.protocol = v.protocol === 'https:' ? 'http:' : 'https:'; return v.toString(); };
  const toggleWww = (x) => {
    const v = new URL(x);
    v.hostname = v.hostname.startsWith('www.') ? v.hostname.slice(4) : `www.${v.hostname}`;
    return v.toString();
  };
  return [...new Set([url, toggleWww(url), flip(url), flip(toggleWww(url))])];
}

function fail(result, status, kind, detail) {
  result.status = status;
  result.failure = { kind, detail, hint: STATUS_HINTS[status] ?? '' };
  result.fallbackRecommended = true;
  return result;
}

export async function scrapeEmailsForWebsite(website, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const result = {
    website, domain: null, status: 'no_email_found', failure: null, fallbackRecommended: false,
    pagesChecked: [], emails: [], best: null, errors: [], attempts: [],
  };

  let startUrl;
  try {
    startUrl = normalizeUrl(website);
  } catch {
    result.errors.push('invalid website URL');
    return fail(result, 'invalid_url', 'invalid_url', 'invalid website URL');
  }
  result.domain = stripWww(new URL(startUrl).hostname.toLowerCase());
  if (domainMatches(result.domain, NOT_BUSINESS_SITES)) {
    result.errors.push(`${result.domain} is a social/directory site, not a business website`);
    return fail(result, 'not_a_business_site', 'not_a_business_site', result.domain);
  }

  const robotsCache = new Map();
  const allowed = async (url) => {
    if (!opts.respectRobots) return true;
    const origin = new URL(url).origin;
    if (!robotsCache.has(origin)) {
      let rules = null;
      try {
        const r = await fetchText(`${origin}/robots.txt`, { ...opts, retries: 0 }, { typeRe: /text\//i, sniff: false });
        rules = parseRobots(r.text, opts.botToken);
      } catch { /* no robots.txt or unreachable: proceed */ }
      robotsCache.set(origin, rules);
    }
    const rules = robotsCache.get(origin);
    return !rules || robotsAllows(rules, new URL(url).pathname);
  };
  const logAttempt = (a) => result.attempts.push(a);

  /* ---- 1. homepage, trying scheme / www variants if the first one fails ---- */
  let home = null;
  let homeErr = null;
  for (const variant of homepageVariants(startUrl)) {
    if (!(await allowed(variant))) {
      const p = new URL(variant).pathname || '/';
      homeErr = new FetchError('robots', `robots.txt disallows ${p}`);
      result.errors.push(`robots.txt disallows ${p}`);
      logAttempt({ url: variant, ok: false, kind: 'robots' });
      break;
    }
    try {
      home = await fetchText(variant, opts);
      logAttempt({ url: variant, ok: true, status: home.status, ms: home.ms });
      break;
    } catch (e) {
      homeErr = e;
      result.errors.push(`${variant}: ${e.message}`);
      logAttempt({ url: variant, ok: false, kind: e.kind, status: e.status, detail: e.message });
      if (['blocked', 'private', 'unsupported', 'not_html'].includes(e.kind)) break;
    }
  }
  if (!home) {
    const status =
      homeErr.kind === 'blocked' ? 'blocked_by_site'
        : homeErr.kind === 'robots' ? 'robots_disallowed'
          : homeErr.kind === 'private' ? 'rejected_address'
            : 'unreachable';
    return fail(result, status, homeErr.kind, homeErr.message);
  }

  let html = home.text;
  let finalUrl = home.finalUrl;
  const redirect = findClientRedirect(html, finalUrl);
  if (redirect && visibleText(html).length < 300 && (await allowed(redirect))) {
    try {
      const next = await fetchText(redirect, opts);
      html = next.text;
      finalUrl = next.finalUrl;
      logAttempt({ url: redirect, ok: true, status: next.status, ms: next.ms, note: 'client-side redirect followed' });
    } catch (e) {
      result.errors.push(`${redirect}: ${e.message}`);
    }
  }

  const siteHost = stripWww(new URL(finalUrl).hostname.toLowerCase());
  result.domain = siteHost;
  const origin = new URL(finalUrl).origin;

  const found = new Map(); // email -> { email, sources:Set, pages:Set }
  let sawForm = false;
  const ingest = (pageHtml, pageUrl) => {
    result.pagesChecked.push(pageUrl);
    sawForm ||= hasContactForm(pageHtml);
    const hits = extractEmailsFromHtml(pageHtml, { siteHost });
    for (const hit of hits) {
      const entry = found.get(hit.email) ?? { email: hit.email, sources: new Set(), pages: new Set() };
      entry.sources.add(hit.source);
      entry.pages.add(pageUrl);
      found.set(hit.email, entry);
    }
    return hits.length;
  };

  const homeEmails = ingest(html, finalUrl);
  const jsShell = looksLikeJsShell(html);
  result.attempts.at(-1).emails = homeEmails;

  /* ---- 2. contact-type pages: links, then sitemap, then guessed paths ---- */
  const hasEarlyMatch = opts.earlyExit && hasHighConfidenceCandidate(found, siteHost);
  if (!hasEarlyMatch) {
    const guessed = new Set();
    let queue = findContactLinks(html, finalUrl);
    if (!queue.some((u) => CONTACT_PAGE_RE.test(new URL(u).pathname))) {
      const fromSitemap = await contactUrlsFromSitemap(origin, siteHost, opts, allowed);
      const guesses = guessedPaths(origin, siteHost);
      guesses.forEach((g) => guessed.add(g));
      queue = [...fromSitemap, ...queue, ...guesses];
    }

    const visited = new Set([finalUrl]);
    while (queue.length && result.pagesChecked.length < opts.maxPages && result.attempts.length < opts.maxAttempts) {
      const url = queue.shift();
      if (visited.has(url)) continue;
      visited.add(url);
      await sleep(opts.delayMs);

      const pathName = new URL(url).pathname;
      if (!(await allowed(url))) {
        result.errors.push(`robots.txt disallows ${pathName}`);
        continue;
      }
      try {
        const page = await fetchText(url, opts);
        const n = ingest(page.text, page.finalUrl);
        logAttempt({ url, ok: true, status: page.status, ms: page.ms, emails: n });
        if (opts.earlyExit && hasHighConfidenceCandidate(found, siteHost)) {
          break; // Stop crawling deeper once high-confidence on-domain email is secured
        }
      } catch (e) {
        logAttempt({ url, ok: false, kind: e.kind, status: e.status, detail: e.message, guessed: guessed.has(url) });
        const quietGuess = guessed.has(url) && e.kind === 'http_error' && [404, 410].includes(e.status);
        if (!quietGuess) result.errors.push(`${url}: ${e.message}`);
      }
    }
  }

  /* ---- 3. rank + MX ---- */
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
      if (c.hasMx === false) c.score -= 60;
      c.confidence = confidenceOf(c.score);
    }
  }

  result.emails = candidates.sort((a, b) => b.score - a.score).slice(0, 10);
  result.best = result.emails.find((c) => c.hasMx !== false) ?? null;

  /* ---- 4. explain the outcome ---- */
  if (result.best) {
    result.status = 'ok';
    result.fallbackRecommended = result.best.confidence === 'low';
  } else if (result.emails.length) {
    fail(result, 'no_usable_email', 'undeliverable_domains', 'every address is on a domain with no mail server');
  } else if (sawForm) {
    fail(result, 'contact_form_only', 'contact_form', 'a contact form exists but no address is published');
  } else if (jsShell) {
    fail(result, 'likely_js_rendered', 'js_shell', 'homepage has almost no text and loads its content with JavaScript');
  } else {
    fail(result, 'no_email_found', 'no_email', `read ${result.pagesChecked.length} page(s), none list an email`);
  }
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

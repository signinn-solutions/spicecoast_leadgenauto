import config from '../config/env.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let gate = Promise.resolve();
let lastStart = 0;
let exhaustedKey = '';
export function resetHunterRequestQuota() { exhaustedKey = ''; }
const quotaFailure = () => ({ ok: false, status: 429, errors: [{ id: 'usage_limit', details: 'Hunter usage credits are exhausted.' }], quotaExceeded: true });

// Keep all Hunter traffic under the strictest endpoint's five starts/second.
async function waitForSlot() {
  const next = gate.then(async () => {
    const wait = 200 - (Date.now() - lastStart);
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
  });
  gate = next.catch(() => {});
  await next;
}

export async function requestHunter(endpoint, { params = {}, body, maxAttempts = 3 } = {}) {
  if (!config.HUNTER_API_KEY) return { ok: false, status: 503, errors: [{ id: 'missing_api_key' }] };
  const url = new URL(`https://api.hunter.io/v2/${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await waitForSlot();
    // Check after waiting: another worker may have exhausted credits while this call queued.
    if (exhaustedKey === config.HUNTER_API_KEY && endpoint !== 'account') return quotaFailure();
    let response;
    let payload;
    try {
      response = await fetch(url.toString(), {
        method: body ? 'POST' : 'GET',
        headers: { 'X-API-KEY': config.HUNTER_API_KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10000),
      });
      payload = await response.json();
    } catch {
      if (attempt + 1 < maxAttempts) { await sleep(500); continue; }
      return { ok: false, status: 502, errors: [{ id: 'request_failed' }] };
    }
    const errors = Array.isArray(payload.errors) ? payload.errors : payload.errors ? [payload.errors] : [];
    const pending = response.status === 202 || errors.some(error => Number(error.code) === 202);
    const quotaExceeded = response.status === 402 || response.status === 429 || errors.some(error => /usage_limit|credits|quota/.test(error.id || ''));
    if (quotaExceeded) exhaustedKey = config.HUNTER_API_KEY;
    const throttled = !quotaExceeded && errors.some(error => /rate_limit|too_many_requests/.test(error.id || ''));
    if ((pending || throttled || response.status >= 500) && attempt + 1 < maxAttempts) {
      const retryAfter = response.headers?.get('retry-after');
      const retryMs = retryAfter ? (Number.isFinite(Number(retryAfter)) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()) : 1000 * (2 ** attempt);
      if (retryMs > 10000) return { ok: false, status: response.status, errors, pending, throttled };
      await sleep(Math.max(1000, retryMs || 1000));
      continue;
    }
    return { ok: response.ok && !pending && errors.length === 0, status: response.status, data: payload.data, meta: payload.meta, errors, quotaExceeded, pending };
  }
}

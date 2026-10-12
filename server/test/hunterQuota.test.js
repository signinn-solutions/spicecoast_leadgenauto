import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../config/env.js';
import { requestHunter, resetHunterRequestQuota } from '../services/hunterClient.js';

test('Hunter 429 stops queued paid calls without retries and supports explicit recovery', async () => {
  const originalKey = config.HUNTER_API_KEY;
  const originalFetch = globalThis.fetch;
  config.HUNTER_API_KEY = 'quota-test';
  resetHunterRequestQuota();
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ errors: [{ id: 'too_many_requests', details: 'You have reached your usage limit.' }] }, { status: 429 });
    };
    const results = await Promise.all(Array.from({ length: 4 }, () => requestHunter('domain-search')));
    assert.equal(calls, 1);
    assert.ok(results.every(result => result.quotaExceeded));
    await requestHunter('email-verifier');
    assert.equal(calls, 1);
    await requestHunter('account');
    assert.equal(calls, 2, 'Free account diagnostics remain available');
    resetHunterRequestQuota();
    globalThis.fetch = async () => { calls++; return Response.json({ data: { emails: [] } }); };
    assert.equal((await requestHunter('domain-search')).ok, true);
    assert.equal(calls, 3);
  } finally {
    config.HUNTER_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
    resetHunterRequestQuota();
  }
});

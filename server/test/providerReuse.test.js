import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../config/env.js';
import { getGroqClient, classifyReplySentiment } from '../services/groqService.js';
import { requestHunter, resetHunterRequestQuota } from '../services/hunterClient.js';

test('Groq reuses identical completions and sentiment reads make zero AI calls', async () => {
  const originalKey = config.GROQ_API_KEY;
  config.GROQ_API_KEY = 'provider-reuse-test';
  const client = getGroqClient();
  const originalFetch = client.fetch;
  let calls = 0;
  client.fetch = async () => {
    calls++;
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"subject":"Spices","body":"Catalog?"}' } }], usage: { total_tokens: 10 } });
  };
  try {
    const request = { model: config.GROQ_MODEL, messages: [{ role: 'user', content: 'Reuse fixture JSON' }], max_tokens: 20 };
    await Promise.all([client.chat.completions.create(request), client.chat.completions.create(request)]);
    await client.chat.completions.create(request);
    assert.equal(calls, 1);
    await client.chat.completions.create({ ...request, bypassCache: true });
    assert.equal(calls, 2);
    assert.equal(await classifyReplySentiment('Inquiry', 'Please share pricing'), 'positive');
    assert.equal(calls, 2);
  } finally { client.fetch = originalFetch; config.GROQ_API_KEY = originalKey; }
});

test('Hunter deduplicates concurrent and repeated successful contact lookups', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = config.HUNTER_API_KEY;
  config.HUNTER_API_KEY = 'hunter-reuse-test';
  resetHunterRequestQuota();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ data: { emails: [] } }); };
  try {
    const options = { params: { domain: 'buyer.test' } };
    await Promise.all([requestHunter('domain-search', options), requestHunter('domain-search', options)]);
    await requestHunter('domain-search', options);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; config.HUNTER_API_KEY = originalKey; resetHunterRequestQuota(); }
});

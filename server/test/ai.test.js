import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../config/env.js';
import { getGroqClient, generateColdEmail, extractMetadataAndDraftReply, resetAiUnavailableState } from '../services/groqService.js';

test('AI metadata is safe to render and fallback drafts identify their actual source', async () => {
  const originalKey = config.GROQ_API_KEY;
  config.GROQ_API_KEY = 'test-key-no-network';
  const client = getGroqClient();
  const originalCreate = client.chat.completions.create;
  try {
    client.chat.completions.create = async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'Test draft', buyerName: { injected: true }, intent: ['bad'], detectedProducts: ['Pepper', { bad: true }], priority: 7 }) } }] });
    const result = await extractMetadataAndDraftReply('Inquiry', 'Pepper', 'buyer@example.test', 'Buyer');
    assert.equal(result.metadata.buyerName, 'Buyer');
    assert.equal(typeof result.metadata.intent, 'string');
    assert.equal(typeof result.metadata.priority, 'string');
    assert.deepEqual(result.metadata.detectedProducts, ['Pepper']);
    client.chat.completions.create = async () => { throw new Error('Provider unavailable'); };
    const fallback = await extractMetadataAndDraftReply('Inquiry', 'Pepper', 'buyer@example.test');
    assert.equal(fallback.model, 'Local template');
    const draft = await generateColdEmail({ name: 'Test company' }, { useAI: false });
    assert.equal(draft.model, 'Local template');
    assert.doesNotMatch(draft.body, /ISO|HACCP/);
  } finally {
    client.chat.completions.create = originalCreate;
    config.GROQ_API_KEY = originalKey;
  }
});

test('Cold drafts retry unusable JSON and expose actionable provider failures', async () => {
  const originalKey = config.GROQ_API_KEY;
  config.GROQ_API_KEY = 'test-key-no-network';
  const client = getGroqClient();
  const originalCreate = client.chat.completions.create;
  resetAiUnavailableState();
  try {
    let calls = 0;
    client.chat.completions.create = async (request) => {
      calls++;
      assert.deepEqual(request.response_format, { type: 'json_object' });
      assert.ok(request.max_tokens >= 1000);
      assert.match(request.messages[1].content, /https:\/\/thespicecoast.com\//);
      assert.match(request.messages[1].content, /Custom|buyer-specific/);
      assert.doesNotMatch(request.messages[1].content, /550\/570|7-8mm|High-Curcumin/);
      return { choices: [{ message: { content: calls === 1 ? '' : JSON.stringify({ subject: 'Spice partnership', body: 'May we share our catalog?' }) } }] };
    };
    const generated = await generateColdEmail({ name: 'Buyer' });
    assert.equal(calls, 2);
    assert.equal(generated.subject, 'Spice partnership');
    client.chat.completions.create = async () => { throw Object.assign(new Error('Payment required'), { status: 402 }); };
    const fallback = await generateColdEmail({ name: 'Buyer' });
    assert.equal(fallback.model, 'Local template');
    assert.match(fallback.fallbackReason, /balance/);
    const unavailable = await generateColdEmail({ name: 'Buyer' });
    assert.match(unavailable.fallbackReason, /balance/);
    config.GROQ_API_KEY = '';
    resetAiUnavailableState();
    assert.match((await generateColdEmail({})).fallbackReason, /not configured/);
  } finally {
    client.chat.completions.create = originalCreate;
    config.GROQ_API_KEY = originalKey;
    resetAiUnavailableState();
  }
});

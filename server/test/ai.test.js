import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../config/env.js';
import { getDeepseekClient, generateColdEmail, extractMetadataAndDraftReply } from '../services/deepseekService.js';

test('AI metadata is safe to render and fallback drafts identify their actual source', async () => {
  const originalKey = config.DEEPSEEK_API_KEY;
  config.DEEPSEEK_API_KEY = 'test-key-no-network';
  const client = getDeepseekClient();
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
    config.DEEPSEEK_API_KEY = originalKey;
  }
});

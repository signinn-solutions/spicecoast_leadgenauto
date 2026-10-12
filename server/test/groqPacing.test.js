import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroqPacer } from '../services/groqPacing.js';

test('Groq starts small batches immediately and waits only when token budget is full', async () => {
  let time = 100000;
  const waits = [];
  const reserve = createGroqPacer({ now: () => time, sleep: async ms => { waits.push(ms); time += ms; }, budget: 3000 });
  const request = { messages: [], max_tokens: 1000 };
  const reconcile = await reserve(request);
  reconcile(100);
  await Promise.all([reserve(request), reserve(request)]);
  assert.deepEqual(waits, []);
  await reserve(request);
  assert.deepEqual(waits, [60000]);
});

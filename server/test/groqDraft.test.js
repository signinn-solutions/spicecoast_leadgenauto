import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../config/env.js';
import { getAiSettings } from '../services/aiProvider.js';
import { getGroqClient, generateColdEmail } from '../services/groqService.js';

test('Groq drafts use the selected endpoint, model, brand prompt and provider metadata', async () => {
  const original = { GROQ_API_KEY: config.GROQ_API_KEY };
  config.GROQ_API_KEY = 'mock-groq-key';
  const client = getGroqClient();
  const create = client.chat.completions.create;
  try {
    assert.equal(getAiSettings().baseURL, 'https://api.groq.com/openai/v1');
    client.chat.completions.create = async request => {
      assert.equal(request.model, 'openai/gpt-oss-120b');
      assert.equal(request.reasoning_effort, 'low');
      assert.match(request.messages[1].content, /thespicecoast.com/);
      return { choices: [{ message: { content: JSON.stringify({ subject: 'Kerala spices', body: 'May we share product details?' }) } }] };
    };
    const draft = await generateColdEmail({ name: 'Buyer' }, { force: true });
    assert.equal(draft.provider, 'groq');
    assert.equal(draft.subject, 'Kerala spices');
    config.GROQ_API_KEY = '';
    assert.match((await generateColdEmail({})).fallbackReason, /Groq API key is not configured/);
  } finally {
    client.chat.completions.create = create;
    Object.assign(config, original);
  }
});

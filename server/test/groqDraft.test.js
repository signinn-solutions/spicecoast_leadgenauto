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

 test('local replies follow the inquiry and do not ask again for supplied quote details', async () => {
  const { extractMetadataAndDraftReply } = await import('../services/groqService.js');
  const quote = await extractMetadataAndDraftReply('Pepper quote', 'Please quote 2.5 MT pepper CIF Hamburg.', 'buyer@example.com', 'Alex', '', '', { useAI: false });
  assert.match(quote.reply, /2.5 Metric Tons/);
  assert.match(quote.reply, /Hamburg/);
  assert.doesNotMatch(quote.reply, /confirm your required quantity|confirm your delivery destination|confirm your preferred delivery terms|currently preparing/);
  const catalog = await extractMetadataAndDraftReply('Catalog', 'Please share cardamom specifications.', '', '', '', '', { useAI: false });
  assert.match(catalog.reply, /product information for Green Cardamom/);
  assert.doesNotMatch(catalog.reply, /accurate quote|seasonal export pricing|Alleppey/);
  const sample = await extractMetadataAndDraftReply('Samples', 'Could I get cinnamon samples in Dubai?', '', '', '', '', { useAI: false });
  assert.match(sample.reply, /sample request for Cinnamon/);
  assert.doesNotMatch(sample.reply, /Ceylon|share the delivery destination/);
  const rejection = await extractMetadataAndDraftReply('No thanks', 'Not interested. Do not email.', '', '', '', '', { useAI: false });
  assert.doesNotMatch(rejection.reply, /quotation|specifications|bulk|Could you/);
 });

 test('local cold drafts adapt to business role', async () => {
  const manufacturer = await generateColdEmail({ name: 'Factory', businessType: 'Food Manufacturer' }, { useAI: false });
  const retailer = await generateColdEmail({ name: 'Shop', businessType: 'Retailer' }, { useAI: false });
  assert.match(manufacturer.body, /ingredient sourcing/);
  assert.match(retailer.body, /retail assortment/);
 });

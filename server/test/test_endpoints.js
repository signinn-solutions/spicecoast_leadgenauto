import assert from 'assert';
import app from '../app.js';
import config from '../config/env.js';

async function runTests() {
  console.log('🧪 Starting Node.js Express API Verification Tests...\n');

  const server = app.listen(5099, '127.0.0.1');
  const baseUrl = 'http://127.0.0.1:5099';

  try {
    // 1. Test Health Check
    console.log('1. Testing GET /health ...');
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.strictEqual(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.strictEqual(healthJson.status, 'ok');
    console.log('   ✅ Passed: Health check OK');

    // 2. Test GET /api/status
    console.log('2. Testing GET /api/status ...');
    const statusRes = await fetch(`${baseUrl}/api/status`);
    assert.strictEqual(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert(typeof statusJson.count === 'number');
    assert(typeof statusJson.limit === 'number');
    assert(typeof statusJson.remaining === 'number');
    console.log('   ✅ Passed: Status returned quota & limits');

    // 3. Test GET /api/leads
    console.log('3. Testing GET /api/leads ...');
    const leadsRes = await fetch(`${baseUrl}/api/leads`);
    assert.strictEqual(leadsRes.status, 200);
    const leadsJson = await leadsRes.json();
    assert(Array.isArray(leadsJson.all_leads));
    assert(Array.isArray(leadsJson.search_history));
    console.log('   ✅ Passed: Leads & search history returned');

    // 4. Test POST /api/search (Validation failure 400)
    console.log('4. Testing POST /api/search (validation 400) ...');
    const invalidSearchRes = await fetch(`${baseUrl}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_type: '' }),
    });
    assert.strictEqual(invalidSearchRes.status, 400);
    const invalidSearchJson = await invalidSearchRes.json();
    assert(invalidSearchJson.error);
    console.log('   ✅ Passed: Correctly returned 400 on missing parameters');

    // 5. Test POST /api/search (Simulated search)
    console.log('5. Testing POST /api/search (simulated mode) ...');
    const searchRes = await fetch(`${baseUrl}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_type: 'spice trader',
        city: 'Hamburg',
        country: 'Germany',
        count: 2,
        mode: 'simulated',
      }),
    });
    assert.strictEqual(searchRes.status, 200);
    const searchJson = await searchRes.json();
    assert.strictEqual(searchJson.count, 2);
    assert.strictEqual(searchJson.leads.length, 2);
    assert.strictEqual(searchJson.mode, 'simulated');
    assert(searchJson.leads[0].email);
    console.log('   ✅ Passed: Lead search generated simulated leads with delivery statuses');

    // 6. Test GET /api/mailbox/status
    console.log('6. Testing GET /api/mailbox/status ...');
    const mailboxStatusRes = await fetch(`${baseUrl}/api/mailbox/status`);
    assert.strictEqual(mailboxStatusRes.status, 200);
    const mailboxStatusJson = await mailboxStatusRes.json();
    assert.strictEqual(mailboxStatusJson.mailbox, config.SENDER_MAILBOX);
    assert(typeof mailboxStatusJson.daily_limit === 'number');
    console.log('   ✅ Passed: Mailbox status returned correctly');

    // 7. Test GET /api/mailbox/messages
    console.log('7. Testing GET /api/mailbox/messages ...');
    const msgsRes = await fetch(`${baseUrl}/api/mailbox/messages`);
    assert.strictEqual(msgsRes.status, 200);
    const msgsJson = await msgsRes.json();
    assert(Array.isArray(msgsJson.messages));
    console.log('   ✅ Passed: Mailbox messages array returned');

    // 8. Test POST /api/mailbox/test-incoming
    console.log('8. Testing POST /api/mailbox/test-incoming ...');
    const testIncomingRes = await fetch(`${baseUrl}/api/mailbox/test-incoming`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'buyer@testspices.com',
        from_name: 'David Miller',
        subject: 'Inquiry: Black Pepper bulk pricing',
        message: 'Looking for 5 MT Malabar black pepper quotation CIF Rotterdam.',
      }),
    });
    assert.strictEqual(testIncomingRes.status, 200);
    const testIncomingJson = await testIncomingRes.json();
    assert.strictEqual(testIncomingJson.status, 'drafted');
    assert.strictEqual(testIncomingJson.to, 'buyer@testspices.com');
    assert(testIncomingJson.reply && testIncomingJson.reply.length > 20);
    console.log('   ✅ Passed: Inbound inquiry drafted response');

    // 9. Test POST /api/mailbox/send-draft (Validation 400)
    console.log('9. Testing POST /api/mailbox/send-draft (validation 400) ...');
    const invalidDraftRes = await fetch(`${baseUrl}/api/mailbox/send-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(invalidDraftRes.status, 400);
    console.log('   ✅ Passed: Returned 400 on missing recipient/reply');

    // 10. Test POST /api/mailbox/toggle-autosend
    console.log('10. Testing POST /api/mailbox/toggle-autosend ...');
    const toggleRes = await fetch(`${baseUrl}/api/mailbox/toggle-autosend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_send: true }),
    });
    assert.strictEqual(toggleRes.status, 200);
    const toggleJson = await toggleRes.json();
    assert.strictEqual(toggleJson.auto_send, true);
    // Reset back
    await fetch(`${baseUrl}/api/mailbox/toggle-autosend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_send: false }),
    });
    console.log('   ✅ Passed: Toggle autosend synced');

    // 11. Test Direct Webhook POST /webhook
    console.log('11. Testing POST /webhook ...');
    const webhookRes = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: config.HOSTINGER_WEBHOOK_BEARER_TOKEN
          ? `Bearer ${config.HOSTINGER_WEBHOOK_BEARER_TOKEN}`
          : '',
      },
      body: JSON.stringify({
        from: 'inquiry@hamburg-spicetrading.de',
        subject: 'Price quotation inquiry: Alleppey Green Cardamom',
        text: 'Please send us your latest spice catalog and pricing.',
      }),
    });
    assert.strictEqual(webhookRes.status, 200);
    const webhookJson = await webhookRes.json();
    assert(webhookJson.status === 'drafted' || webhookJson.status === 'sent');
    console.log('   ✅ Passed: Webhook successfully processed inbound payload');

    // 12. Test Nonexistent endpoint (404)
    console.log('12. Testing 404 handler on /api/unknown-endpoint ...');
    const notFoundRes = await fetch(`${baseUrl}/api/unknown-endpoint`);
    assert.strictEqual(notFoundRes.status, 404);
    const notFoundJson = await notFoundRes.json();
    assert.strictEqual(notFoundJson.error, 'Endpoint not found');
    console.log('   ✅ Passed: Correct JSON 404 response');

    console.log('\n🎉 ALL 12 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ Test Failed:', err);
  process.exit(1);
});

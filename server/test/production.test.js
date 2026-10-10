import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import config from '../config/env.js';
import app from '../app.js';
import { executeLeadSearch, searchPlaces, resetHunterQuotaState, scrapeEmailsFromWebsite } from '../services/leadFinderService.js';
import { getDatabase, closeStorage, loadLeadsHistory, saveLeadsHistory, loadDailyUsage, saveDailyUsage, loadOutreachHistory, saveOutreachHistory, loadMailboxHistory, saveMailboxHistory, getTodayDateString, saveReplyUsage } from '../services/storageService.js';
import { createUser, completeSetup, findUser, publicUser, updateUser, issueSetup, userUsage } from '../services/accessService.js';
import { saveProviderSettings, providerSettings, loadProviderSettings } from '../services/integrationService.js';
import { sendEmail, sendEmailViaHostinger } from '../services/mailService.js';
import { deliveryList, reconcileDelivery, sendUsage, suppressRecipient } from '../services/deliveryService.js';
import { processIncomingEmail } from '../services/webhookService.js';
import { dispatchFollowUpEmail, runLifecycleCheck } from '../services/followUpEngine.js';
import { resolvePublicUrl, isPublicAddress } from '../services/websiteService.js';
import { startSearchJob, getSearchJob } from '../services/searchJobService.js';
let dir, original, realFetch, server;
const keys = ['DB_PATH', 'DAILY_USAGE_FILE', 'REPLY_USAGE_FILE', 'LEADS_HISTORY_FILE', 'SEEN_PLACES_FILE', 'MAILBOX_HISTORY_FILE', 'OUTREACH_HISTORY_FILE', 'GOOGLE_API_KEY', 'HUNTER_API_KEY', 'HUNTER_ENABLED', 'DEEPSEEK_API_KEY', 'HOSTINGER_API_TOKEN', 'HOSTINGER_MAILBOX_ID', 'HOSTINGER_SEND_ENDPOINT_OVERRIDE', 'HOSTINGER_WEBHOOK_BEARER_TOKEN', 'SETTINGS_ENCRYPTION_KEY', 'DAILY_LEAD_LIMIT', 'DAILY_REPLY_LIMIT', 'DAILY_SEND_LIMIT', 'NODE_ENV', 'ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SENDER_MAILBOX'];
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicecoast-production-'));
  original = Object.fromEntries(keys.map(k => [k, config[k]]));
  realFetch = globalThis.fetch;
  closeStorage();
  for (const k of keys.filter(k => k.endsWith('_FILE') || k === 'DB_PATH')) config[k] = path.join(dir, k);
  Object.assign(config, {
    GOOGLE_API_KEY: 'google-test',
    HUNTER_API_KEY: 'hunter-test',
    HUNTER_ENABLED: true,
    DEEPSEEK_API_KEY: '',
    HOSTINGER_API_TOKEN: 'hostinger-test',
    HOSTINGER_MAILBOX_ID: 'test-mailbox',
    HOSTINGER_SEND_ENDPOINT_OVERRIDE: '',
    HOSTINGER_WEBHOOK_BEARER_TOKEN: 'webhook-test',
    SETTINGS_ENCRYPTION_KEY: 'ab'.repeat(32),
    DAILY_LEAD_LIMIT: 200,
    DAILY_REPLY_LIMIT: 30,
    DAILY_SEND_LIMIT: 50,
    NODE_ENV: 'development',
    ADMIN_EMAIL: '',
    ADMIN_PASSWORD_HASH: '',
    SMTP_HOST: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    SENDER_MAILBOX: 'sales@example.test'
  });
  resetHunterQuotaState();
  globalThis.fetch = async () => {
    throw new Error('Unexpected external request.');
  };
});
afterEach(async () => {
  if (server) {
    await new Promise(r => server.close(r));
    server = null;
  }
  closeStorage();
  Object.assign(config, original);
  globalThis.fetch = realFetch;
  fs.rmSync(dir, {
    recursive: true,
    force: true
  });
});
const place = n => ({
  id: 'place-' + n,
  displayName: {
    text: 'Buyer ' + n
  },
  formattedAddress: n + ' Hamburg Germany',
  nationalPhoneNumber: '040123456' + n
});
const options = {
  businessType: 'spice importer',
  city: 'Hamburg',
  country: 'Germany',
  requestedCount: 60,
  mode: 'live'
};
const response = data => ({
  ok: true,
  status: 200,
  json: async () => data
});
async function listen() {
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  return 'http://127.0.0.1:' + server.address().port;
}
async function account(role, email = role + '@example.test') {
  const created = createUser({
    name: role,
    email,
    role,
    dailyLeadLimit: 60
  });
  await completeSetup(email, created.setup.token, 'long-test-password-123');
  return publicUser(findUser(created.user.id));
}
async function login(base, email) {
  const res = await realFetch(base + '/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      password: 'long-test-password-123'
    })
  });
  assert.equal(res.status, 200);
  const session = await res.json();
  return {
    cookie: res.headers.get('set-cookie').split(';')[0],
    'X-CSRF-Token': session.csrfToken,
    'Content-Type': 'application/json'
  };
}
test('60-result discovery follows all three Google tokens and saves distinct records', async () => {
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    assert.match(url, /places:searchText/);
    const body = JSON.parse(init.body);
    bodies.push(body);
    const page = body.pageToken ? Number(body.pageToken) : 0;
    return response({
      places: Array.from({
        length: 20
      }, (_, i) => place(page * 20 + i)),
      ...(page < 2 ? {
        nextPageToken: String(page + 1)
      } : {})
    });
  };
  const found = await executeLeadSearch(options);
  assert.equal(found.count, 60);
  assert.equal(found.mode, 'live');
  assert.equal(found.pagesFetched, 3);
  assert.equal(loadLeadsHistory().leads.length, 60);
  assert.equal(loadDailyUsage().count, 60);
  assert.deepEqual(bodies.map(b => b.pageToken), [undefined, '1', '2']);
  assert.ok(bodies.every(b => b.textQuery === 'spice importer in Hamburg, Germany' && b.pageSize === 20));
  assert.equal(found.leads[0].phoneStatus, 'listed');
});
test('changed keywords reach Google while repeated businesses stay deduplicated', async () => {
  const queries = [];
  globalThis.fetch = async (_url, init) => {
    queries.push(JSON.parse(init.body).textQuery);
    return response({
      places: [place(1)]
    });
  };
  assert.equal((await executeLeadSearch({
    ...options,
    requestedCount: 1
  })).count, 1);
  const repeat = await executeLeadSearch({
    ...options,
    businessType: 'food wholesaler',
    requestedCount: 1
  });
  assert.equal(repeat.count, 0);
  assert.equal(repeat.mode, 'live');
  assert.equal(repeat.duplicatesSkipped, 1);
  assert.equal(loadDailyUsage().count, 1);
  assert.deepEqual(queries, ['spice importer in Hamburg, Germany', 'food wholesaler in Hamburg, Germany']);
});
test('60 requests respect both workspace and per-user quotas and reject malformed inputs', async () => {
  const actor = await account('company_admin');
  updateUser(actor.id, {
    dailyLeadLimit: 2
  }, 'system');
  const fresh = publicUser(findUser(actor.id));
  config.DAILY_LEAD_LIMIT = 3;
  globalThis.fetch = async () => response({
    places: [place(1), place(2), place(3)]
  });
  const found = await executeLeadSearch({
    ...options,
    actor: fresh
  });
  assert.equal(found.count, 2);
  assert.equal(found.effectiveCount, 2);
  assert.equal(userUsage(actor.id), 2);
  assert.ok(found.warnings.length);
  await assert.rejects(executeLeadSearch({
    ...options,
    actor: fresh
  }), {
    statusCode: 429
  });
  for (const requestedCount of [0, 61, -1, 1.2, 'abc', {}, []]) await assert.rejects(executeLeadSearch({
    ...options,
    requestedCount
  }), {
    statusCode: 400
  });
  for (const businessType of [null, 123, {}, 'x'.repeat(201)]) await assert.rejects(executeLeadSearch({
    ...options,
    businessType
  }), {
    statusCode: 400
  });
});
test('partial Google failures retain results with an explicit warning; zero results stay live', async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? response({
    places: [place(1)],
    nextPageToken: 'next'
  }) : {
    ok: false,
    status: 500
  };
  const found = await executeLeadSearch({
    ...options,
    requestedCount: 2
  });
  assert.equal(found.count, 1);
  assert.ok(found.warnings.some(w => w.includes('HTTP 500')));
  globalThis.fetch = async () => response({
    places: []
  });
  const empty = await executeLeadSearch({
    ...options,
    requestedCount: 1
  });
  assert.equal(empty.mode, 'live');
  assert.equal(empty.count, 0);
  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    json: async () => ({
      error: {
        message: 'Denied'
      }
    })
  });
  await assert.rejects(executeLeadSearch({
    ...options,
    requestedCount: 1
  }), {
    statusCode: 502
  });
});
test('unknown Hunter verification is not deliverable and never creates an outreach draft', async () => {
  globalThis.fetch = async url => url.includes('places:searchText') ? response({
    places: [{
      ...place(1),
      websiteUri: 'https://buyer.example.test'
    }]
  }) : url.includes('domain-search') ? response({
    data: {
      emails: [{
        value: 'sales@buyer.example.test'
      }]
    }
  }) : response({
    data: {
      status: 'unknown'
    }
  });
  const found = await executeLeadSearch({
    ...options,
    requestedCount: 1,
    autoDraft: true
  });
  assert.equal(found.leads[0].emailStatus, 'unknown');
  assert.equal(found.leads[0].emailVerification, null);
  assert.equal(found.leads[0].coldMailDraft, undefined);
  assert.equal(loadOutreachHistory().length, 0);
});
test('website extraction prefers company emails and private network URLs are blocked', async () => {
  const mails = await scrapeEmailsFromWebsite('https://spices.example.test', 'spices.example.test', {
    fetchPage: async () => '<a href="mailto:sales@spices.example.test">mail</a> unrelated@another.test'
  });
  assert.equal(mails[0].value, 'sales@spices.example.test');
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1']) assert.equal(isPublicAddress(address), false);
  for (const url of ['http://127.0.0.1', 'http://localhost', 'file:///secret', 'https://public.test:8080', 'https://user:password@public.test']) await assert.rejects(resolvePublicUrl(url, async () => [{
    address: '8.8.8.8',
    family: 4
  }]));
  await assert.rejects(resolvePublicUrl('https://public.test', async () => [{
    address: '10.0.0.1',
    family: 4
  }]));
  assert.equal((await resolvePublicUrl('https://public.test', async () => [{
    address: '8.8.8.8',
    family: 4
  }])).address.address, '8.8.8.8');
});
test('background search returns a job, deduplicates retry submission and retains result', async () => {
  globalThis.fetch = async () => response({
    places: [place(1)]
  });
  const requestId = '11111111-2222-3333-4444-555555555555';
  const job = startSearchJob({
    ...options,
    requestedCount: 1
  }, requestId);
  assert.equal(startSearchJob({
    ...options,
    requestedCount: 1
  }, requestId).id, job.id);
  for (let i = 0; i < 100 && getSearchJob(job.id).status !== 'complete'; i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(getSearchJob(job.id).status, 'complete');
  assert.equal(getSearchJob(job.id).result.count, 1);
  assert.equal(loadDailyUsage().count, 1);
});
test('one-time activation, viewer restrictions, viewer send denial and revocation are enforced by API', async () => {
  const admin = await account('company_admin');
  const platform = await account('super_admin');
  const viewer = await account('viewer');
  const operator = await account('viewer','second-viewer@example.test');
  const base = await listen();
  const ah = await login(base, platform.email),
    vh = await login(base, viewer.email),
    oh = await login(base, operator.email);
  assert.equal((await realFetch(base + '/api/leads', {
    headers: vh
  })).status, 200);
  for (const route of ['/api/search', '/api/mailbox/send-draft', '/api/mailbox/toggle-autosend', '/api/admin/users']) assert.equal((await realFetch(base + route, {
    method: 'POST',
    headers: vh,
    body: '{}'
  })).status, 403);
  assert.equal((await realFetch(base + '/api/mailbox/send-draft', {
    method: 'POST',
    headers: oh,
    body: '{}'
  })).status, 403);
  assert.equal((await realFetch(base + '/api/admin/users', {
    headers: oh
  })).status, 403);
  const res = await realFetch(base + '/api/platform/tenants/spicecoast/admin/users/' + viewer.id, {
    method: 'PATCH',
    headers: ah,
    body: JSON.stringify({
      active: false
    })
  });
  assert.equal(res.status, 200);
  assert.equal((await realFetch(base + '/api/leads', {
    headers: vh
  })).status, 401);
  await assert.rejects(async () => updateUser(admin.id, {
    active: false
  }, admin.id), {
    statusCode: 409
  });
  const reset = issueSetup(operator.id, admin.id);
  await completeSetup(operator.email, reset.token, 'new-long-password-123');
  await assert.rejects(completeSetup(operator.email, reset.token, 'new-long-password-123'), {
    statusCode: 400
  });
  assert.equal((await realFetch(base + '/api/leads', {
    headers: oh
  })).status, 401);
  const listing = await (await realFetch(base + '/api/platform/tenants/spicecoast/admin/users', {
    headers: ah
  })).text();
  assert.ok(!listing.includes('password_hash'));
  assert.ok(!listing.includes('setup_hash'));
});
test('encrypted provider settings never return secrets and refresh after reload', async () => {
  await saveProviderSettings({
    HUNTER_API_KEY: 'private-new-hunter-key',
    DAILY_LEAD_LIMIT: 70
  }, 'admin');
  const encrypted = getDatabase().prepare("SELECT value FROM settings WHERE name='provider_config'").get().value;
  assert.ok(!encrypted.includes('private-new-hunter-key'));
  assert.ok(!JSON.stringify(providerSettings()).includes('private-new-hunter-key'));
  config.HUNTER_API_KEY = '';
  loadProviderSettings();
  assert.equal(config.HUNTER_API_KEY, 'private-new-hunter-key');
  assert.equal(config.DAILY_LEAD_LIMIT, 70);
  await assert.rejects(saveProviderSettings({
    DAILY_LEAD_LIMIT: -2
  }, 'admin'), {
    statusCode: 400
  });
  await assert.rejects(saveProviderSettings({
    UNKNOWN: 'secret'
  }, 'admin'), {
    statusCode: 400
  });
});
test('outbound ledger blocks ambiguous retry, enforces total send quota and honors suppression', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('Timeout after acceptance may have occurred.');
  };
  await assert.rejects(sendEmail('buyer@example.test', 'Hello', 'Body', {
    dispatchKey: 'unique-send'
  }));
  assert.equal(deliveryList()[0].status, 'unknown');
  await assert.rejects(sendEmail('buyer@example.test', 'Hello', 'Body', {
    dispatchKey: 'unique-send'
  }), {
    statusCode: 409
  });
  assert.equal(calls, 1);
  await reconcileDelivery('unique-send', false, 'admin');
  globalThis.fetch = async () => {
    calls++;
    return response({});
  };
  await sendEmail('buyer@example.test', 'Hello', 'Body', {
    dispatchKey: 'unique-send'
  });
  assert.equal(sendUsage().count, 1);
  assert.equal(calls, 2);
  config.DAILY_SEND_LIMIT = 1;
  await assert.rejects(sendEmail('other@example.test', 'Hello', 'Body', {
    dispatchKey: 'another-send'
  }), {
    statusCode: 429
  });
  suppressRecipient('blocked@example.test');
  await assert.rejects(sendEmail('blocked@example.test', 'Hello', 'Body'), {
    statusCode: 409
  });
});
test('Hostinger uses resource ID endpoint, 204 acknowledgement and threading reference', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = {
      url,
      body: JSON.parse(init.body)
    };
    return {
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('No body');
      }
    };
  };
  const result = await sendEmailViaHostinger('buyer@example.test', 'Quote', 'Reply', {
    reply: true,
    inReplyTo: {
      uid: 23,
      folder: 'INBOX'
    }
  });
  assert.equal(result.status, 'sent');
  assert.equal(captured.url, 'https://api.mail.hostinger.com/api/v1/mailboxes/test-mailbox/send');
  assert.deepEqual(captured.body.inReplyTo, {
    uid: 23,
    folder: 'INBOX'
  });
  assert.equal(captured.body.subject, 'Re: Quote');
  assert.equal(captured.body.from, undefined);
});
test('follow-up recipient overrides fail and sent draft content survives clearing', async () => {
  saveLeadsHistory({
    leads: [{
      id: 'live-1',
      source: 'live',
      email: 'buyer@example.test',
      emailStatus: 'deliverable'
    }],
    searches: []
  });
  saveOutreachHistory([{
    id: 'outreach-live-1',
    leadId: 'live-1',
    source: 'live',
    recipient: 'buyer@example.test',
    status: 'follow_up_due',
    follow_up_count: 0,
    follow_up_draft: {
      subject: 'Saved followup',
      body: 'Saved body'
    }
  }]);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response({});
  };
  await assert.rejects(dispatchFollowUpEmail('live-1', {
    to: 'wrong@example.test'
  }), /Recipient/);
  assert.equal(calls, 0);
  await dispatchFollowUpEmail('live-1', {});
  assert.equal(loadOutreachHistory()[0].sent_followups[0].body, 'Saved body');
  assert.equal(loadOutreachHistory()[0].sent_followups[0].subject, 'Saved followup');
  assert.equal(loadOutreachHistory()[0].follow_up_draft, null);
});
test('webhook quota preserves inquiries, deduplicates retries, matches known replies and suppresses opt-outs', async () => {
  saveReplyUsage(getTodayDateString(), 30);
  let payload = {
    from: 'buyer@example.test',
    to: config.SENDER_MAILBOX,
    subject: 'Pepper quote',
    message: 'Need pricing',
    messageId: 'event-1'
  };
  const result = await processIncomingEmail(payload, 'Bearer webhook-test');
  assert.equal(result.response.status, 'blocked');
  assert.equal(loadMailboxHistory()[0].status, 'received');
  assert.equal((await processIncomingEmail(payload, 'Bearer webhook-test')).response.status, 'duplicate');
  saveReplyUsage(getTodayDateString(), 0);
  saveOutreachHistory([{
    id: 'outreach-known',
    source: 'live',
    recipient: 'known@example.test',
    status: 'sent',
    first_contacted_at: new Date().toISOString(),
    sentAt: new Date().toISOString()
  }]);
  const known = await processIncomingEmail({
    ...payload,
    from: 'known@example.test',
    subject: 'Re: Hello',
    message: 'Yes, please.',
    messageId: 'event-2'
  }, 'Bearer webhook-test');
  assert.equal(known.response.status, 'drafted');
  const stop = await processIncomingEmail({
    ...payload,
    message: 'Please unsubscribe me',
    messageId: 'event-3'
  }, 'Bearer webhook-test');
  assert.equal(stop.response.status, 'suppressed');
  await assert.rejects(sendEmail('buyer@example.test', 'Hello', 'Body'), {
    statusCode: 409
  });
});
test('reviewed reply preserves edits and cannot be sent twice or to a changed recipient', async () => {
  config.HOSTINGER_API_TOKEN = 'test';
  saveMailboxHistory([{
    id: 'reply-1',
    source: 'webhook',
    sender: 'buyer@example.test',
    subject: 'Quote',
    draftReply: 'Old body',
    status: 'drafted'
  }]);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response({});
  };
  const base = await listen();
  const post = body => realFetch(base + '/api/mailbox/send-draft', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  assert.equal((await post({
    id: 'reply-1',
    to: 'wrong@example.test',
    subject: 'New quote',
    reply: 'Edited reply'
  })).status, 400);
  const payload = {
    id: 'reply-1',
    to: 'buyer@example.test',
    subject: 'New quote',
    reply: 'Edited reply'
  };
  const results = await Promise.all([post(payload), post(payload)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(calls, 1);
  assert.equal(loadMailboxHistory()[0].sentReply.body, 'Edited reply');
  assert.equal(loadMailboxHistory()[0].sentReply.subject, 'New quote');
});
test('history retains records beyond former caps and simulation cannot inflate engagement', async () => {
  saveMailboxHistory(Array.from({
    length: 170
  }, (_, i) => ({
    id: 'm' + i,
    source: 'simulated',
    sender: 'demo' + i + '@example.test',
    receivedAt: new Date().toISOString(),
    body: 'Price quote',
    metadata: {}
  })));
  saveOutreachHistory(Array.from({
    length: 220
  }, (_, i) => ({
    id: 'o' + i,
    source: 'simulated',
    status: 'pending_review',
    recipient: 'demo' + i + '@example.test'
  })));
  assert.equal(loadMailboxHistory().length, 170);
  assert.equal(loadOutreachHistory().length, 220);
  const lifecycle = await runLifecycleCheck();
  assert.equal(lifecycle.analytics.totalContacted, 0);
});
test('account revocation during a batch stops further provider work without dropping saved records', async () => {
  const actor = await account('company_admin');
  await account('company_admin','backup-admin@example.test');
  let progressCount = 0;
  globalThis.fetch = async () => response({
    places: [place(1), place(2), place(3)]
  });
  await assert.rejects(executeLeadSearch({
    ...options,
    actor,
    requestedCount: 3,
    onProgress: p => {
      if (p.processed === 1) {
        progressCount++;
        updateUser(actor.id, {
          active: false
        }, 'system');
      }
    }
  }), {
    statusCode: 403
  });
  assert.equal(progressCount, 1);
  assert.equal(loadLeadsHistory().leads.length, 1);
  assert.equal(loadDailyUsage().count, 1);
});
test('accepted uncertain deliveries reconcile mailbox state and keep a sent reply from dispatching again', async () => {
  saveMailboxHistory([{
    id: 'uncertain-reply',
    source: 'webhook',
    sender: 'buyer@example.test',
    subject: 'Quote',
    draftReply: 'Original draft',
    status: 'drafted'
  }]);
  globalThis.fetch = async () => {
    throw new Error('Ambiguous timeout');
  };
  await assert.rejects(sendEmail('buyer@example.test', 'Edited quote', 'Edited reply', {
    dispatchKey: 'reply:uncertain-reply'
  }));
  await reconcileDelivery('reply:uncertain-reply', true, 'admin');
  const message = loadMailboxHistory()[0];
  assert.equal(message.status, 'sent');
  assert.equal(message.sentReply.body, 'Edited reply');
  await assert.rejects(sendEmail('buyer@example.test', 'Edited quote', 'Edited reply', {
    dispatchKey: 'reply:uncertain-reply'
  }), {
    statusCode: 409
  });
});
test('failed auto-send remains retryable after transport configuration is corrected', async () => {
  config.HOSTINGER_MAILBOX_ID = '';
  const payload = {
    from: 'buyer@example.test',
    to: config.SENDER_MAILBOX,
    subject: 'Pepper quote',
    message: 'Need 2 MT CIF quote',
    messageId: 'retryable-event'
  };
  const failed = await processIncomingEmail(payload, 'Bearer webhook-test', false, true);
  assert.equal(failed.response.status, 'send_failed');
  assert.equal(loadMailboxHistory()[0].status, 'send_failed');
  config.HOSTINGER_MAILBOX_ID = 'test-mailbox';
  globalThis.fetch = async () => response({});
  const base = await listen();
  const message = loadMailboxHistory()[0];
  const reply = await realFetch(base + '/api/mailbox/send-draft', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: message.id,
      to: message.sender,
      subject: message.subject,
      reply: 'Reviewed retry'
    })
  });
  assert.equal(reply.status, 200);
  assert.equal(loadMailboxHistory()[0].sentReply.body, 'Reviewed retry');
});
test('cold mail cannot be regenerated after the recipient replied and follow-up timing is accurate', async () => {
  saveLeadsHistory({
    leads: [{
      id: 'live-1',
      source: 'live',
      email: 'buyer@example.test',
      emailStatus: 'deliverable'
    }],
    searches: []
  });
  const now = Date.now();
  saveOutreachHistory([{
    id: 'outreach-live-1',
    leadId: 'live-1',
    source: 'live',
    recipient: 'buyer@example.test',
    status: 'replied',
    first_contacted_at: new Date(now - 4 * 86400000).toISOString(),
    sentAt: new Date(now - 4 * 86400000).toISOString(),
    last_contacted_at: new Date(now - 4 * 86400000).toISOString(),
    follow_up_count: 0,
    subject: 'Original pitch',
    body: 'Original body'
  }]);
  const base = await listen();
  const result = await realFetch(base + '/api/leads/generate-coldmail', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      leadId: 'live-1',
      email: 'buyer@example.test'
    })
  });
  assert.equal(result.status, 409);
  const lifecycle = await runLifecycleCheck();
  assert.equal(lifecycle.tabs.followUpQueue.length, 1);
  assert.equal(loadOutreachHistory()[0].follow_up_draft.turn, 1);
  const history = loadOutreachHistory();
  history[0].follow_up_count = 1;
  history[0].last_contacted_at = new Date(now - 8 * 86400000).toISOString();
  history[0].first_contacted_at = new Date(now - 12 * 86400000).toISOString();
  saveOutreachHistory(history);
  await runLifecycleCheck();
  assert.equal(loadOutreachHistory()[0].follow_up_draft.turn, 2);
  const older = loadOutreachHistory();
  older[0].first_contacted_at = new Date(now - 15 * 86400000).toISOString();
  saveOutreachHistory(older);
  await runLifecycleCheck();
  assert.equal(loadOutreachHistory()[0].status, 'closed_no_response');
});
test('SQLite backup restores shared accounts and records without changing the source database', async () => {
  const admin = await account('super_admin');
  saveLeadsHistory({
    leads: [{
      id: 'backup-lead',
      name: 'Backup Buyer'
    }],
    searches: []
  });
  const destination = path.join(dir, 'verified-backup.sqlite');
  await getDatabase().backup(destination);
  const source = config.DB_PATH;
  closeStorage();
  config.DB_PATH = destination;
  assert.equal(findUser(admin.id).email, admin.email);
  assert.equal(loadLeadsHistory().leads[0].id, 'backup-lead');
  closeStorage();
  config.DB_PATH = source;
  assert.equal(findUser(admin.id).email, admin.email);
});
test('negative replies do not become hot prospects and inbound inquiries do not inflate outbound analytics', async () => {
  const {
    computeLeadEngagementScore
  } = await import('../services/lifecycleScoringService.js');
  const now = new Date().toISOString();
  const score = await computeLeadEngagementScore({
    first_contacted_at: now
  }, [{
    receivedAt: now,
    subject: 'Re: Pepper pricing',
    body: 'Not interested',
    metadata: {
      sentiment: 'negative'
    }
  }], [{
    sentAt: now
  }]);
  assert.equal(score.isHot, false);
  saveMailboxHistory([{
    id: 'organic',
    source: 'webhook',
    sender: 'organic@example.test',
    receivedAt: now,
    subject: 'Pepper price',
    body: 'Please share pricing',
    metadata: {
      sentiment: 'positive'
    }
  }]);
  const lifecycle = await runLifecycleCheck();
  assert.equal(lifecycle.analytics.totalSentThisWeek, 0);
  assert.equal(lifecycle.analytics.totalContacted, 0);
  assert.equal(lifecycle.analytics.replyRatePercent, 0);
});

test('live discovery works with Hunter disabled and published emails stay unverified', async()=>{
  const {crawlWebsiteContacts}=await import('../services/contactCrawlerService.js');
  config.HUNTER_ENABLED=false;config.HUNTER_API_KEY='';
  const site='https://spices.test/';
  await crawlWebsiteContacts(site,{maxPages:1,delayMs:0,fetchResource:async url=>({status:url.endsWith('/robots.txt')?404:200,body:'sales@spices.test',url,type:'text/html'})});
  const calls=[];globalThis.fetch=async(url)=>{calls.push(url);assert.match(url,/places:searchText/);return response({places:[{...place(999),websiteUri:site}]});};
  const found=await executeLeadSearch({...options,requestedCount:1,autoDraft:true});
  assert.equal(found.count,1);assert.equal(found.leads[0].email,'sales@spices.test');assert.equal(found.leads[0].emailStatus,'unknown');assert.equal(found.leads[0].emailVerification,null);assert.equal(found.leads[0].emailDiscovery.sourceUrl,site);assert.equal(loadOutreachHistory().length,0);assert.equal(calls.length,1);
});
test('a stored Hunter key never makes calls while the tenant switch is disabled',async()=>{
  const {findEmails,verifyEmail}=await import('../services/leadFinderService.js');config.HUNTER_ENABLED=false;let count=0;globalThis.fetch=async()=>{count++;throw new Error('Disabled Hunter must not be called');};assert.deepEqual(await findEmails('spices.test'),[]);assert.equal(await verifyEmail('sales@spices.test'),'unknown');assert.equal(count,0);
});

test('scraper-first discovery avoids Hunter search and uses enabled verification only',async()=>{
  const {crawlWebsiteContacts}=await import('../services/contactCrawlerService.js');
  const site='https://spices.test/';
  await crawlWebsiteContacts(site,{maxPages:1,delayMs:0,fetchResource:async url=>({status:url.endsWith('/robots.txt')?404:200,body:'sales@spices.test',url,type:'text/html'})});
  const calls=[];globalThis.fetch=async url=>{calls.push(url);if(url.includes('places:searchText'))return response({places:[{...place(998),websiteUri:site}]});assert.match(url,/email-verifier/);return response({data:{status:'valid'}});};
  const result=await executeLeadSearch({...options,requestedCount:1});assert.equal(result.leads[0].emailStatus,'deliverable');assert.equal(result.leads[0].emailVerification.provider,'hunter');assert.equal(calls.length,2);assert.ok(!calls.some(url=>url.includes('domain-search')));
});
test('enabled Hunter fallback finds contacts when the cached website has none',async()=>{
  const {crawlWebsiteContacts}=await import('../services/contactCrawlerService.js');const site='https://spices.test/';
  await crawlWebsiteContacts(site,{maxPages:1,delayMs:0,fetchResource:async url=>({status:url.endsWith('/robots.txt')?404:200,body:'No published contact',url,type:'text/html'})});
  const calls=[];globalThis.fetch=async url=>{calls.push(url);if(url.includes('places:searchText'))return response({places:[{...place(997),websiteUri:site}]});if(url.includes('domain-search'))return response({data:{emails:[{value:'sales@spices.test'}]}});return response({data:{status:'valid'}});};
  const result=await executeLeadSearch({...options,requestedCount:1});assert.equal(result.leads[0].emailDiscovery.source,'hunter');assert.equal(result.leads[0].emailStatus,'deliverable');assert.equal(calls.length,3);assert.match(calls[1],/limit=3/);
});
test('credit exhaustion pauses Hunter but retains website discovery and unknown verification',async()=>{
  const {findEmails,verifyEmail}=await import('../services/leadFinderService.js');let calls=0;globalThis.fetch=async()=>{calls++;return {ok:false,status:402};};assert.deepEqual(await findEmails('spices.test'),[]);assert.equal(await verifyEmail('sales@spices.test'),'unknown');assert.equal(calls,1);assert.equal((await scrapeEmailsFromWebsite('https://spices.test/','spices.test',{fetchPage:async()=>'<a href="mailto:sales@spices.test">Sales</a>'}))[0].value,'sales@spices.test');
});
test('unverified published leads cannot generate or send cold outreach',async()=>{
  saveLeadsHistory({leads:[{id:'public-contact',source:'live',email:'sales@spices.test',emailStatus:'unknown',emailDiscovery:{source:'website',sourceUrl:'https://spices.test/'}}],searches:[]});
  const {generateLeadColdMail}=await import('../controllers/leadController.js');const {sendColdMail}=await import('../controllers/mailboxController.js');
  const req={body:{leadId:'public-contact',email:'sales@spices.test',recipient:'sales@spices.test',subject:'Offer',body:'Body'}};
  const res={status(code){this.code=code;return this;},json(value){this.body=value;return this;}};
  await generateLeadColdMail(req,res,error=>{throw error;});assert.equal(res.code,400);
  saveOutreachHistory([{id:'outreach-public',leadId:'public-contact',source:'live',recipient:'sales@spices.test',status:'pending_review',subject:'Offer',body:'Body'}]);
  req.body={id:'outreach-public',to:'sales@spices.test',subject:'Offer',body:'Body'};
  await sendColdMail(req,res,error=>{throw error;});assert.equal(res.code,400);assert.match(res.body.error,/verified live lead/);
});

test('uncapped workspace and account discovery continues past 60 daily leads and tracks usage',async()=>{
  config.DAILY_LEAD_LIMIT=-1;
  const actor=await account('company_admin');updateUser(actor.id,{dailyLeadLimit:-1},'platform');const fresh=publicUser(findUser(actor.id));
  saveDailyUsage(getTodayDateString(),120);
  getDatabase().prepare('INSERT INTO user_usage(user_id,date,count) VALUES(?,?,?)').run(fresh.id,getTodayDateString(),120);
  globalThis.fetch=async()=>response({places:[place(1500),place(1501)]});
  const result=await executeLeadSearch({...options,requestedCount:2,actor:fresh});
  assert.equal(result.count,2);assert.equal(loadDailyUsage().count,122);assert.equal(userUsage(fresh.id),122);assert.equal(result.usage.unlimited,true);assert.equal(result.usage.remaining,null);assert.equal(result.usage.limit,-1);
});
test('an explicit account cap still restricts an uncapped workspace',async()=>{
  config.DAILY_LEAD_LIMIT=-1;const actor=await account('company_admin');updateUser(actor.id,{dailyLeadLimit:1},'platform');
  globalThis.fetch=async()=>response({places:[place(1600),place(1601)]});
  const result=await executeLeadSearch({...options,requestedCount:2,actor:publicUser(findUser(actor.id))});assert.equal(result.count,1);assert.equal(result.effectiveCount,1);
  await assert.rejects(executeLeadSearch({...options,requestedCount:1,actor:publicUser(findUser(actor.id))}),{statusCode:429});
});
test('an explicit workspace cap still restricts an uncapped account',async()=>{
  config.DAILY_LEAD_LIMIT=1;const actor=await account('company_admin');updateUser(actor.id,{dailyLeadLimit:-1},'platform');
  globalThis.fetch=async()=>response({places:[place(1700),place(1701)]});
  const result=await executeLeadSearch({...options,requestedCount:2,actor:publicUser(findUser(actor.id))});assert.equal(result.count,1);assert.equal(result.usage.remaining,0);
});

test('Signinn plans accept unlimited discovery but reject unlimited mail quotas',async()=>{
  const {listPlans,savePlan}=await import('../services/planService.js');const id=listPlans()[0].id;
  const changed=savePlan(id,{leadLimit:-1});assert.equal(changed.leadLimit,-1);assert.equal(changed.replyLimit,30);assert.equal(changed.sendLimit,50);
  assert.throws(()=>savePlan(id,{leadLimit:-2}),{statusCode:400});assert.throws(()=>savePlan(id,{sendLimit:-1}),{statusCode:400});assert.throws(()=>savePlan(id,{replyLimit:-1}),{statusCode:400});
});

test('Google connection failures explain the network cause without consuming discovery quota',async()=>{
  for(const [error,pattern] of [
    [Object.assign(new TypeError('fetch failed'),{cause:{code:'EACCES'}}),/denied outbound HTTPS/],
    [Object.assign(new TypeError('fetch failed'),{cause:{code:'ENOTFOUND'}}),/could not resolve/],
    [new DOMException('timeout','TimeoutError'),/connection timed out/]
  ]) {
    globalThis.fetch=async()=>{throw error;};
    await assert.rejects(executeLeadSearch({...options,requestedCount:15}),err=>err.statusCode===502 && pattern.test(err.message));
    assert.equal(loadDailyUsage().count,0);assert.equal(loadLeadsHistory().leads.length,0);
  }
});

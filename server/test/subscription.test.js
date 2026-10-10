import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import config from '../config/env.js';
import app from '../app.js';
import { getDatabase, getPlatformDatabase, closeStorage, saveLeadsHistory, loadLeadsHistory, saveDailyUsage, loadDailyUsage, getTodayDateString, saveMailboxHistory, loadMailboxHistory, saveAutoSendSetting, loadAutoSendSetting } from '../services/storageService.js';
import { accessDatabase, createUser, completeSetup, findUser, publicUser, audit, auditList } from '../services/accessService.js';
import { listTenants, createTenant, runInTenant, findTenant, updateTenant, assertTenantActive, saveSubscription } from '../services/tenantService.js';
import { saveProviderSettings, providerSettings } from '../services/integrationService.js';
import { sendEmail } from '../services/mailService.js';
import { generateColdEmail, extractMetadataAndDraftReply } from '../services/deepseekService.js';
import { generateFollowUpDraft } from '../services/followUpEngine.js';
let dir, original, server, realFetch;
const keys = ['DB_PATH', 'DAILY_USAGE_FILE', 'REPLY_USAGE_FILE', 'LEADS_HISTORY_FILE', 'SEEN_PLACES_FILE', 'MAILBOX_HISTORY_FILE', 'OUTREACH_HISTORY_FILE', 'SETTINGS_ENCRYPTION_KEY', 'GOOGLE_API_KEY', 'HUNTER_API_KEY', 'HUNTER_ENABLED', 'DEEPSEEK_API_KEY', 'HOSTINGER_API_TOKEN', 'HOSTINGER_WEBHOOK_BEARER_TOKEN', 'HOSTINGER_MAILBOX_ID', 'HOSTINGER_SEND_ENDPOINT_OVERRIDE', 'SENDER_MAILBOX', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'NODE_ENV', 'AUTO_SEND', 'BUSINESS_CONTEXT', 'LEAD_KEYWORDS', 'DAILY_LEAD_LIMIT', 'DAILY_REPLY_LIMIT', 'DAILY_SEND_LIMIT'];
beforeEach(() => {
  original = Object.fromEntries(keys.map(k => [k, config[k]]));
  realFetch = globalThis.fetch;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signinn-tenancy-'));
  closeStorage();
  for (const k of keys.filter(k => k.endsWith('_FILE') || k === 'DB_PATH')) config[k] = path.join(dir, k === 'DB_PATH' ? 'platform.sqlite' : k);
  Object.assign(config, {
    SETTINGS_ENCRYPTION_KEY: 'ab'.repeat(32),
    GOOGLE_API_KEY: 'legacy-google',
    HUNTER_API_KEY: 'legacy-hunter',
    HUNTER_ENABLED: true,
    DEEPSEEK_API_KEY: '',
    HOSTINGER_API_TOKEN: '',
    HOSTINGER_WEBHOOK_BEARER_TOKEN: 'legacy-webhook',
    HOSTINGER_MAILBOX_ID: '',
    HOSTINGER_SEND_ENDPOINT_OVERRIDE: '',
    SENDER_MAILBOX: 'sales@spicecoast.test',
    SMTP_HOST: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    ADMIN_EMAIL: '',
    ADMIN_PASSWORD_HASH: '',
    NODE_ENV: 'development',
    AUTO_SEND: false,
    BUSINESS_CONTEXT: '',
    LEAD_KEYWORDS: ''
  });
  globalThis.fetch = async () => {
    throw new Error('Unexpected external provider call');
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
const newTenant = () => {
  const t = createTenant({
    name: 'Acme Trading',
    slug: 'acme'
  });
  return saveSubscription(t.id, {
    planId: 'standard',
    status: 'active',
    openEnded: true
  }, 'system');
};
async function account(role, email, tenantId) {
  const result = createUser({
    name: role,
    email,
    role,
    tenantId
  });
  await completeSetup(email, result.setup.token, 'long-test-password-123');
  return publicUser(findUser(result.user.id));
}
async function listen() {
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  return 'http://127.0.0.1:' + server.address().port;
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
  const data = await res.json();
  return {
    cookie: res.headers.get('set-cookie').split(';')[0],
    'X-CSRF-Token': data.csrfToken,
    'Content-Type': 'application/json'
  };
}
const request = (base, url, headers, method = 'GET', body) => realFetch(base + url, {
  method,
  headers,
  ...(body ? {
    body: JSON.stringify(body)
  } : {})
});
import { savePlan, getPlan, subscriptionAccess } from '../services/planService.js';
import { subscriptionEvents } from '../services/tenantService.js';
import { updateUser, assertUserPermission } from '../services/accessService.js';
import { startSearchJob, getSearchJob } from '../services/searchJobService.js';
import { withStorageOperationLock } from '../services/storageService.js';
import { executeLeadSearch, findEmails, isHunterQuotaExceeded, resetHunterQuotaState } from '../services/leadFinderService.js';
import { runLifecycleCheck } from '../services/followUpEngine.js';
import { saveOutreachHistory, loadOutreachHistory } from '../services/storageService.js';
import { sendUsage } from '../services/deliveryService.js';
import { processIncomingEmail } from '../services/webhookService.js';
const dated = (extra = {}) => ({
  planId: 'standard',
  status: 'active',
  startsAt: '2020-01-01T00:00:00Z',
  endsAt: '2099-01-01T00:00:00Z',
  ...extra
});
test('subscription access covers activation, expiry boundary, grace, scheduled start and suspension', () => {
  const t = findTenant('spicecoast'),
    now = Date.parse('2030-01-01T00:00:00Z');
  const access = extra => subscriptionAccess({
    ...t,
    ...extra
  }, now);
  assert.equal(access({
    subscription_status: 'pending'
  }).allowed, false);
  assert.equal(access({
    subscription_status: 'cancelled'
  }).allowed, false);
  assert.equal(access({
    subscription_status: 'trial',
    subscription_ends_at: '2031-01-01T00:00:00Z'
  }).phase, 'trial');
  assert.equal(access({
    subscription_ends_at: '2030-01-01T00:00:00Z'
  }).phase, 'expired');
  assert.equal(access({
    subscription_ends_at: '2030-01-01T00:00:00Z',
    subscription_grace_until: '2030-01-02T00:00:00Z'
  }).phase, 'grace');
  assert.equal(access({
    subscription_status: 'past_due',
    subscription_grace_until: '2030-01-01T00:00:00Z'
  }).allowed, false);
  assert.equal(access({
    subscription_starts_at: '2031-01-01T00:00:00Z'
  }).phase, 'scheduled');
  assert.equal(access({
    active: 0
  }).phase, 'suspended');
  assert.equal(access({
    plan_id: 'missing'
  }).allowed, false);
  assert.equal(access({
    subscription_ends_at: 'invalid'
  }).allowed, false);
  assert.equal(access({
    subscription_status: 'unexpected'
  }).allowed, false);
});
test('subscription validation rejects invalid dates and renewal must extend paid access', () => {
  for (const input of [dated({
    endsAt: null
  }), dated({
    endsAt: '2024-01-01'
  }), dated({
    endsAt: '2024-02-31T00:00:00Z'
  }), dated({
    endsAt: '2019-01-01T00:00:00Z'
  }), dated({
    graceUntil: '2025-01-01T00:00:00Z'
  }), dated({
    status: 'past_due',
    graceUntil: null
  }), dated({
    planId: 'missing'
  }), dated({
    status: 'bad'
  })]) assert.throws(() => saveSubscription('spicecoast', input, 'platform'), {
    statusCode: 400
  });
  saveSubscription('spicecoast', dated(), 'platform');
  assert.throws(() => saveSubscription('spicecoast', dated({
    action: 'renew'
  }), 'platform'), {
    statusCode: 400
  });
  const renewed = saveSubscription('spicecoast', dated({
    action: 'renew',
    endsAt: '2099-02-01T00:00:00Z',
    note: 'Receipt 123'
  }), 'platform');
  assert.equal(renewed.subscription.allowed, true);
  assert.equal(subscriptionEvents('spicecoast')[0].action, 'renewed');
  assert.equal(subscriptionEvents('spicecoast')[0].note, 'Receipt 123');
});
test('Signinn alone manages plans and subscriptions; expiry blocks existing sessions and renewal preserves data', async () => {
  const p = await account('super_admin', 'platform@test.example'),
    a = await account('company_admin', 'owner@test.example', 'spicecoast');
  saveLeadsHistory({
    leads: [{
      id: 'saved'
    }],
    searches: []
  });
  saveDailyUsage(getTodayDateString(), 5);
  const base = await listen(),
    ph = await login(base, p.email),
    ah = await login(base, a.email);
  for (const route of ['/api/platform/plans', '/api/platform/tenants/spicecoast/subscription', '/api/admin/integrations', '/api/admin/users']) assert.equal((await request(base, route, ah)).status, 403);
  assert.equal((await request(base, '/api/platform/tenants/spicecoast/subscription', ph, 'PUT', dated({
    endsAt: '2021-01-01T00:00:00Z'
  }))).status, 200);
  const blocked = await request(base, '/api/leads', ah);
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).code, 'SUBSCRIPTION_ACCESS_BLOCKED');
  assert.equal((await (await request(base, '/api/auth/session', ah)).json()).user.tenant.subscription.allowed, false);
  assert.equal((await request(base, '/api/auth/login', {
    'Content-Type': 'application/json'
  }, 'POST', {
    email: a.email,
    password: 'long-test-password-123'
  })).status, 403);
  assert.equal((await request(base, '/webhook/spicecoast', {
    'Content-Type': 'application/json'
  }, 'POST', {})).status, 403);
  assert.equal((await request(base, '/api/platform/tenants/spicecoast/admin/integrations', ph)).status, 200);
  assert.equal((await request(base, '/api/platform/tenants/spicecoast/subscription', ph, 'PUT', dated({
    action: 'renew'
  }))).status, 200);
  assert.equal((await request(base, '/api/leads', ah)).status, 200);
  assert.equal(loadLeadsHistory().leads[0].id, 'saved');
  assert.equal(loadDailyUsage().count, 5);
  saveSubscription('spicecoast', dated({
    status: 'cancelled'
  }), p.id);
  assert.equal((await request(base, '/api/auth/logout', ah, 'POST', {})).status, 200);
});
test('plans own workspace quotas, zero caps disable work, and updates refresh existing tenant contexts', async () => {
  savePlan('standard', {
    leadLimit: 2,
    replyLimit: 0,
    sendLimit: 0
  });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        places: [1, 2, 3].map(n => ({
          id: 'p' + n,
          displayName: {
            text: 'Buyer ' + n
          }
        }))
      })
    };
  };
  await runInTenant('spicecoast', async () => {
    assert.equal(config.DAILY_LEAD_LIMIT, 2);
    const found = await executeLeadSearch({
      businessType: 'buyer',
      city: 'Berlin',
      country: 'Germany',
      requestedCount: 60
    });
    assert.equal(found.count, 2);
    await assert.rejects(sendEmail('buyer@test.example', 'Hello', 'Body'), {
      statusCode: 429
    });
    assert.equal(calls, 1);
    assert.equal(sendUsage().count, 0);
    const inbound = await processIncomingEmail({
      id: 'quota-message',
      from: 'buyer@test.example',
      to: 'sales@spicecoast.test',
      subject: 'Pepper quote',
      message: 'Need pricing'
    }, 'Bearer legacy-webhook');
    assert.equal(inbound.response.status, 'blocked');
    assert.equal(loadMailboxHistory()[0].status, 'received');
    savePlan('standard', {
      leadLimit: 7,
      replyLimit: 4,
      sendLimit: 3
    });
    assertTenantActive();
    assert.equal(config.DAILY_LEAD_LIMIT, 7);
    assert.equal(config.DAILY_REPLY_LIMIT, 4);
    assert.equal(config.DAILY_SEND_LIMIT, 3);
    assert.ok(!providerSettings().fields.some(f => f.key.startsWith('DAILY_')));
    await assert.rejects(saveProviderSettings({
      DAILY_LEAD_LIMIT: 9
    }, 'platform'), {
      statusCode: 400
    });
  });
});
test('seat limits cover onboarding, reactivation and plan downgrade', async () => {
  savePlan('standard', {
    seatLimit: 2
  });
  const a = await account('company_admin', 'owner@test.example', 'spicecoast'),
    v = await account('viewer', 'viewer@test.example', 'spicecoast');
  assert.throws(() => createUser({
    name: 'Extra',
    email: 'extra@test.example',
    role: 'viewer'
  }), {
    statusCode: 409
  });
  assert.throws(() => savePlan('standard', {
    seatLimit: 1
  }), {
    statusCode: 409
  });
  const small = savePlan(null, {
    name: 'One seat',
    leadLimit: 1,
    replyLimit: 1,
    sendLimit: 1,
    seatLimit: 1
  });
  assert.throws(() => saveSubscription('spicecoast', dated({
    planId: small.id
  }), a.id), {
    statusCode: 409
  });
  updateUser(v.id, {
    active: false
  }, 'platform');
  const replacement = await account('viewer', 'replacement@test.example', 'spicecoast');
  assert.throws(() => updateUser(v.id, {
    active: true
  }, 'platform'), {
    statusCode: 409
  });
  assert.ok(replacement.active);
  for (const role of ['tenant_admin', 'operator', 'manager']) assert.throws(() => createUser({
    name: 'Old',
    email: 'old@test.example',
    role
  }), {
    statusCode: 400
  });
});
test('viewer lifecycle reads preserve records and revoked send actors never reach transport', async () => {
  const a = await account('company_admin', 'owner@test.example', 'spicecoast'),
    v = await account('viewer', 'viewer@test.example', 'spicecoast');
  saveOutreachHistory([{
    id: 'follow',
    leadId: 'lead',
    source: 'live',
    recipient: 'buyer@test.example',
    status: 'sent',
    first_contacted_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    last_contacted_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    sentAt: new Date().toISOString(),
    subject: 'Hello',
    body: 'Body',
    follow_up_count: 0
  }]);
  const before = JSON.stringify(loadOutreachHistory());
  const base = await listen(),
    vh = await login(base, v.email);
  assert.equal((await request(base, '/api/mailbox/lifecycle', vh)).status, 200);
  assert.equal(JSON.stringify(loadOutreachHistory()), before);
  let dispatched = 0;
  globalThis.fetch = async () => {
    dispatched++;
    throw new Error('Unexpected send');
  };
  await runInTenant('spicecoast', async () => {
    await assert.rejects(sendEmail('buyer@test.example', 'Hi', 'Body', {
      actor: v.id
    }), {
      statusCode: 403
    });
    updateUser(v.id, {
      active: false
    }, a.id);
    await assert.rejects(sendEmail('buyer@test.example', 'Hi', 'Body', {
      actor: v.id
    }), {
      statusCode: 403
    });
  });
  assert.equal(dispatched, 0);
  await runInTenant('spicecoast', () => runLifecycleCheck());
  assert.equal(loadOutreachHistory()[0].follow_up_draft.turn, 1);
});
test('Hunter cooldown remains attached to the provider key across concurrent tenants', async () => {
  resetHunterQuotaState();
  const t = newTenant();
  await runInTenant(t.id, () => saveProviderSettings({
    HUNTER_API_KEY: 'key-b', HUNTER_ENABLED: true
  }, 'platform'));
  globalThis.fetch = async () => ({
    ok: false,
    status: 429
  });
  await runInTenant('spicecoast', async () => {
    await findEmails('example.test');
    assert.equal(isHunterQuotaExceeded(), true);
  });
  await runInTenant(t.id, () => assert.equal(isHunterQuotaExceeded(), false));
  await runInTenant('spicecoast', () => assert.equal(isHunterQuotaExceeded(), true));
  resetHunterQuotaState();
});
test('background search rejects malformed input without reserving a job', async () => {
  const a = await account('company_admin', 'owner@test.example', 'spicecoast');
  const base = await listen(),
    h = await login(base, a.email);
  assert.equal((await request(base, '/api/search', h, 'POST', {
    background: true,
    count: 61,
    business_type: 'buyer',
    city: 'Berlin',
    country: 'Germany'
  })).status, 400);
  const response = await request(base, '/api/search/jobs', h);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).jobs.length, 0);
});
test('subscription cancellation while a search is queued stops provider work', async () => {
  const a = await account('company_admin', 'owner@test.example', 'spicecoast');
  let release, started;
  const gate = new Promise(r => release = r),
    entered = new Promise(r => started = r);
  let job,
    lock,
    providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls++;
    throw new Error('Unexpected provider call');
  };
  await runInTenant('spicecoast', async () => {
    lock = withStorageOperationLock('lead-search', async () => {
      started();
      await gate;
    });
    await entered;
    job = startSearchJob({
      businessType: 'buyer',
      city: 'Berlin',
      country: 'Germany',
      requestedCount: 1,
      actor: a
    }, '11111111-2222-3333-4444-555555555555');
    saveSubscription('spicecoast', dated({
      status: 'cancelled'
    }), 'platform');
    release();
    await lock;
    for (let i = 0; i < 100 && getSearchJob(job.id).status !== 'failed'; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(getSearchJob(job.id).status, 'failed');
    assert.equal(providerCalls, 0);
    assert.equal(loadLeadsHistory().leads.length, 0);
  });
});
test('queued sends recheck role revocation after the send lock is released', async () => {
  const a = await account('company_admin', 'owner@test.example', 'spicecoast');
  await account('company_admin', 'other-owner@test.example', 'spicecoast');
  let release, entered;
  const gate = new Promise(r => release = r),
    started = new Promise(r => entered = r);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('Unexpected transport call');
  };
  await runInTenant('spicecoast', async () => {
    const lock = withStorageOperationLock('mail-send', async () => {
      entered();
      await gate;
    });
    await started;
    const send = sendEmail('buyer@test.example', 'Hello', 'Body', {
      actor: a.id
    });
    updateUser(a.id, {
      role: 'viewer'
    }, 'platform');
    release();
    await lock;
    await assert.rejects(send, {
      statusCode: 403
    });
  });
  assert.equal(calls, 0);
});

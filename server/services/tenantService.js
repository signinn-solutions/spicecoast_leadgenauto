import path from 'node:path';
import { randomUUID } from 'node:crypto';
import config, { baseConfig } from '../config/env.js';
import { getPlan, subscriptionAccess } from './planService.js';
import { getPlatformDatabase, getDatabase, loadLeadsHistory, loadDailyUsage, loadReplyUsage, loadMailboxHistory } from './storageService.js';
import { withTenantContext, tenantContext } from './tenantContext.js';
import { loadProviderSettings, providerSettings } from './integrationService.js';
export function tenantDatabase() {
  const db = getPlatformDatabase();
  db.exec('CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, db_path TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)');
  db.prepare('INSERT OR IGNORE INTO tenants(id,name,slug,db_path,created_at) VALUES(?,?,?,?,?)').run('spicecoast', 'SpiceCoast', 'spicecoast', path.resolve(baseConfig.DB_PATH), new Date().toISOString());
  const columns = new Set(db.prepare('PRAGMA table_info(tenants)').all().map(c => c.name));
  const additions = {
    plan_id: "TEXT NOT NULL DEFAULT 'standard'",
    subscription_status: "TEXT NOT NULL DEFAULT 'active'",
    subscription_starts_at: 'TEXT',
    subscription_ends_at: 'TEXT',
    subscription_grace_until: 'TEXT'
  };
  db.transaction(() => {
    for (const [name, type] of Object.entries(additions)) if (!columns.has(name)) db.exec('ALTER TABLE tenants ADD COLUMN ' + name + ' ' + type);
  })();
  db.exec('CREATE TABLE IF NOT EXISTS subscription_events(id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,before_state TEXT NOT NULL,after_state TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL)');
  getPlan('standard');
  return db;
}
export function findTenant(id) {
  return tenantDatabase().prepare('SELECT * FROM tenants WHERE id=? OR slug=?').get(id, id);
}
export function publicTenant(t) {
  return t ? {
    id: t.id,
    name: t.name,
    slug: t.slug,
    active: Boolean(t.active),
    createdAt: t.created_at,
    webhookPath: '/webhook/' + t.slug,
    subscription: subscriptionAccess(t)
  } : null;
}
export function listTenants() {
  return tenantDatabase().prepare('SELECT * FROM tenants ORDER BY created_at').all().map(publicTenant);
}
function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), {
    statusCode
  });
}
export function createTenant(input) {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const slug = typeof input?.slug === 'string' ? input.slug.trim().toLowerCase() : '';
  if (!name || name.length > 100 || !/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug)) fail('Enter a tenant name and a URL slug using lowercase letters, numbers and hyphens.');
  if (findTenant(slug)) fail('That tenant slug already exists.', 409);
  const id = randomUUID();
  const file = 'tenants/' + id + '.sqlite';
  tenantDatabase().prepare('INSERT INTO tenants(id,name,slug,db_path,created_at) VALUES(?,?,?,?,?)').run(id, name, slug, file, new Date().toISOString());
  tenantDatabase().prepare("UPDATE tenants SET subscription_status='pending' WHERE id=?").run(id);
  return publicTenant(findTenant(id));
}
export function updateTenant(id, input) {
  const t = findTenant(id);
  if (!t) fail('Tenant not found.', 404);
  const name = input?.name === undefined ? t.name : typeof input.name === 'string' ? input.name.trim() : '';
  const active = input?.active === undefined ? Boolean(t.active) : input.active;
  if (!name || name.length > 100 || typeof active !== 'boolean') fail('Enter a name and a boolean access status.');
  tenantDatabase().prepare('UPDATE tenants SET name=?,active=? WHERE id=?').run(name, Number(active), t.id);
  return publicTenant(findTenant(t.id));
}
export function assertTenantActive() {
  const id = tenantContext()?.tenant?.id;
  if (id) {
    const t = findTenant(id);
    const access = t ? subscriptionAccess(t) : null;
    if (!access?.allowed) throw Object.assign(new Error(access?.reason || 'Company access is unavailable.'), {
      statusCode: 403,
      code: 'SUBSCRIPTION_ACCESS_BLOCKED'
    });
    applyPlanLimits(t);
  }
}
export function runInTenant(id, operation, {
  allowSuspended = false
} = {}) {
  const t = findTenant(id);
  if (!t) fail('Tenant not found.', 404);
  const access = subscriptionAccess(t);
  if (!allowSuspended && !access.allowed) throw Object.assign(new Error(access.reason), {
    statusCode: 403,
    code: 'SUBSCRIPTION_ACCESS_BLOCKED'
  });
  const file = t.id === 'spicecoast' ? path.resolve(baseConfig.DB_PATH) : path.join(path.dirname(path.resolve(baseConfig.DB_PATH)), 'tenants', t.id + '.sqlite');
  const overrides = {
    DB_PATH: file,
    TENANT_ID: t.id,
    TENANT_NAME: t.name
  };
  if (t.id !== 'spicecoast') Object.assign(overrides, {
    GOOGLE_API_KEY: '',
    HUNTER_API_KEY: '',
    DEEPSEEK_API_KEY: '',
    DEEPSEEK_MODEL: 'deepseek-chat',
    HOSTINGER_API_TOKEN: '',
    HOSTINGER_WEBHOOK_BEARER_TOKEN: '',
    HOSTINGER_MAILBOX_ID: '',
    HOSTINGER_SEND_ENDPOINT_OVERRIDE: '',
    SENDER_MAILBOX: '',
    SMTP_HOST: '',
    SMTP_PORT: 587,
    SMTP_USER: '',
    SMTP_PASS: '',
    SMTP_SECURE: false,
    AUTO_SEND: false,
    DAILY_LEAD_LIMIT: 60,
    DAILY_REPLY_LIMIT: 30,
    DAILY_SEND_LIMIT: 50,
    BUSINESS_CONTEXT: '',
    LEAD_KEYWORDS: ''
  });
  return withTenantContext({
    tenant: publicTenant(t),
    config: overrides
  }, () => {
    loadProviderSettings();
    applyPlanLimits(t);
    return operation(publicTenant(t));
  });
}
export function tenantSummary(id) {
  return runInTenant(id, t => {
    const db = getDatabase();
    const exists = name => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
    const delivery = exists('deliveries') ? db.prepare('SELECT status,count(*) AS count FROM deliveries GROUP BY status').all() : [];
    return {
      ...t,
      leads: loadLeadsHistory().leads.length,
      inbox: loadMailboxHistory().length,
      discovery: loadDailyUsage(),
      replies: loadReplyUsage(),
      delivery,
      integrations: providerSettings().fields.filter(f => f.secret).map(f => ({
        key: f.key,
        configured: f.configured
      }))
    };
  }, {
    allowSuspended: true
  });
}
export function applyPlanLimits(t) {
  const plan = getPlan(t.plan_id);
  if (!plan) return;
  for (const [key, cap] of [['DAILY_LEAD_LIMIT', plan.leadLimit], ['DAILY_REPLY_LIMIT', plan.replyLimit], ['DAILY_SEND_LIMIT', plan.sendLimit]]) config[key] = cap;
}
export function saveSubscription(id, input, actor) {
  const store = tenantDatabase(),
    t = findTenant(id);
  if (!t) fail('Tenant not found.', 404);
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Expected subscription details.');
  const plan = getPlan(input.planId);
  if (!plan) fail('Select a valid plan.');
  const status = input.status;
  if (!['pending', 'trial', 'active', 'past_due', 'cancelled'].includes(status)) fail('Choose a valid subscription status.');
  const parse = (value, label) => {
    if (value === null || value === '') return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail(label + ' must be an ISO timestamp with a timezone.');
    const local = new Date(value.replace(/(Z|[+-]\d{2}:\d{2})$/, 'Z'));
    if (local.toISOString().slice(0, 19) !== value.slice(0, 19)) fail(label + ' is not a valid calendar date.');
    return new Date(value).toISOString();
  };
  const starts = parse(input.startsAt ?? null, 'Start date'),
    ends = parse(input.endsAt ?? null, 'End date'),
    grace = parse(input.graceUntil ?? null, 'Grace date');
  if (starts && ends && Date.parse(ends) <= Date.parse(starts)) fail('End date must be after start date.');
  if (grace && (!ends || Date.parse(grace) <= Date.parse(ends))) fail('Grace date must be after end date.');
  if (['active', 'trial', 'past_due'].includes(status) && !ends && !(status === 'active' && input.openEnded === true)) fail('Set an end date or explicitly grant open-ended manual access.');
  if (status === 'past_due' && !grace) fail('Past-due access needs an explicit grace date.');
  if (input.action === 'renew' && (status !== 'active' || !ends || Date.parse(ends) <= Date.now() || t.subscription_ends_at && Date.parse(ends) <= Date.parse(t.subscription_ends_at))) fail('Renewal must extend access to a future end date.');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > 500) fail('Subscription note must be up to 500 characters.');
  const seats = store.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get() ? store.prepare('SELECT count(*) AS n FROM users WHERE tenant_id=? AND active=1').get(t.id).n : 0;
  if (seats > plan.seatLimit) fail('Disable excess users before assigning this plan.', 409);
  return store.transaction(() => {
    store.prepare('UPDATE tenants SET plan_id=?,subscription_status=?,subscription_starts_at=?,subscription_ends_at=?,subscription_grace_until=? WHERE id=?').run(plan.id, status, starts, ends, grace, t.id);
    const after = publicTenant(findTenant(t.id));
    store.prepare('INSERT INTO subscription_events(tenant_id,actor,action,before_state,after_state,note,created_at) VALUES(?,?,?,?,?,?,?)').run(t.id, actor, input.action === 'renew' ? 'renewed' : 'updated', JSON.stringify(publicTenant(t).subscription), JSON.stringify(after.subscription), note, new Date().toISOString());
    return after;
  })();
}
export function subscriptionEvents(id) {
  return tenantDatabase().prepare('SELECT id,actor,action,before_state,after_state,note,created_at FROM subscription_events WHERE tenant_id=? ORDER BY id DESC LIMIT 100').all(id).map(e => ({
    ...e,
    before: JSON.parse(e.before_state),
    after: JSON.parse(e.after_state),
    before_state: undefined,
    after_state: undefined
  }));
}

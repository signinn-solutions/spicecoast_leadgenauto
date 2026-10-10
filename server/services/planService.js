import { randomUUID } from 'node:crypto';
import { getPlatformDatabase } from './storageService.js';
import { baseConfig } from '../config/env.js';
const fail = (message, statusCode = 400) => {
  throw Object.assign(new Error(message), {
    statusCode
  });
};
function db() {
  const store = getPlatformDatabase();
  store.exec('CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,name TEXT NOT NULL,lead_limit INTEGER NOT NULL,reply_limit INTEGER NOT NULL,send_limit INTEGER NOT NULL,seat_limit INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)');
  const now = new Date().toISOString();
  store.prepare('INSERT OR IGNORE INTO plans VALUES(?,?,?,?,?,?,?,?)').run('standard', 'Standard', baseConfig.DAILY_LEAD_LIMIT, baseConfig.DAILY_REPLY_LIMIT, baseConfig.DAILY_SEND_LIMIT, 10, now, now);
  return store;
}
export function publicPlan(p) {
  return p ? {
    id: p.id,
    name: p.name,
    leadLimit: p.lead_limit,
    replyLimit: p.reply_limit,
    sendLimit: p.send_limit,
    seatLimit: p.seat_limit
  } : null;
}
export const getPlan = id => typeof id === 'string' ? publicPlan(db().prepare('SELECT * FROM plans WHERE id=?').get(id)) : null;
export const listPlans = () => db().prepare('SELECT * FROM plans ORDER BY created_at').all().map(publicPlan);
export function savePlan(id, input) {
  const previous = id ? getPlan(id) : null;
  if (id && !previous) fail('Plan not found.', 404);
  const p = {
    ...previous,
    ...input
  };
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 100) fail('Enter a plan name up to 100 characters.');
  for (const key of ['leadLimit', 'replyLimit', 'sendLimit', 'seatLimit']) if (!Number.isInteger(p[key]) || p[key] < (key === 'seatLimit' ? 1 : 0) || p[key] > (key === 'seatLimit' ? 1000 : 10000)) fail('Plan limits must be whole numbers in the allowed range.');
  const store = db();
  if (id && store.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get() && store.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tenants'").get()) {
    const over = store.prepare('SELECT t.name,count(u.id) AS seats FROM tenants t JOIN users u ON u.tenant_id=t.id AND u.active=1 WHERE t.plan_id=? GROUP BY t.id HAVING count(u.id)>?').get(id, p.seatLimit);
    if (over) fail('Disable excess users in ' + over.name + ' before lowering its seat limit.', 409);
  }
  const key = id || randomUUID(),
    now = new Date().toISOString();
  store.prepare('INSERT INTO plans VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,lead_limit=excluded.lead_limit,reply_limit=excluded.reply_limit,send_limit=excluded.send_limit,seat_limit=excluded.seat_limit,updated_at=excluded.updated_at').run(key, p.name.trim(), p.leadLimit, p.replyLimit, p.sendLimit, p.seatLimit, now, now);
  return getPlan(key);
}
export function subscriptionAccess(t, now = Date.now()) {
  const plan = getPlan(t.plan_id || 'standard');
  let phase = 'active',
    reason = '';
  if (!t.active) {
    phase = 'suspended';
    reason = 'Your company access is suspended. Contact Signinn.';
  } else if (!plan) {
    phase = 'unconfigured';
    reason = 'Your company plan is not configured. Contact Signinn.';
  } else if (t.subscription_status && !['pending', 'trial', 'active', 'past_due', 'cancelled'].includes(t.subscription_status) || [t.subscription_starts_at, t.subscription_ends_at, t.subscription_grace_until].some(d => d && !Number.isFinite(Date.parse(d)))) {
    phase = 'unconfigured';
    reason = 'Your subscription needs review by Signinn.';
  } else if (t.subscription_status === 'pending') {
    phase = 'pending';
    reason = 'Your subscription is awaiting activation by Signinn.';
  } else if (t.subscription_status === 'cancelled') {
    phase = 'cancelled';
    reason = 'Your subscription is cancelled. Contact Signinn to renew.';
  } else if (t.subscription_starts_at && Date.parse(t.subscription_starts_at) > now) {
    phase = 'scheduled';
    reason = 'Your subscription has not started yet.';
  } else if (t.subscription_status === 'past_due' || t.subscription_ends_at && Date.parse(t.subscription_ends_at) <= now) {
    if (t.subscription_grace_until && Date.parse(t.subscription_grace_until) > now) phase = 'grace';else {
      phase = 'expired';
      reason = 'Your subscription has expired. Contact Signinn to renew.';
    }
  } else if (t.subscription_status === 'trial') phase = 'trial';
  return {
    allowed: !reason,
    phase,
    reason,
    plan,
    startsAt: t.subscription_starts_at || null,
    endsAt: t.subscription_ends_at || null,
    graceUntil: t.subscription_grace_until || null,
    status: t.subscription_status || 'active',
    openEnded: !t.subscription_ends_at
  };
}

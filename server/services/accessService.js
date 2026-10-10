import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { getPlatformDatabase, getTodayDateString } from './storageService.js';
import { tenantContext } from './tenantContext.js';
import { tenantDatabase, findTenant, publicTenant } from './tenantService.js';
import { hashPassword, validatePassword } from './passwordService.js';
export const ROLES = {
  super_admin: ['platform', 'users', 'integrations'],
  company_admin: ['read', 'discover', 'draft', 'send', 'automation'],
  viewer: ['read']
};
const digest = value => createHash('sha256').update(value).digest('hex');
export function accessDatabase() {
  const db = getPlatformDatabase();
  tenantDatabase();
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
    role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, password_hash TEXT,
    version INTEGER NOT NULL DEFAULT 1, daily_lead_limit INTEGER NOT NULL DEFAULT 60,
    setup_hash TEXT, setup_expires INTEGER, created_at TEXT NOT NULL, last_login_at TEXT
  );
  CREATE TABLE IF NOT EXISTS user_usage (user_id TEXT NOT NULL, date TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(user_id,date));
  CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT NOT NULL, created_at TEXT NOT NULL);`);
  if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'tenant_id')) {
    db.transaction(() => {
      db.exec('ALTER TABLE users ADD COLUMN tenant_id TEXT');
      db.prepare("UPDATE users SET tenant_id='spicecoast' WHERE role != 'super_admin'").run();
    })();
  }
  if (!db.prepare('PRAGMA table_info(audit_log)').all().some(c => c.name === 'tenant_id')) db.exec('ALTER TABLE audit_log ADD COLUMN tenant_id TEXT');
  db.prepare("UPDATE users SET role='company_admin',version=version+1 WHERE role IN ('tenant_admin','manager')").run();
  db.prepare("UPDATE users SET role='viewer',version=version+1 WHERE role='operator'").run();
  return db;
}
export function audit(actor, action, target = '', detail = {}) {
  accessDatabase().prepare('INSERT INTO audit_log(actor,action,target,detail,created_at,tenant_id) VALUES(?,?,?,?,?,?)').run(actor || 'system', action, target, JSON.stringify(detail), new Date().toISOString(), tenantContext()?.tenant?.id || accessDatabase().prepare('SELECT tenant_id FROM users WHERE id=?').get(actor || 'system')?.tenant_id || null);
}
export function auditList() {
  const tenantId = tenantContext()?.tenant?.id;
  return (tenantId ? accessDatabase().prepare('SELECT * FROM audit_log WHERE tenant_id=? ORDER BY id DESC LIMIT 200').all(tenantId) : accessDatabase().prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200').all()).map(row => ({
    ...row,
    detail: JSON.parse(row.detail)
  }));
}
export function findUser(id) {
  return accessDatabase().prepare('SELECT * FROM users WHERE id=?').get(id);
}
export function findUserByEmail(email) {
  return accessDatabase().prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get(email);
}
export function hasUsers() {
  return Boolean(accessDatabase().prepare('SELECT 1 FROM users LIMIT 1').get());
}
export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenant_id || null,
    tenant: user.tenant_id ? publicTenant(findTenant(user.tenant_id)) : null,
    active: Boolean(user.active),
    dailyLeadLimit: user.daily_lead_limit,
    activated: Boolean(user.password_hash),
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    permissions: ROLES[user.role] || []
  };
}
export function listUsers() {
  const tenantId = tenantContext()?.tenant?.id;
  return (tenantId ? accessDatabase().prepare('SELECT * FROM users WHERE tenant_id=? ORDER BY created_at').all(tenantId) : accessDatabase().prepare('SELECT * FROM users ORDER BY created_at').all()).map(publicUser);
}
export function userUsage(id) {
  return accessDatabase().prepare('SELECT count FROM user_usage WHERE user_id=? AND date=?').get(id, getTodayDateString())?.count || 0;
}
export function consumeUserLead(id) {
  if (!id || id === 'legacy-admin' || id === 'local-development') return;
  accessDatabase().prepare('INSERT INTO user_usage(user_id,date,count) VALUES(?,?,1) ON CONFLICT(user_id,date) DO UPDATE SET count=count+1').run(id, getTodayDateString());
}
function fail(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  throw e;
}
function fields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Expected account details.');
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email) || email.length > 254) fail('Enter a valid email address.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 100) fail('Name must contain 1 to 100 characters.');
  if (!Object.hasOwn(ROLES, input.role)) fail('Choose a valid role.');
  const limit = Number(input.dailyLeadLimit ?? 60);
  if (!Number.isInteger(limit) || limit < 0 || limit > 10000) fail('Daily discovery limit must be between 0 and 10000.');
  return {
    email,
    name,
    role: input.role,
    limit
  };
}
export function issueSetup(id, actor = 'system') {
  const token = randomBytes(32).toString('hex');
  const expires = Date.now() + 24 * 60 * 60 * 1000;
  if (!findUser(id)) fail('Account not found.', 404);
  accessDatabase().prepare('UPDATE users SET setup_hash=?,setup_expires=?,version=version+1 WHERE id=?').run(digest(token), expires, id);
  audit(actor, 'account.setup_issued', id);
  return {
    token,
    expiresAt: new Date(expires).toISOString()
  };
}
export function validateAccountInput(input) {
  return fields(input);
}
export function createUser(input, actor = 'system') {
  const f = fields(input);
  if (findUserByEmail(f.email)) fail('An account with that email already exists.', 409);
  const tenantId = f.role === 'super_admin' ? null : tenantContext()?.tenant?.id || input.tenantId || 'spicecoast';
  if (tenantId && !findTenant(tenantId)) fail('Tenant not found.', 404);
  if (tenantId) enforceSeatLimit(tenantId);
  const id = randomUUID();
  accessDatabase().prepare('INSERT INTO users(id,email,name,role,daily_lead_limit,created_at,tenant_id) VALUES(?,?,?,?,?,?,?)').run(id, f.email, f.name, f.role, f.limit, new Date().toISOString(), tenantId);
  audit(actor, 'account.created', id, {
    email: f.email,
    role: f.role
  });
  return {
    user: publicUser(findUser(id)),
    setup: issueSetup(id, actor)
  };
}
export function updateUser(id, input, actor) {
  const current = findUser(id);
  if (!current) fail('Account not found.', 404);
  const f = fields({
    ...publicUser(current),
    ...input
  });
  const active = input.active === undefined ? Boolean(current.active) : input.active;
  if (typeof active !== 'boolean') fail('Active must be a boolean.');
  if (id === actor && (!active || f.role !== current.role)) fail('You cannot disable or change your own administrator role.', 409);
  if (current.role === 'company_admin' && current.active && (!active || f.role !== 'company_admin') && accessDatabase().prepare("SELECT count(*) AS count FROM users WHERE tenant_id=? AND role='company_admin' AND active=1 AND password_hash IS NOT NULL").get(current.tenant_id).count <= 1) fail('Keep at least one active company administrator.', 409);
  if (current.role === 'super_admin' && current.active && (!active || f.role !== 'super_admin') && accessDatabase().prepare("SELECT count(*) AS count FROM users WHERE role='super_admin' AND active=1 AND password_hash IS NOT NULL").get().count <= 1) fail('Keep at least one active super admin.', 409);
  if (active && !current.active && current.tenant_id) enforceSeatLimit(current.tenant_id);
  const duplicate = findUserByEmail(f.email);
  if (duplicate && duplicate.id !== id) fail('An account with that email already exists.', 409);
  accessDatabase().prepare('UPDATE users SET email=?,name=?,role=?,active=?,daily_lead_limit=?,tenant_id=?,version=version+1 WHERE id=?').run(f.email, f.name, f.role, Number(active), f.limit, f.role === 'super_admin' ? null : current.tenant_id || tenantContext()?.tenant?.id || 'spicecoast', id);
  audit(actor, 'account.updated', id, {
    role: f.role,
    active,
    dailyLeadLimit: f.limit
  });
  return publicUser(findUser(id));
}
export async function completeSetup(email, token, password) {
  validatePassword(password);
  if (typeof email !== 'string' || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail('Activation link is invalid or expired.', 400);
  const user = findUserByEmail(email.trim());
  if (!user?.active || !user.setup_hash || user.setup_hash !== digest(token) || user.setup_expires <= Date.now()) fail('Activation link is invalid or expired.', 400);
  const hash = await hashPassword(password);
  // Compare-and-swap makes concurrent use of a one-time token impossible.
  const result = accessDatabase().prepare('UPDATE users SET password_hash=?,setup_hash=NULL,setup_expires=NULL,version=version+1 WHERE id=? AND setup_hash=? AND setup_expires>? AND active=1').run(hash, user.id, digest(token), Date.now());
  if (!result.changes) fail('Activation link is invalid or expired.', 400);
  audit(user.id, 'account.password_set', user.id);
  return publicUser(findUser(user.id));
}
function enforceSeatLimit(tenantId) {
  const tenant = findTenant(tenantId),
    limit = tenant ? publicTenant(tenant).subscription.plan?.seatLimit : null;
  if (!limit) fail('Company plan is not configured.', 409);
  const seats = accessDatabase().prepare('SELECT count(*) AS n FROM users WHERE tenant_id=? AND active=1').get(tenantId).n;
  if (seats >= limit) fail('Company user limit reached. Ask Signinn to change the plan.', 409);
}
export function assertUserPermission(id, permission) {
  if (!id || ['system', 'local-development', 'legacy-admin'].includes(id)) return;
  const user = findUser(id);
  const tenantId = tenantContext()?.tenant?.id;
  if (!user?.active || !ROLES[user.role]?.includes(permission) || tenantId && user.tenant_id !== tenantId) throw Object.assign(new Error('Your access to this action was revoked.'), {
    statusCode: 403
  });
}

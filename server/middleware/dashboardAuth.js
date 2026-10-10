import { randomBytes, createHash } from 'node:crypto';
import express from 'express';
import config from '../config/env.js';
import {findTenant,publicTenant} from '../services/tenantService.js';
import { hashPassword, verifyPassword, validHash } from '../services/passwordService.js';
import { hasUsers, findUser, findUserByEmail, publicUser, ROLES, completeSetup, accessDatabase, audit } from '../services/accessService.js';
export { hashPassword };
const sessions = new Map(),
  attempts = new Map();
const cookieName = 'spicecoast_session',
  lifetime = 8 * 60 * 60 * 1000;
const legacyConfigured = () => Boolean(config.ADMIN_EMAIL && validHash(config.ADMIN_PASSWORD_HASH));
const legacy = () => ({
  id: 'legacy-admin',
  email: config.ADMIN_EMAIL,
  name: 'Workspace administrator',
  role: 'super_admin',
  active: 1,
  password_hash: config.ADMIN_PASSWORD_HASH,
  daily_lead_limit: config.DAILY_LEAD_LIMIT,
  version: createHash('sha256').update(config.ADMIN_EMAIL + config.ADMIN_PASSWORD_HASH).digest('hex')
});
const configured = () => hasUsers() || legacyConfigured();
const developmentAccess = req => config.NODE_ENV === 'development' && !config.ADMIN_EMAIL && !config.ADMIN_PASSWORD_HASH && !hasUsers() && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.get('host') || '');
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: config.NODE_ENV === 'production',
  path: '/'
});
function prune() {
  const now = Date.now();
  for (const [k, v] of sessions) if (v.expires <= now) sessions.delete(k);
  for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
}
function currentUser(id) {
  return id === 'legacy-admin' && !hasUsers() && legacyConfigured() ? legacy() : findUser(id);
}
function getSession(req) {
  prune();
  const token = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  const session = sessions.get(token);
  if (!session) return null;
  const user = currentUser(session.userId);
  if (!user?.active || !user.password_hash || user.version !== session.version) {
    sessions.delete(token);
    return null;
  }
  return {
    ...session,
    token,
    user: publicUser(user)
  };
}
export function sameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}
export function requireDashboardAuth(req, res, next) {
  res.set('Cache-Control', 'no-store');
  if (!sameOrigin(req)) return res.status(403).json({
    error: 'Cross-origin requests are not allowed.'
  });
  if (developmentAccess(req)) {
    req.dashboardSession = {
      user: {
        id: 'local-development',
        email: '',
        name: 'Local development',
        role: 'super_admin',
        permissions: [...ROLES.super_admin, ...ROLES.company_admin],
        dailyLeadLimit: config.DAILY_LEAD_LIMIT
      }
    };
    return next();
  }
  if (!configured()) return res.status(503).json({
    error: 'Dashboard access is not configured. Run npm run admin:setup -- your@email to create the first super admin.'
  });
  const session = getSession(req);
  if (!session) return res.status(401).json({
    error: 'Sign in to continue.'
  });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-CSRF-Token') !== session.csrfToken) return res.status(403).json({
    error: 'Session verification failed. Reload and try again.'
  });
  req.dashboardSession = session;
  next();
}
export const requirePermission = permission => (req, res, next) => req.dashboardSession?.user?.permissions?.includes(permission) ? next() : res.status(403).json({
  error: 'Your role does not allow this action.'
});
function throttle(req, res) {
  prune();
  const key = req.ip;
  const item = attempts.get(key) || {
    count: 0,
    until: Date.now() + 15 * 60 * 1000
  };
  if (item.count >= 10 || attempts.size >= 10000) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((item.until - Date.now()) / 1000))));
    res.status(429).json({
      error: 'Too many sign-in attempts. Try again later.'
    });
    return false;
  }
  item.count++;
  attempts.set(key, item);
  return true;
}
const replySession = session => ({
  enabled: true,
  authenticated: Boolean(session),
  ...(session ? {
    email: session.user.email,
    user: session.user,
    csrfToken: session.csrfToken
  } : {})
});
export const authRoutes = express.Router();
authRoutes.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
authRoutes.get('/session', (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({
    error: 'Cross-origin requests are not allowed.'
  });
  if (developmentAccess(req)) return res.json({
    enabled: false,
    authenticated: true,
    user: {
      id: 'local-development',
      name: 'Local development',
      role: 'super_admin',
      permissions: [...ROLES.super_admin, ...ROLES.company_admin]
    }
  });
  if (!configured()) return res.status(503).json({
    error: 'Create the first super admin with npm run admin:setup -- your@email.'
  });
  res.json(replySession(getSession(req)));
});
authRoutes.post('/activate', async (req, res, next) => {
  try {
    if (!sameOrigin(req)) return res.status(403).json({
      error: 'Cross-origin activation is not allowed.'
    });
    if (!throttle(req, res)) return;
    const {
      email,
      token,
      password
    } = req.body || {};
    await completeSetup(email, token, password);
    attempts.delete(req.ip);
    res.json({
      success: true
    });
  } catch (e) {
    next(e);
  }
});
authRoutes.post('/login', async (req, res, next) => {
  try {
    if (!sameOrigin(req)) return res.status(403).json({
      error: 'Cross-origin sign-in is not allowed.'
    });
    if (!configured()) return res.status(503).json({
      error: 'Dashboard access is not configured.'
    });
    if (!throttle(req, res)) return;
    const {
      email,
      password
    } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || password.length > 1024) return res.status(400).json({
      error: 'Enter your email and password.'
    });
    const user = hasUsers() ? findUserByEmail(email.toLowerCase().trim()) : legacy();
    // Always derive a hash, including unknown accounts, to reduce account timing leaks.
    const hash = user?.password_hash || 'scrypt:00000000000000000000000000000000:' + '0'.repeat(128);
    const correct = await verifyPassword(password, hash);
    if (!correct || !user?.active || user.email.toLowerCase() !== email.trim().toLowerCase()) return res.status(401).json({
      error: 'Email or password is incorrect.'
    });
    if(user.tenant_id){const access=publicTenant(findTenant(user.tenant_id))?.subscription;if(!access?.allowed)return res.status(403).json({error:access?.reason || 'Company access is unavailable.',code:'SUBSCRIPTION_ACCESS_BLOCKED'});}
    attempts.delete(req.ip);
    const old = getSession(req);
    if (old) sessions.delete(old.token);
    if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value);
    const token = randomBytes(32).toString('hex');
    const session = {
      userId: user.id,
      version: user.version,
      csrfToken: randomBytes(32).toString('hex'),
      expires: Date.now() + lifetime
    };
    sessions.set(token, session);
    if (user.id !== 'legacy-admin') {
      accessDatabase().prepare('UPDATE users SET last_login_at=? WHERE id=?').run(new Date().toISOString(), user.id);
      audit(user.id, 'account.login', user.id);
    }
    res.cookie(cookieName, token, {
      ...cookieOptions(),
      maxAge: lifetime
    });
    res.json(replySession({
      ...session,
      user: publicUser(user)
    }));
  } catch (e) {
    next(e);
  }
});
authRoutes.post('/logout', requireDashboardAuth, (req, res) => {
  if (req.dashboardSession) sessions.delete(req.dashboardSession.token);
  res.clearCookie(cookieName, cookieOptions());
  res.json({
    authenticated: false
  });
});

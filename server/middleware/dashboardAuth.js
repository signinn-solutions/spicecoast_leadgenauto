import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import config from '../config/env.js';

const derive = promisify(scrypt);
const sessions = new Map();
const attempts = new Map();
const cookieName = 'spicecoast_session';
const lifetime = 8 * 60 * 60 * 1000;
const fingerprint = () => createHash('sha256').update(`${config.ADMIN_EMAIL}:${config.ADMIN_PASSWORD_HASH}`).digest('hex');
const configured = () => Boolean(config.ADMIN_EMAIL && /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(config.ADMIN_PASSWORD_HASH || ''));
const local = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const developmentAccess = (req) => config.NODE_ENV === 'development' && !config.ADMIN_EMAIL && !config.ADMIN_PASSWORD_HASH && local(req) && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.get('host') || '');
const cookieOptions = () => ({ httpOnly: true, sameSite: 'strict', secure: config.NODE_ENV === 'production', path: '/' });

function prune() {
  const now = Date.now();
  for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
}

function getSession(req) {
  prune();
  const token = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const session = sessions.get(token);
  if (!session || session.fingerprint !== fingerprint()) return null;
  return { ...session, token };
}

function sameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true; // Non-browser clients must still provide the CSRF token.
  try { return new URL(origin).host === req.get('host'); } catch { return false; }
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}

export function requireDashboardAuth(req, res, next) {
  res.set('Cache-Control', 'no-store');
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
  if (developmentAccess(req)) return next();
  if (!configured()) return res.status(503).json({ error: 'Dashboard access is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH on the server.' });
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Sign in to continue.' });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-CSRF-Token') !== session.csrfToken) {
    return res.status(403).json({ error: 'Session verification failed. Reload and try again.' });
  }
  req.dashboardSession = session;
  next();
}

export const authRoutes = express.Router();
authRoutes.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
authRoutes.get('/session', (req, res) => {
  if (developmentAccess(req)) return res.json({ enabled: false, authenticated: true });
  if (!configured()) return res.status(503).json({ error: 'Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH on the server to enable dashboard access.' });
  const session = getSession(req);
  res.json({ enabled: true, authenticated: Boolean(session), ...(session ? { email: config.ADMIN_EMAIL, csrfToken: session.csrfToken } : {}) });
});
authRoutes.post('/login', async (req, res, next) => {
  try {
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Cross-origin sign-in is not allowed.' });
    if (!configured()) return res.status(503).json({ error: 'Dashboard access is not configured.' });
    prune();
    const address = req.ip;
    const attempt = attempts.get(address) || { count: 0, until: Date.now() + 15 * 60 * 1000 };
    if (attempt.count >= 10 || attempts.size >= 10000) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((attempt.until - Date.now()) / 1000))));
      return res.status(429).json({ error: 'Too many sign-in attempts. Try again later.' });
    }
    attempt.count += 1;
    attempts.set(address, attempt);
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || password.length > 1024) return res.status(400).json({ error: 'Enter your email and password.' });
    const [, salt, expected] = config.ADMIN_PASSWORD_HASH.split(':');
    const actual = await derive(password, salt, 64);
    if (!timingSafeEqual(actual, Buffer.from(expected, 'hex')) || email.toLowerCase().trim() !== config.ADMIN_EMAIL.toLowerCase()) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    attempts.delete(address);
    const old = getSession(req);
    if (old) sessions.delete(old.token);
    // Bound memory in this single-process, single-business application.
    if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
    const token = randomBytes(32).toString('hex');
    const session = { csrfToken: randomBytes(32).toString('hex'), expires: Date.now() + lifetime, fingerprint: fingerprint() };
    sessions.set(token, session);
    res.cookie(cookieName, token, { ...cookieOptions(), maxAge: lifetime });
    res.json({ enabled: true, authenticated: true, email: config.ADMIN_EMAIL, csrfToken: session.csrfToken });
  } catch (error) { next(error); }
});
authRoutes.post('/logout', requireDashboardAuth, (req, res) => {
  if (req.dashboardSession) sessions.delete(req.dashboardSession.token);
  res.clearCookie(cookieName, cookieOptions());
  res.json({ authenticated: false });
});

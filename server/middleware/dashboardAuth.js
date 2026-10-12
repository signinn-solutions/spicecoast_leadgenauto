import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import config from '../config/env.js';
import { getUserByEmail, getUserById, verifyUserPassword, recordUserLogin, seedDefaultUsers } from '../services/userService.js';

const derive = promisify(scrypt);
const sessions = new Map();
const attempts = new Map();
const cookieName = 'spicecoast_session';
const lifetime = 8 * 60 * 60 * 1000;

export const fingerprint = () =>
  createHash('sha256').update(`${config.ADMIN_EMAIL}:${config.ADMIN_PASSWORD_HASH}`).digest('hex');

const configured = () =>
  Boolean(config.ADMIN_EMAIL && /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(config.ADMIN_PASSWORD_HASH || ''));

const local = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

const developmentAccess = (req) =>
  config.NODE_ENV === 'development' &&
  !config.ADMIN_EMAIL &&
  !config.ADMIN_PASSWORD_HASH &&
  local(req) &&
  /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.get('host') || '');

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: config.NODE_ENV === 'production',
  path: '/',
});

function prune() {
  const now = Date.now();
  for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
}

function getSession(req) {
  prune();
  const token = (req.headers.cookie || '')
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);

  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;

  // If session belongs to config admin, verify fingerprint against current config
  if (session.isConfigAdmin) {
    if (session.fingerprint !== fingerprint()) {
      sessions.delete(token);
      return null;
    }
  } else {
    const user = getUserById(session.userId);
    const currentFingerprint = user && createHash('sha256')
      .update(`${user.id}:${user.password_hash}:${user.role}:${user.status}`).digest('hex');
    if (!user || user.status !== 'active' || currentFingerprint !== session.fingerprint) {
      sessions.delete(token);
      return null;
    }
    session.name = user.name;
  }

  return { ...session, token };
}

function sameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true; // Non-browser clients must still provide the CSRF token.
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}

export function requireDashboardAuth(req, res, next) {
  res.set('Cache-Control', 'no-store');
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
  
  const session = getSession(req);
  if (session) {
    req.dashboardSession = session;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-CSRF-Token') !== session.csrfToken) {
      return res.status(403).json({ error: 'Session verification failed. Reload and try again.' });
    }
    return next();
  }

  if (developmentAccess(req)) {
    req.dashboardSession = {
      userId: 'dev_superadmin',
      email: 'superadmin@thespicecoast.com',
      name: 'SpiceCoast SuperAdmin',
      role: 'superadmin',
      csrfToken: 'dev_csrf_token',
    };
    return next();
  }

  if (!configured()) return res.status(503).json({ error: 'Dashboard access is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH on the server.' });
  return res.status(401).json({ error: 'Sign in to continue.' });
}

export function requireSuperadmin(req, res, next) {
  if (!req.dashboardSession) {
    return res.status(401).json({ error: 'Sign in to continue.' });
  }
  if (req.dashboardSession.role !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin privileges required to access this resource.' });
  }
  next();
}

export const authRoutes = express.Router();
authRoutes.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

authRoutes.get('/session', async (req, res) => {
  const session = getSession(req);
  if (session) {
    return res.json({
      enabled: true,
      authenticated: true,
      email: session.email,
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
        role: session.role,
      },
      csrfToken: session.csrfToken,
    });
  }

  if (developmentAccess(req)) {
    await seedDefaultUsers().catch(() => {});
    return res.json({
      enabled: true,
      authenticated: false,
      isDev: true,
      defaultAccounts: [
        { email: 'superadmin@thespicecoast.com', role: 'superadmin', name: 'SpiceCoast SuperAdmin' },
        { email: 'leadgen@thespicecoast.com', role: 'user', name: 'SpiceCoast Lead Operations' },
      ],
    });
  }

  if (!configured()) {
    return res.status(503).json({ error: 'Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH on the server to enable dashboard access.' });
  }

  res.json({
    enabled: true,
    authenticated: false,
  });
});

authRoutes.post('/login', async (req, res, next) => {
  try {
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Cross-origin sign-in is not allowed.' });
    if (!configured() && !developmentAccess(req)) {
      return res.status(503).json({ error: 'Dashboard access is not configured.' });
    }
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
    if (typeof email !== 'string' || typeof password !== 'string' || password.length > 1024) {
      return res.status(400).json({ error: 'Enter your email and password.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    let authUser = null;
    let isConfigAdmin = false;

    // 1. Check if config admin matches
    if (
      config.ADMIN_EMAIL &&
      config.ADMIN_PASSWORD_HASH &&
      cleanEmail === config.ADMIN_EMAIL.toLowerCase().trim()
    ) {
      const [, salt, expected] = config.ADMIN_PASSWORD_HASH.split(':');
      if (salt && expected) {
        const actual = await derive(password, salt, 64);
        if (timingSafeEqual(actual, Buffer.from(expected, 'hex'))) {
          authUser = {
            id: 'admin_config',
            email: config.ADMIN_EMAIL,
            name: 'SpiceCoast SuperAdmin',
            role: 'superadmin',
            status: 'active',
          };
          isConfigAdmin = true;
        }
      }
      if (!authUser) {
        return res.status(401).json({ error: 'Email or password is incorrect.' });
      }
    }

    // 2. Check SQLite users table
    if (!authUser) {
      try {
        await seedDefaultUsers().catch(() => {});
        const dbUser = getUserByEmail(cleanEmail);
        if (dbUser) {
          if (dbUser.status === 'suspended') {
            return res.status(403).json({ error: 'This account has been suspended. Please contact your SuperAdmin.' });
          }
          const isValid = await verifyUserPassword(password, dbUser.password_hash);
          if (isValid) {
            authUser = {
              id: dbUser.id,
              email: dbUser.email,
              name: dbUser.name,
              role: dbUser.role || 'user',
              status: dbUser.status,
              passwordHash: dbUser.password_hash,
            };
            recordUserLogin(dbUser.id, address);
          }
        }
      } catch (dbErr) {
        console.warn('[User Auth DB lookup error]:', dbErr.message);
      }
    }

    if (!authUser) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }

    attempts.delete(address);
    const old = getSession(req);
    if (old) sessions.delete(old.token);
    if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);

    const token = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    const session = {
      userId: authUser.id,
      email: authUser.email,
      name: authUser.name,
      role: authUser.role,
      isConfigAdmin,
      csrfToken,
      expires: Date.now() + lifetime,
      fingerprint: isConfigAdmin ? fingerprint() : createHash('sha256')
        .update(`${authUser.id}:${authUser.passwordHash}:${authUser.role}:${authUser.status}`).digest('hex'),
    };
    sessions.set(token, session);

    res.cookie(cookieName, token, { ...cookieOptions(), maxAge: lifetime });
    res.json({
      enabled: true,
      authenticated: true,
      user: {
        id: authUser.id,
        email: authUser.email,
        name: authUser.name,
        role: authUser.role,
      },
      email: authUser.email,
      csrfToken: session.csrfToken,
    });
  } catch (error) {
    next(error);
  }
});

authRoutes.post('/logout', requireDashboardAuth, (req, res) => {
  if (req.dashboardSession) sessions.delete(req.dashboardSession.token);
  res.clearCookie(cookieName, cookieOptions());
  res.json({ authenticated: false });
});

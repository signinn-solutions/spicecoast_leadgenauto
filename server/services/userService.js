import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/env.js';
import { getDatabase } from './storageService.js';

const derive = promisify(scrypt);

export async function hashUserPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}

export async function verifyUserPassword(password, storedHash) {
  if (!password || !storedHash || typeof storedHash !== 'string') return false;
  if (!storedHash.startsWith('scrypt:')) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [, salt, expected] = parts;
  try {
    const actual = await derive(password, salt, 64);
    return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

let seeded = false;

export async function seedDefaultUsers() {
  if (config.NODE_ENV === 'production') {
    const db = getDatabase();
    if (config.ADMIN_EMAIL && /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(config.ADMIN_PASSWORD_HASH)) {
      db.prepare(`INSERT OR IGNORE INTO users (id,email,password_hash,name,role,status,active,version,daily_lead_limit,notes)
        VALUES (?, ?, ?, ?, 'superadmin', 'active', 1, 1, -1, ?)`)
        .run('usr_configured_superadmin', config.ADMIN_EMAIL.toLowerCase(), config.ADMIN_PASSWORD_HASH, 'Signinn SuperAdmin', 'Provisioned from explicit administrator configuration');
    }
    // Existing installations must rotate seeded credentials before going public.
    for (const [email, password] of [
      ['admin@signinn.in', 'Admin@Signinn123'],
      ['admin@thespicecoast.com', 'SpiceCoast_Admin_c3031b5744c12df9!'],
    ]) {
      const user = db.prepare('SELECT password_hash, status FROM users WHERE LOWER(email) = ?').get(email);
      if (email === config.ADMIN_EMAIL?.toLowerCase() && user?.password_hash === config.ADMIN_PASSWORD_HASH) continue;
      if (user?.status === 'active' && await verifyUserPassword(password, user.password_hash)) {
        throw new Error('An active account still uses a development default password. Change its password or suspend it before production startup.');
      }
    }
    return;
  }
  if (seeded) return;
  const db = getDatabase();

  const findStmt = db.prepare('SELECT id, email FROM users WHERE LOWER(email) = ?');
  const insertStmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role, status, active, version, daily_lead_limit, created_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1, -1, datetime('now'), ?)
  `);

  // Development-only seed accounts.
  const superadminEmail = 'admin@signinn.in';
  const existingSuperadmin = findStmt.get(superadminEmail.toLowerCase());
  if (!existingSuperadmin) {
    const superadminHash = await hashUserPassword('Admin@Signinn123');
    insertStmt.run(
      'usr_superadmin_signinn',
      superadminEmail,
      superadminHash,
      'Signinn SuperAdmin',
      'superadmin',
      'active',
      'Signinn Master System & App Administrator'
    );
    addAuditLog({
      userEmail: 'system',
      action: 'superadmin_seeded',
      details: `Created superadmin account: ${superadminEmail}`,
      category: 'system',
    });
  }

  const spicecoastUserEmail = 'admin@thespicecoast.com';
  const existingSpicecoastUser = findStmt.get(spicecoastUserEmail.toLowerCase());
  if (!existingSpicecoastUser) {
    const spicecoastUserHash = await hashUserPassword('SpiceCoast_Admin_c3031b5744c12df9!');
    insertStmt.run(
      'usr_spicecoast_leadgen',
      spicecoastUserEmail,
      spicecoastUserHash,
      'SpiceCoast Lead Operations',
      'user',
      'active',
      'SpiceCoast Lead Generation & Outreach User'
    );
    addAuditLog({
      userEmail: 'system',
      action: 'user_seeded',
      details: `Created SpiceCoast leadgen user account: ${spicecoastUserEmail}`,
      category: 'system',
    });
  }

  seeded = true;
}

export function getAllUsers() {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, email, name, role, status, last_login_at, created_at, created_by, notes
    FROM users
    ORDER BY created_at ASC
  `).all();
  return rows;
}

export function getUserById(id) {
  const db = getDatabase();
  return db.prepare(`
    SELECT id, email, name, role, status, last_login_at, created_at, created_by, notes, password_hash
    FROM users WHERE id = ?
  `).get(id);
}

export function getUserByEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const db = getDatabase();
  return db.prepare(`
    SELECT id, email, name, role, status, last_login_at, created_at, created_by, notes, password_hash
    FROM users WHERE LOWER(email) = ?
  `).get(email.toLowerCase().trim());
}

export async function createUser({ name, email, password, role = 'user', createdBy = 'superadmin', notes = '' }) {
  if (!email || !email.includes('@')) {
    const err = new Error('A valid email address is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!password || password.length < 8) {
    const err = new Error(`Password must be at least 8 characters long.`);
    err.statusCode = 400;
    throw err;
  }
  if (!name || !name.trim()) {
    const err = new Error('User display name is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!['superadmin', 'user'].includes(role)) {
    const err = new Error('Role must be either superadmin or user.');
    err.statusCode = 400;
    throw err;
  }

  const existing = getUserByEmail(email);
  if (existing) {
    const err = new Error(`User with email "${email}" already exists.`);
    err.statusCode = 409;
    throw err;
  }

  const id = `usr_${Date.now()}_${randomBytes(4).toString('hex')}`;
  const passwordHash = await hashUserPassword(password);
  const db = getDatabase();

  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role, status, active, version, daily_lead_limit, created_at, created_by, notes)
    VALUES (?, ?, ?, ?, ?, 'active', 1, 1, -1, datetime('now'), ?, ?)
  `).run(id, email.toLowerCase().trim(), passwordHash, name.trim(), role, createdBy, notes);

  addAuditLog({
    userEmail: createdBy,
    action: 'user_created',
    details: `Created new ${role} account: ${email} (${name})`,
    category: 'admin',
  });

  return { id, email: email.toLowerCase().trim(), name: name.trim(), role, status: 'active', notes };
}

export async function updateUser(id, { name, role, status, password, notes }, actorEmail = 'superadmin') {
  const user = getUserById(id);
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }

  let newHash = user.password_hash;
  if (password) {
    if (password.length < 8) {
      const err = new Error(`New password must be at least 8 characters long.`);
      err.statusCode = 400;
      throw err;
    }
    newHash = await hashUserPassword(password);
  }

  const updatedName = name !== undefined ? name.trim() : user.name;
  const updatedRole = role !== undefined ? role : user.role;
  const updatedStatus = status !== undefined ? status : user.status;
  const updatedNotes = notes !== undefined ? notes : user.notes;

  if (user.email.toLowerCase() === actorEmail.toLowerCase() &&
      (updatedRole !== user.role || updatedStatus !== user.status)) {
    const err = new Error('You cannot change your own role or suspend your own account.');
    err.statusCode = 400;
    throw err;
  }

  if (!['superadmin', 'user'].includes(updatedRole)) {
    const err = new Error('Invalid role specified.');
    err.statusCode = 400;
    throw err;
  }
  if (!['active', 'suspended'].includes(updatedStatus)) {
    const err = new Error('Invalid status specified.');
    err.statusCode = 400;
    throw err;
  }

  const db = getDatabase();
  db.prepare(`
    UPDATE users
    SET name = ?, role = ?, status = ?, password_hash = ?, notes = ?
    WHERE id = ?
  `).run(updatedName, updatedRole, updatedStatus, newHash, updatedNotes, id);

  addAuditLog({
    userEmail: actorEmail,
    action: 'user_updated',
    details: `Updated account ${user.email}: role=${updatedRole}, status=${updatedStatus}${password ? ', password reset' : ''}`,
    category: 'admin',
  });

  return { id, email: user.email, name: updatedName, role: updatedRole, status: updatedStatus, notes: updatedNotes };
}

export function deleteUser(id, actorEmail = 'superadmin') {
  const user = getUserById(id);
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }

  if (user.email.toLowerCase() === actorEmail.toLowerCase()) {
    const err = new Error('You cannot delete your own account.');
    err.statusCode = 400;
    throw err;
  }

  const db = getDatabase();
  const deletedData = db.transaction(() => {
    const owned = db.prepare("SELECT id FROM leads WHERE json_extract(data, '$.ownerUserId') = ?").all(id);
    const leadIds = new Set(owned.map(lead => lead.id));
    const leadCount = db.prepare("DELETE FROM leads WHERE json_extract(data, '$.ownerUserId') = ?").run(id).changes;
    const searchCount = db.prepare('DELETE FROM searches WHERE owner_user_id = ?').run(id).changes;
    const removed = { leads: leadCount, searches: searchCount, outreach: 0, mailbox: 0 };
    for (const [name, category] of [['outreach_history', 'outreach'], ['mailbox_history', 'mailbox']]) {
      const row = db.prepare('SELECT value FROM datasets WHERE name = ?').get(name);
      const records = row ? JSON.parse(row.value) : [];
      const remaining = records.filter(record => record.ownerUserId !== id && !(category === 'outreach' && leadIds.has(record.leadId)));
      removed[category] = records.length - remaining.length;
      db.prepare('UPDATE datasets SET value = ? WHERE name = ?').run(JSON.stringify(remaining), name);
    }
    const seen = db.prepare("SELECT value FROM datasets WHERE name = 'seen_places'").get();
    if (seen) {
      const records = JSON.parse(seen.value);
      for (const [key, record] of Object.entries(records)) if (leadIds.has(key) || record.ownerUserId === id) delete records[key];
      db.prepare("UPDATE datasets SET value = ? WHERE name = 'seen_places'").run(JSON.stringify(records));
    }
    const legacy = db.prepare("SELECT value FROM datasets WHERE name = 'leads_history'").get();
    if (legacy) {
      const records = JSON.parse(legacy.value);
      records.leads = (records.leads || []).filter(lead => lead.ownerUserId !== id && !leadIds.has(lead.id));
      records.searches = (records.searches || []).filter(search => search.ownerUserId !== id);
      db.prepare("UPDATE datasets SET value = ? WHERE name = 'leads_history'").run(JSON.stringify(records));
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return removed;
  })();

  addAuditLog({
    userEmail: actorEmail,
    action: 'user_deleted',
    details: `Deleted account: ${user.email} (${user.name}); owned records removed: ${JSON.stringify(deletedData)}`,
    category: 'admin',
  });

  return { success: true, deletedEmail: user.email, deletedData };
}

export function recordUserLogin(id, ipAddress = '') {
  try {
    const db = getDatabase();
    db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    const user = getUserById(id);
    if (user) {
      addAuditLog({
        userEmail: user.email,
        action: 'user_login',
        details: `Successful login from ${ipAddress || 'client'}`,
        category: 'auth',
        ipAddress,
      });
    }
  } catch {}
}

export function addAuditLog({ userEmail = 'system', action, details = '', category = 'general', ipAddress = '' }) {
  try {
    const db = getDatabase();
    const id = `log_${Date.now()}_${randomBytes(3).toString('hex')}`;
    db.prepare(`
      INSERT INTO audit_logs (id, user_email, action, details, category, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userEmail, action, details, category, ipAddress);
  } catch (err) {
    console.warn(`[AuditLog Error]: ${err.message}`);
  }
}

export function getAuditLogs(limit = 100) {
  const db = getDatabase();
  return db.prepare(`
    SELECT id, timestamp, user_email, action, details, category, ip_address
    FROM audit_logs
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(Math.min(500, Math.max(1, limit)));
}

export function getSystemMetrics() {
  const db = getDatabase();
  const dbFile = path.resolve(config.DB_PATH);

  let dbSize = 0;
  let walSize = 0;
  try {
    if (fs.existsSync(dbFile)) dbSize = fs.statSync(dbFile).size;
    const walFile = `${dbFile}-wal`;
    if (fs.existsSync(walFile)) walSize = fs.statSync(walFile).size;
  } catch {}

  const leadCount = db.prepare('SELECT count(*) as cnt FROM leads').get().cnt;
  const searchCount = db.prepare('SELECT count(*) as cnt FROM searches').get().cnt;
  const userCount = db.prepare('SELECT count(*) as cnt FROM users').get().cnt;
  const auditLogCount = db.prepare('SELECT count(*) as cnt FROM audit_logs').get().cnt;

  const mem = process.memoryUsage();

  return {
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    memory: {
      rssMb: (mem.rss / 1024 / 1024).toFixed(1),
      heapTotalMb: (mem.heapTotal / 1024 / 1024).toFixed(1),
      heapUsedMb: (mem.heapUsed / 1024 / 1024).toFixed(1),
      externalMb: (mem.external / 1024 / 1024).toFixed(1),
    },
    database: {
      path: path.resolve(config.DB_PATH),
      path: dbFile,
      sizeBytes: dbSize,
      sizeFormatted: `${(dbSize / 1024 / 1024).toFixed(2)} MB`,
      walSizeBytes: walSize,
      walFormatted: `${(walSize / 1024).toFixed(1)} KB`,
      tables: {
        leads: leadCount,
        searches: searchCount,
        users: userCount,
        auditLogs: auditLogCount,
      },
    },
  };
}

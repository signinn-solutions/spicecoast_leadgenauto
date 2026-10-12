import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import config from '../config/env.js';

const datasets = {
  daily_usage: ['DAILY_USAGE_FILE', { date: '', count: 0 }],
  reply_usage: ['REPLY_USAGE_FILE', { date: '', count: 0 }],
  leads_history: ['LEADS_HISTORY_FILE', { leads: [], searches: [] }],
  seen_places: ['SEEN_PLACES_FILE', {}],
  mailbox_history: ['MAILBOX_HISTORY_FILE', []],
  outreach_history: ['OUTREACH_HISTORY_FILE', []],
};

let database;
let openPath;
const operationQueues = new Map();

export async function withStorageOperationLock(name, operation) {
  if (typeof operation !== 'function') throw new TypeError('A storage operation is required.');
  const key = `${path.resolve(config.DB_PATH)}:${name}`;
  const previous = operationQueues.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  operationQueues.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    if (operationQueues.get(key) === current) operationQueues.delete(key);
    release();
  }
}

// Lead discovery and manual outreach both update outreach_history. Keep those
// read/modify/write cycles under the same lock, including across async work.
export function withOutreachHistoryLock(operation) {
  return withStorageOperationLock('outreach-history', operation);
}

// Inbound processing and reviewed sends both read, await, then write the
// mailbox list. They must share one process-level lock to preserve each edit.
export function withMailboxHistoryLock(operation) {
  return withStorageOperationLock('mailbox-history', operation);
}

export function closeStorage() {
  if (database) database.close();
  database = undefined;
  openPath = undefined;
}

function extractDomain(url) {
  if (!url) return null;
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

function leadToRow(lead) {
  const {
    id, name, domain, website, phone, phoneStatus, email, emailStatus,
    address, city, country, businessType, source, status,
    first_contacted_at, last_contacted_at, foundAt, created_at,
    ...extra
  } = lead || {};

  const cleanDomain = domain || extractDomain(website);
  const createdAt = created_at || foundAt || getTodayDateString();

  return {
    id: id || `lead-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name || 'Unnamed Business',
    domain: cleanDomain,
    website: website || null,
    phone: phone || null,
    phone_status: phoneStatus || null,
    email: email || null,
    email_status: emailStatus || null,
    address: address || null,
    city: city || null,
    country: country || null,
    business_type: businessType || null,
    source: source || 'live',
    status: status || 'discovered',
    first_contacted_at: first_contacted_at || null,
    last_contacted_at: last_contacted_at || null,
    created_at: createdAt,
    data: Object.keys(extra).length > 0 ? JSON.stringify(extra) : null,
  };
}

function rowToLead(row) {
  if (!row) return null;
  let extra = {};
  if (row.data) {
    try { extra = JSON.parse(row.data); } catch {}
  }
  return {
    ...extra,
    id: row.id,
    name: row.name,
    domain: row.domain,
    website: row.website,
    phone: row.phone,
    phoneStatus: row.phone_status,
    email: row.email,
    emailStatus: row.email_status,
    address: row.address,
    city: row.city,
    country: row.country,
    businessType: row.business_type,
    source: row.source,
    status: row.status,
    first_contacted_at: row.first_contacted_at,
    last_contacted_at: row.last_contacted_at,
    foundAt: row.created_at ? (row.created_at.length > 10 ? row.created_at.slice(0, 10) : row.created_at) : getTodayDateString(),
  };
}

export function getDatabase() {
  const file = path.resolve(config.DB_PATH);
  if (database && openPath === file) return database;
  closeStorage();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file, { timeout: 5000 });
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    // Normalized tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT,
        website TEXT,
        phone TEXT,
        phone_status TEXT,
        email TEXT,
        email_status TEXT,
        address TEXT,
        city TEXT,
        country TEXT,
        business_type TEXT,
        source TEXT,
        status TEXT DEFAULT 'discovered',
        first_contacted_at TEXT,
        last_contacted_at TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        data TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_leads_domain ON leads(domain);
      CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
      CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

      CREATE TABLE IF NOT EXISTS searches (
        id TEXT PRIMARY KEY,
        query TEXT,
        count INTEGER,
        duplicates_skipped INTEGER,
        date TEXT,
        mode TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS daily_usage (
        date TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS datasets (name TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'active',
        active INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL DEFAULT 1,
        daily_lead_limit INTEGER NOT NULL DEFAULT -1,
        last_login_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        notes TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_email TEXT,
        action TEXT NOT NULL,
        details TEXT,
        category TEXT DEFAULT 'general',
        ip_address TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
    `);

    // Column migrations for users table
    try { db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN version INTEGER DEFAULT 1"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN daily_lead_limit INTEGER DEFAULT -1"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN last_login_at DATETIME"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN created_by TEXT"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN notes TEXT"); } catch {}

    // Legacy dataset migration check
    const exists = db.prepare('SELECT 1 FROM datasets WHERE name = ?');
    const insertDataset = db.prepare('INSERT OR IGNORE INTO datasets (name, value) VALUES (?, ?)');
    const setting = db.prepare('INSERT OR IGNORE INTO settings (name, value) VALUES (?, ?)');
    
    db.transaction(() => {
      for (const [name, [key, fallback]] of Object.entries(datasets)) {
        if (exists.get(name)) continue;
        const source = config[key];
        let value = fallback;
        if (fs.existsSync(source)) {
          try { value = JSON.parse(fs.readFileSync(source, 'utf8')); }
          catch (error) { throw new Error(`Cannot import legacy data from ${source}: ${error.message}`); }
        }
        insertDataset.run(name, JSON.stringify(value));
      }
      setting.run('auto_send', JSON.stringify(Boolean(config.AUTO_SEND)));
      setting.run('hunter_enabled', JSON.stringify(true));
    })();

    // Populate normalized leads table from legacy files / datasets if empty
    const leadCountRow = db.prepare('SELECT count(*) as cnt FROM leads').get();
    if (leadCountRow.cnt === 0) {
      let legacyData = null;
      if (fs.existsSync(config.LEADS_HISTORY_FILE)) {
        try { legacyData = JSON.parse(fs.readFileSync(config.LEADS_HISTORY_FILE, 'utf8')); } catch {}
      }
      if (!legacyData) {
        const dsRow = db.prepare('SELECT value FROM datasets WHERE name = ?').get('leads_history');
        if (dsRow) {
          try { legacyData = JSON.parse(dsRow.value); } catch {}
        }
      }
      if (legacyData && Array.isArray(legacyData.leads) && legacyData.leads.length > 0) {
        const insertLeadStmt = db.prepare(`
          INSERT OR IGNORE INTO leads (
            id, name, domain, website, phone, phone_status, email, email_status,
            address, city, country, business_type, source, status,
            first_contacted_at, last_contacted_at, created_at, data
          ) VALUES (
            @id, @name, @domain, @website, @phone, @phone_status, @email, @email_status,
            @address, @city, @country, @business_type, @source, @status,
            @first_contacted_at, @last_contacted_at, @created_at, @data
          )
        `);
        const insertSearchStmt = db.prepare(`
          INSERT OR IGNORE INTO searches (id, query, count, duplicates_skipped, date, mode, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        db.transaction(() => {
          for (const l of legacyData.leads) {
            insertLeadStmt.run(leadToRow(l));
          }
          if (Array.isArray(legacyData.searches)) {
            for (const s of legacyData.searches) {
              insertSearchStmt.run(
                String(s.id || Date.now()),
                s.query || '',
                Number(s.count) || 0,
                Number(s.duplicatesSkipped) || 0,
                s.date || getTodayDateString(),
                s.mode || 'live',
                s.date || getTodayDateString()
              );
            }
          }
        })();
      }
    }

    // Populate daily_usage table if empty
    const usageCountRow = db.prepare('SELECT count(*) as cnt FROM daily_usage').get();
    if (usageCountRow.cnt === 0) {
      let legacyUsage = null;
      if (fs.existsSync(config.DAILY_USAGE_FILE)) {
        try { legacyUsage = JSON.parse(fs.readFileSync(config.DAILY_USAGE_FILE, 'utf8')); } catch {}
      }
      if (!legacyUsage) {
        const dsRow = db.prepare('SELECT value FROM datasets WHERE name = ?').get('daily_usage');
        if (dsRow) {
          try { legacyUsage = JSON.parse(dsRow.value); } catch {}
        }
      }
      if (legacyUsage?.date) {
        db.prepare('INSERT OR IGNORE INTO daily_usage (date, count) VALUES (?, ?)').run(
          legacyUsage.date,
          Number(legacyUsage.count) || 0
        );
      }
    }
  } catch (error) {
    db.close();
    throw error;
  }
  database = db;
  openPath = file;
  return db;
}

function load(name) {
  const row = getDatabase().prepare('SELECT value FROM datasets WHERE name = ?').get(name);
  return row ? JSON.parse(row.value) : structuredClone(datasets[name][1]);
}

function save(name, value) {
  getDatabase().prepare('INSERT INTO datasets (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value')
    .run(name, JSON.stringify(value));
}

export function getTodayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function usage(name) {
  const today = getTodayDateString();
  const data = load(name);
  return { date: today, count: data?.date === today ? Math.max(0, Number(data.count) || 0) : 0 };
}

export function loadDailyUsage() {
  const today = getTodayDateString();
  const db = getDatabase();
  const row = db.prepare('SELECT count FROM daily_usage WHERE date = ?').get(today);
  if (row) {
    return { date: today, count: Math.max(0, Number(row.count) || 0) };
  }
  return usage('daily_usage');
}

export function saveDailyUsage(date, count) {
  const db = getDatabase();
  db.prepare('INSERT INTO daily_usage (date, count) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET count = excluded.count')
    .run(date, Number(count) || 0);
  save('daily_usage', { date, count });
}

export function loadReplyUsage() { return usage('reply_usage'); }
export function saveReplyUsage(date, count) { save('reply_usage', { date, count }); }

export function loadLeadsHistory() {
  const db = getDatabase();
  const leadRows = db.prepare('SELECT * FROM leads ORDER BY created_at DESC, rowid DESC').all();
  const searchRows = db.prepare('SELECT * FROM searches ORDER BY created_at DESC, id DESC LIMIT 50').all();
  return {
    leads: leadRows.map(rowToLead),
    searches: searchRows.map((s) => ({
      id: s.id,
      query: s.query,
      count: s.count,
      duplicatesSkipped: s.duplicates_skipped,
      date: s.date,
      mode: s.mode,
    })),
  };
}

export function saveLeadsHistory(value) {
  const db = getDatabase();
  const leads = Array.isArray(value?.leads) ? value.leads : [];
  const searches = Array.isArray(value?.searches) ? value.searches : [];

  const insertLeadStmt = db.prepare(`
    INSERT INTO leads (
      id, name, domain, website, phone, phone_status, email, email_status,
      address, city, country, business_type, source, status,
      first_contacted_at, last_contacted_at, created_at, data
    ) VALUES (
      @id, @name, @domain, @website, @phone, @phone_status, @email, @email_status,
      @address, @city, @country, @business_type, @source, @status,
      @first_contacted_at, @last_contacted_at, @created_at, @data
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      domain = excluded.domain,
      website = excluded.website,
      phone = excluded.phone,
      phone_status = excluded.phone_status,
      email = excluded.email,
      email_status = excluded.email_status,
      address = excluded.address,
      city = excluded.city,
      country = excluded.country,
      business_type = excluded.business_type,
      source = excluded.source,
      status = COALESCE(excluded.status, leads.status),
      first_contacted_at = COALESCE(excluded.first_contacted_at, leads.first_contacted_at),
      last_contacted_at = COALESCE(excluded.last_contacted_at, leads.last_contacted_at),
      data = excluded.data
  `);

  const insertSearchStmt = db.prepare(`
    INSERT INTO searches (id, query, count, duplicates_skipped, date, mode, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      query = excluded.query,
      count = excluded.count,
      duplicates_skipped = excluded.duplicates_skipped,
      date = excluded.date,
      mode = excluded.mode
  `);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM leads').run();
    for (const lead of leads) {
      insertLeadStmt.run(leadToRow(lead));
    }
    db.prepare('DELETE FROM searches').run();
    for (const s of searches) {
      insertSearchStmt.run(
        String(s.id || Date.now()),
        s.query || '',
        Number(s.count) || 0,
        Number(s.duplicatesSkipped) || 0,
        s.date || getTodayDateString(),
        s.mode || 'live',
        s.date || getTodayDateString()
      );
    }
    save('leads_history', value);
  });
  tx();
}

/**
 * Batch insert discovered leads and update daily usage and search log in a single atomic transaction.
 * Eliminates giant JSON deserialization / rewrite cycles.
 */
export function insertLeadsBatch(leadsList, options = {}) {
  const db = getDatabase();
  const { today, totalDailyCount, searchRecord, seenPlaces } = options;

  const insertStmt = db.prepare(`
    INSERT INTO leads (
      id, name, domain, website, phone, phone_status, email, email_status,
      address, city, country, business_type, source, status,
      first_contacted_at, last_contacted_at, created_at, data
    ) VALUES (
      @id, @name, @domain, @website, @phone, @phone_status, @email, @email_status,
      @address, @city, @country, @business_type, @source, @status,
      @first_contacted_at, @last_contacted_at, @created_at, @data
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      domain = excluded.domain,
      website = excluded.website,
      phone = excluded.phone,
      phone_status = excluded.phone_status,
      email = excluded.email,
      email_status = excluded.email_status,
      address = excluded.address,
      city = excluded.city,
      country = excluded.country,
      business_type = excluded.business_type,
      source = excluded.source,
      status = COALESCE(excluded.status, leads.status),
      first_contacted_at = COALESCE(excluded.first_contacted_at, leads.first_contacted_at),
      last_contacted_at = COALESCE(excluded.last_contacted_at, leads.last_contacted_at),
      data = excluded.data
  `);

  const updateDailyUsageStmt = db.prepare(`
    INSERT INTO daily_usage (date, count) VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET count = excluded.count
  `);

  const insertSearchStmt = db.prepare(`
    INSERT INTO searches (id, query, count, duplicates_skipped, date, mode, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      query = excluded.query,
      count = excluded.count,
      duplicates_skipped = excluded.duplicates_skipped,
      date = excluded.date,
      mode = excluded.mode
  `);

  const insertBatch = db.transaction((leads) => {
    for (const lead of leads) {
      insertStmt.run(leadToRow(lead));
    }
    if (today && totalDailyCount !== undefined) {
      updateDailyUsageStmt.run(today, totalDailyCount);
      save('daily_usage', { date: today, count: totalDailyCount });
    }
    if (searchRecord) {
      insertSearchStmt.run(
        String(searchRecord.id || Date.now()),
        searchRecord.query || '',
        Number(searchRecord.count) || 0,
        Number(searchRecord.duplicatesSkipped) || 0,
        searchRecord.date || today,
        searchRecord.mode || 'live',
        searchRecord.date || today
      );
    }
  });

  insertBatch(leadsList || []);

  if (seenPlaces) {
    saveSeenPlaces(seenPlaces);
  }
}

/**
 * Update single lead status without deserializing or rewriting the entire dataset.
 */
export function updateLeadStatus(idOrEmail, updates = {}) {
  const db = getDatabase();
  const { status, contactedAt } = updates;
  const leadRow = db.prepare('SELECT id FROM leads WHERE id = ? OR email = ?').get(idOrEmail, idOrEmail);
  if (!leadRow) return false;

  db.prepare(`
    UPDATE leads
    SET status = COALESCE(?, status),
        first_contacted_at = COALESCE(first_contacted_at, ?),
        last_contacted_at = COALESCE(?, last_contacted_at)
    WHERE id = ?
  `).run(
    status || null,
    contactedAt || null,
    contactedAt || null,
    leadRow.id
  );
  return true;
}

export function loadSeenPlaces() {
  const data = load('seen_places');
  const seen = data && typeof data === 'object' && !Array.isArray(data) ? { ...(data.places || data) } : {};
  const db = getDatabase();
  const leadRows = db.prepare('SELECT id, name, address, phone, website, domain, email, email_status, created_at FROM leads').all();
  for (const lead of leadRows) {
    if (!lead?.name) continue;
    const id = lead.id || `hist-${lead.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (!seen[id]) {
      seen[id] = {
        id,
        name: lead.name,
        address: lead.address || '',
        phone: lead.phone || '',
        website: lead.website || '',
        domain: lead.domain,
        email: lead.email || '',
        emailStatus: lead.email_status || 'unknown',
        foundAt: lead.created_at ? (lead.created_at.length > 10 ? lead.created_at.slice(0, 10) : lead.created_at) : getTodayDateString(),
      };
    }
  }
  return seen;
}
export function saveSeenPlaces(value) { save('seen_places', value); }

export function loadMailboxHistory() { const value = load('mailbox_history'); return Array.isArray(value) ? value : []; }
export function saveMailboxHistory(value) { save('mailbox_history', (Array.isArray(value) ? value : []).slice(0, 150)); }
export function loadOutreachHistory() { const value = load('outreach_history'); return Array.isArray(value) ? value : []; }
export function saveOutreachHistory(value) { save('outreach_history', (Array.isArray(value) ? value : []).slice(0, 200)); }

export function loadAutoSendSetting() {
  const row = getDatabase().prepare('SELECT value FROM settings WHERE name = ?').get('auto_send');
  return row ? Boolean(JSON.parse(row.value)) : Boolean(config.AUTO_SEND);
}
export function saveAutoSendSetting(value) {
  getDatabase().prepare('INSERT INTO settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value')
    .run('auto_send', JSON.stringify(Boolean(value)));
}

export function loadHunterSetting() {
  const row = getDatabase().prepare('SELECT value FROM settings WHERE name = ?').get('hunter_enabled');
  return row ? Boolean(JSON.parse(row.value)) : true;
}
export function saveHunterSetting(value) {
  getDatabase().prepare('INSERT INTO settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value')
    .run('hunter_enabled', JSON.stringify(Boolean(value)));
}

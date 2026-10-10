import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import config, {baseConfig} from '../config/env.js';
const datasets = {
  daily_usage: ['DAILY_USAGE_FILE', {
    date: '',
    count: 0
  }],
  reply_usage: ['REPLY_USAGE_FILE', {
    date: '',
    count: 0
  }],
  leads_history: ['LEADS_HISTORY_FILE', {
    leads: [],
    searches: []
  }],
  seen_places: ['SEEN_PLACES_FILE', {}],
  mailbox_history: ['MAILBOX_HISTORY_FILE', []],
  outreach_history: ['OUTREACH_HISTORY_FILE', []]
};
const databases = new Map();
const operationQueues = new Map();
export async function withStorageOperationLock(name, operation) {
  if (typeof operation !== 'function') throw new TypeError('A storage operation is required.');
  const key = `${path.resolve(config.DB_PATH)}:${name}`;
  const previous = operationQueues.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => {
    release = resolve;
  });
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
  for(const db of databases.values()) db.close();
  databases.clear();
}
export function getPlatformDatabase() {return openDatabase(path.resolve(baseConfig.DB_PATH));}
export function getDatabase() {return openDatabase(path.resolve(config.DB_PATH));}
function openDatabase(file) {
  if(databases.has(file)) return databases.get(file);
  fs.mkdirSync(path.dirname(file), {
    recursive: true
  });
  const db = new Database(file, {
    timeout: 5000
  });
  try {
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE IF NOT EXISTS datasets (name TEXT PRIMARY KEY, value TEXT NOT NULL)');
    db.exec('CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL)');
    const exists = db.prepare('SELECT 1 FROM datasets WHERE name = ?');
    const insert = db.prepare('INSERT OR IGNORE INTO datasets (name, value) VALUES (?, ?)');
    const setting = db.prepare('INSERT OR IGNORE INTO settings (name, value) VALUES (?, ?)');
    db.transaction(() => {
      for (const [name, [key, fallback]] of Object.entries(datasets)) {
        if (exists.get(name)) continue;
        const source = config[key];
        let value = fallback;
        if (file === path.resolve(baseConfig.DB_PATH) && fs.existsSync(source)) {
          try {
            value = JSON.parse(fs.readFileSync(source, 'utf8'));
          } catch (error) {
            throw new Error(`Cannot import legacy data from ${source}: ${error.message}`);
          }
        }
        insert.run(name, JSON.stringify(value));
      }
      setting.run('auto_send', JSON.stringify(file === path.resolve(baseConfig.DB_PATH) && Boolean(config.AUTO_SEND)));
    })();
  } catch (error) {
    db.close();
    throw error;
  }
  databases.set(file, db);
  return db;
}
function load(name) {
  const row = getDatabase().prepare('SELECT value FROM datasets WHERE name = ?').get(name);
  return row ? JSON.parse(row.value) : structuredClone(datasets[name][1]);
}
function save(name, value) {
  getDatabase().prepare('INSERT INTO datasets (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').run(name, JSON.stringify(value));
}
export function getTodayDateString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.QUOTA_TIMEZONE || 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}
function usage(name) {
  const today = getTodayDateString();
  const data = load(name);
  return {
    date: today,
    count: data?.date === today ? Math.max(0, Number(data.count) || 0) : 0
  };
}
export function loadDailyUsage() {
  return usage('daily_usage');
}
export function saveDailyUsage(date, count) {
  save('daily_usage', {
    date,
    count
  });
}
export function loadReplyUsage() {
  return usage('reply_usage');
}
export function saveReplyUsage(date, count) {
  save('reply_usage', {
    date,
    count
  });
}
export function loadLeadsHistory() {
  const data = load('leads_history');
  return {
    leads: Array.isArray(data?.leads) ? data.leads : [],
    searches: Array.isArray(data?.searches) ? data.searches : []
  };
}
export function saveLeadsHistory(value) {
  save('leads_history', value);
}
export function loadSeenPlaces() {
  const data = load('seen_places');
  const seen = data && typeof data === 'object' && !Array.isArray(data) ? {
    ...(data.places || data)
  } : {};
  for (const lead of loadLeadsHistory().leads) {
    if (!lead?.name) continue;
    const id = lead.id || `hist-${lead.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (!seen[id]) {
      let domain = null;
      try {
        domain = lead.website ? new URL(lead.website).hostname.replace(/^www\./i, '') : null;
      } catch {}
      seen[id] = {
        id,
        name: lead.name,
        address: lead.address || '',
        phone: lead.phone || '',
        website: lead.website || '',
        domain,
        email: lead.email || '',
        emailStatus: lead.emailStatus || 'unknown',
        foundAt: lead.foundAt || getTodayDateString()
      };
    }
  }
  return seen;
}
export function saveSeenPlaces(value) {
  save('seen_places', value);
}
export function loadMailboxHistory() {
  const value = load('mailbox_history');
  return Array.isArray(value) ? value : [];
}
export function saveMailboxHistory(value) {
  save('mailbox_history', Array.isArray(value) ? value : []);
}
export function loadOutreachHistory() {
  const value = load('outreach_history');
  return Array.isArray(value) ? value : [];
}
export function saveOutreachHistory(value) {
  save('outreach_history', Array.isArray(value) ? value : []);
}
export function loadAutoSendSetting() {
  const row = getDatabase().prepare('SELECT value FROM settings WHERE name = ?').get('auto_send');
  return row ? Boolean(JSON.parse(row.value)) : Boolean(config.AUTO_SEND);
}
export function saveAutoSendSetting(value) {
  getDatabase().prepare('INSERT INTO settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').run('auto_send', JSON.stringify(Boolean(value)));
}

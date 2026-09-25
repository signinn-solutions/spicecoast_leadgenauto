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

export function closeStorage() {
  if (database) database.close();
  database = undefined;
  openPath = undefined;
}

function getDatabase() {
  const file = path.resolve(config.DB_PATH);
  if (database && openPath === file) return database;
  closeStorage();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file, { timeout: 5000 });
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
        if (fs.existsSync(source)) {
          try { value = JSON.parse(fs.readFileSync(source, 'utf8')); }
          catch (error) { throw new Error(`Cannot import legacy data from ${source}: ${error.message}`); }
        }
        insert.run(name, JSON.stringify(value));
      }
      setting.run('auto_send', JSON.stringify(Boolean(config.AUTO_SEND)));
    })();
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

export function loadDailyUsage() { return usage('daily_usage'); }
export function saveDailyUsage(date, count) { save('daily_usage', { date, count }); }
export function loadReplyUsage() { return usage('reply_usage'); }
export function saveReplyUsage(date, count) { save('reply_usage', { date, count }); }

export function loadLeadsHistory() {
  const data = load('leads_history');
  return { leads: Array.isArray(data?.leads) ? data.leads : [], searches: Array.isArray(data?.searches) ? data.searches : [] };
}
export function saveLeadsHistory(value) { save('leads_history', value); }

export function loadSeenPlaces() {
  const data = load('seen_places');
  const seen = data && typeof data === 'object' && !Array.isArray(data) ? { ...(data.places || data) } : {};
  for (const lead of loadLeadsHistory().leads) {
    if (!lead?.name) continue;
    const id = lead.id || `hist-${lead.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (!seen[id]) {
      let domain = null;
      try { domain = lead.website ? new URL(lead.website).hostname.replace(/^www\./i, '') : null; } catch {}
      seen[id] = { id, name: lead.name, address: lead.address || '', phone: lead.phone || '', website: lead.website || '', domain, email: lead.email || '', emailStatus: lead.emailStatus || 'unknown', foundAt: lead.foundAt || getTodayDateString() };
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

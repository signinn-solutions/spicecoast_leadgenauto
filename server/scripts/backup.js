import fs from 'node:fs';
import path from 'node:path';
import Database from '../services/sqliteDatabase.js';
import config from '../config/env.js';

const target = process.argv[2];
if (!target) throw new Error('Usage: npm run backup -- /absolute/path/backup.sqlite');
const destination = path.resolve(target);
if (destination === path.resolve(config.DB_PATH) || fs.existsSync(destination)) throw new Error('Backup target must be a new file, different from the live database.');
fs.mkdirSync(path.dirname(destination), { recursive: true });
const db = new Database(config.DB_PATH, { readonly: true });
try {
  await db.backup(destination);
  const check = new Database(destination, { readonly: true });
  try { if (check.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Backup integrity check failed'); }
  finally { check.close(); }
  console.log(`Verified SQLite backup: ${destination}`);
} finally { db.close(); }

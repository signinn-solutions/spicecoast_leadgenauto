import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import config from '../config/env.js';
import { getDatabase, withStorageOperationLock, withMailboxHistoryLock, withOutreachHistoryLock } from './storageService.js';
import { addAuditLog } from './userService.js';

export async function resetOperationalData(scope, actorEmail) {
  return withStorageOperationLock('lead-search', () => withMailboxHistoryLock(() => withOutreachHistoryLock(async () => {
    const db = getDatabase();
    const backupDir = path.join(path.dirname(config.DB_PATH), 'backups', `reset-${Date.now()}-${randomUUID()}`);
    fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, 'spicecoast.sqlite');
    await db.backup(backupFile);
    const empty = { leads_history: ['LEADS_HISTORY_FILE', { leads: [], searches: [] }], seen_places: ['SEEN_PLACES_FILE', {}], outreach_history: ['OUTREACH_HISTORY_FILE', []], daily_usage: ['DAILY_USAGE_FILE', { date: '', count: 0 }] };
    if (scope === 'all') Object.assign(empty, { mailbox_history: ['MAILBOX_HISTORY_FILE', []], reply_usage: ['REPLY_USAGE_FILE', { date: '', count: 0 }] });
    // Remove old import sources before reopening could reintroduce deleted records.
    for (const [, [key, value]] of Object.entries(empty)) {
      if (fs.existsSync(config[key])) {
        fs.copyFileSync(config[key], path.join(backupDir, path.basename(config[key])));
        fs.writeFileSync(config[key], JSON.stringify(value));
      }
    }
    db.transaction(() => {
      db.exec('DELETE FROM leads; DELETE FROM searches; DELETE FROM daily_usage;');
      for (const [name, [, value]] of Object.entries(empty)) db.prepare('INSERT INTO datasets(name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run(name, JSON.stringify(value));
      addAuditLog({ userEmail: actorEmail, action: 'operational_data_reset', category: 'admin', details: `Reset scope: ${scope}; automatic backup: ${backupFile}. Accounts and settings preserved.` });
    })();
    return { success: true, scope, backupFile };
  })));
}

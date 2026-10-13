import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import config from '../config/env.js';
import { resetOperationalData } from '../services/resetData.js';
import { getDatabase, closeStorage, saveLeadsHistory, loadLeadsHistory, saveOutreachHistory, loadOutreachHistory, saveMailboxHistory, loadMailboxHistory } from '../services/storageService.js';
import Database from '../services/sqliteDatabase.js';

test('resets back up first, preserve accounts/settings, and honor mailbox scope', async () => {
  const keys = ['DB_PATH','LEADS_HISTORY_FILE','SEEN_PLACES_FILE','DAILY_USAGE_FILE','REPLY_USAGE_FILE','OUTREACH_HISTORY_FILE','MAILBOX_HISTORY_FILE'];
  const original = Object.fromEntries(keys.map(key => [key, config[key]]));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicecoast-reset-'));
  try {
    for (const key of keys) config[key] = path.join(dir, key);
    const db = getDatabase();
    db.prepare("INSERT INTO users(id,email,password_hash,name,role,status) VALUES(?,?,?,?,?,?)").run('retained-user','user@example.test','test-hash','User','user','active');
    const settings = db.prepare('SELECT * FROM settings ORDER BY name').all();
    saveLeadsHistory({ leads: [{id:'old-lead',name:'Buyer'}], searches: [{id:'old-search'}] });
    saveOutreachHistory([{id:'pitch'}]);
    saveMailboxHistory([{id:'inquiry'}]);
    fs.writeFileSync(config.LEADS_HISTORY_FILE, JSON.stringify({ leads: [{id:'legacy-lead'}], searches: [] }));
    const result = await resetOperationalData('leads','admin@example.test');
    const backup = new Database(result.backupFile, { readonly: true });
    assert.equal(backup.prepare('SELECT count(*) count FROM leads').get().count, 1);
    backup.close();
    assert.equal(loadLeadsHistory().leads.length, 0);
    assert.equal(loadOutreachHistory().length, 0);
    assert.equal(loadMailboxHistory().length, 1);
    closeStorage();
    assert.equal(loadLeadsHistory().leads.length, 0, 'Legacy data must not return after restart');
    await resetOperationalData('all','admin@example.test');
    assert.equal(loadMailboxHistory().length, 0);
    assert.equal(getDatabase().prepare('SELECT count(*) count FROM users').get().count, 1);
    assert.deepEqual(getDatabase().prepare('SELECT * FROM settings ORDER BY name').all(), settings);
  } finally { closeStorage(); Object.assign(config, original); fs.rmSync(dir, {recursive:true,force:true}); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from '../services/sqliteDatabase.js';

test('built-in SQLite preserves nested rollback, named bindings, WAL backup and readonly restore', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicecoast-sqlite-'));
  const db = new Database(path.join(dir, 'original.sqlite'));
  try {
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE contacts(id INTEGER PRIMARY KEY, name TEXT)');
    const insert = db.prepare('INSERT INTO contacts(id,name) VALUES (@id,@name)');
    db.transaction(() => {
      insert.run({ id: 1, name: 'Buyer' });
      assert.throws(db.transaction(() => { insert.run({ id: 2, name: 'Rollback' }); throw new Error('rollback'); }));
    })();
    assert.deepEqual(db.prepare('SELECT * FROM contacts').all(), [{ id: 1, name: 'Buyer' }]);
    const target = path.join(dir, 'backup.sqlite');
    await db.backup(target);
    const restored = new Database(target, { readonly: true });
    try {
      assert.equal(restored.pragma('quick_check', { simple: true }), 'ok');
      assert.equal(restored.prepare('SELECT name FROM contacts').get().name, 'Buyer');
      assert.throws(() => restored.exec('DELETE FROM contacts'));
    } finally { restored.close(); }
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

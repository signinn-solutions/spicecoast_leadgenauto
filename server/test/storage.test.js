import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import config from '../config/env.js';
import {
  closeStorage,
  getTodayDateString,
  loadDailyUsage,
  saveDailyUsage,
  loadLeadsHistory,
  saveLeadsHistory,
  insertLeadsBatch,
  updateLeadStatus,
} from '../services/storageService.js';

test('normalized SQLite leads table and batch transactions eliminate giant JSON rewrites', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicecoast-norm-db-'));
  const originalDbPath = config.DB_PATH;
  const originalLeadsHistoryFile = config.LEADS_HISTORY_FILE;
  const originalDailyUsageFile = config.DAILY_USAGE_FILE;
  const dbFile = path.join(dir, 'app.db');
  config.DB_PATH = dbFile;
  config.LEADS_HISTORY_FILE = path.join(dir, 'leads.json');
  config.DAILY_USAGE_FILE = path.join(dir, 'daily.json');

  try {
    // 1. Verify schema created properly
    const batchLeads = [
      {
        id: 'lead-1',
        name: 'Spiceland Global GmbH',
        website: 'https://www.spiceland-global.de/about',
        domain: 'spiceland-global.de',
        phone: '+49 40 123456',
        phoneStatus: 'valid',
        email: 'info@spiceland-global.de',
        emailStatus: 'deliverable',
        address: 'Hafenstr 10, Hamburg',
        city: 'Hamburg',
        country: 'Germany',
        businessType: 'spice importer',
        source: 'live',
      },
      {
        id: 'lead-2',
        name: 'Bavaria Pepper Trading',
        website: 'https://bavaria-pepper.com',
        domain: 'bavaria-pepper.com',
        phone: '+49 89 654321',
        phoneStatus: 'valid',
        email: 'sales@bavaria-pepper.com',
        emailStatus: 'deliverable',
        address: 'Maximilianstr 2, Munich',
        city: 'Munich',
        country: 'Germany',
        businessType: 'spice distributor',
        source: 'live',
      },
    ];

    const today = getTodayDateString();
    insertLeadsBatch(batchLeads, {
      today,
      totalDailyCount: 2,
      searchRecord: {
        id: 123456,
        query: 'spice importer · Hamburg, Germany',
        count: 2,
        duplicatesSkipped: 0,
        date: today,
        mode: 'live',
      },
    });

    // Verify in direct SQLite connection
    const directDb = new Database(dbFile);
    
    // Check table structure and indices
    const indexes = directDb.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'leads'").all();
    const indexNames = indexes.map((i) => i.name);
    assert.ok(indexNames.includes('idx_leads_domain'), 'Index idx_leads_domain must exist');

    // Check leads rows
    const leadRows = directDb.prepare('SELECT * FROM leads ORDER BY id ASC').all();
    assert.equal(leadRows.length, 2);
    assert.equal(leadRows[0].id, 'lead-1');
    assert.equal(leadRows[0].domain, 'spiceland-global.de');
    assert.equal(leadRows[0].email, 'info@spiceland-global.de');
    assert.equal(leadRows[0].status, 'discovered');

    // Check daily usage in normalized table
    const usageRow = directDb.prepare('SELECT count FROM daily_usage WHERE date = ?').get(today);
    assert.equal(usageRow.count, 2);
    assert.equal(loadDailyUsage().count, 2);

    // Check searches row in normalized table
    const searchRow = directDb.prepare('SELECT * FROM searches WHERE id = ?').get('123456');
    assert.equal(searchRow.count, 2);
    assert.equal(searchRow.query, 'spice importer · Hamburg, Germany');

    // 2. Targeted update of single lead without touching others
    const updated = updateLeadStatus('lead-1', {
      status: 'sent',
      contactedAt: '2026-10-12T10:00:00.000Z',
    });
    assert.equal(updated, true);

    const lead1Updated = directDb.prepare('SELECT * FROM leads WHERE id = ?').get('lead-1');
    assert.equal(lead1Updated.status, 'sent');
    assert.equal(lead1Updated.last_contacted_at, '2026-10-12T10:00:00.000Z');

    const lead2Untouched = directDb.prepare('SELECT * FROM leads WHERE id = ?').get('lead-2');
    assert.equal(lead2Untouched.status, 'discovered');
    assert.equal(lead2Untouched.last_contacted_at, null);

    // 3. Verify loadLeadsHistory returns all leads seamlessly
    const history = loadLeadsHistory();
    assert.equal(history.leads.length, 2);
    assert.equal(history.searches.length, 1);
    assert.equal(history.leads.find((l) => l.id === 'lead-1').status, 'sent');

    directDb.close();
  } finally {
    closeStorage();
    config.DB_PATH = originalDbPath;
    config.LEADS_HISTORY_FILE = originalLeadsHistoryFile;
    config.DAILY_USAGE_FILE = originalDailyUsageFile;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

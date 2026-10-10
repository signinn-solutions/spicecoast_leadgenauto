import { getDatabase, loadLeadsHistory, saveLeadsHistory } from './storageService.js';
export function migrateVerification() {
  const db = getDatabase();
  if (db.prepare("SELECT 1 FROM settings WHERE name='verification_migration_v1'").get()) return;
  db.transaction(() => {
    const history = loadLeadsHistory();
    for (const lead of history.leads) {
      if (lead.source !== 'live') continue;
      if (['deliverable', 'valid'].includes(lead.emailStatus) && !lead.emailVerification) lead.emailStatus = 'unknown';
      if (lead.phoneStatus === 'valid') lead.phoneStatus = 'listed';
    }
    saveLeadsHistory(history);
    db.prepare("INSERT INTO settings(name,value) VALUES('verification_migration_v1','true')").run();
  })();
}

import path from 'node:path';
import fs from 'node:fs';
import { getDatabase, closeStorage } from '../services/storageService.js';
const destination = process.argv[2];
if (!destination) {
  console.error('Usage: node server/scripts/backup-store.js /path/to/new-backup.sqlite');
  process.exitCode = 1;
} else try {
  const target = path.resolve(destination);
  if (fs.existsSync(target)) throw new Error('Destination already exists. Choose a new backup path.');
  fs.mkdirSync(path.dirname(target), {
    recursive: true
  });
  await getDatabase().backup(target);
  console.log('SQLite backup completed.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  closeStorage();
}

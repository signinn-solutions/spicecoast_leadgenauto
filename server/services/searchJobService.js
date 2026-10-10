import { randomUUID } from 'node:crypto';
import { getDatabase } from './storageService.js';
import { executeLeadSearch } from './leadFinderService.js';
function db() {
  const store = getDatabase();
  store.exec('CREATE TABLE IF NOT EXISTS search_jobs (id TEXT PRIMARY KEY, request_key TEXT UNIQUE, actor TEXT, status TEXT NOT NULL, progress TEXT NOT NULL, result TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
  return store;
}
export function recoverSearchJobs() {
  db().prepare("UPDATE search_jobs SET status='interrupted',error='Server restarted before this batch finished. Saved leads remain available; rerun the query to continue.',updated_at=? WHERE status IN ('queued','running')").run(new Date().toISOString());
}
export function getSearchJob(id) {
  const row = db().prepare('SELECT * FROM search_jobs WHERE id=?').get(id);
  return row ? {
    id: row.id,
    status: row.status,
    progress: JSON.parse(row.progress),
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error,
    createdAt: row.created_at
  } : null;
}
export function recentSearchJobs() {
  return db().prepare('SELECT id FROM search_jobs ORDER BY created_at DESC LIMIT 10').all().map(row => getSearchJob(row.id));
}
export function startSearchJob(options, requestId) {
  if (typeof requestId !== 'string' || requestId.length > 100 || !/^[a-z0-9-]{16,100}$/i.test(requestId)) throw Object.assign(new Error('Provide a unique search request ID.'), {
    statusCode: 400
  });
  const key = (options.actor?.id || 'local') + ':' + requestId;
  const previous = db().prepare('SELECT id FROM search_jobs WHERE request_key=?').get(key);
  if (previous) return getSearchJob(previous.id);
  if (db().prepare("SELECT count(*) AS n FROM search_jobs WHERE status IN ('queued','running')").get().n >= 10) throw Object.assign(new Error('Search queue is full. Try again when a batch completes.'), {
    statusCode: 429
  });
  if (db().prepare("SELECT count(*) AS n FROM search_jobs WHERE actor=? AND status IN ('queued','running')").get(options.actor?.id || 'local').n) throw Object.assign(new Error('Your previous search is still running. Follow its progress before starting another.'), {
    statusCode: 409
  });
  const id = randomUUID(),
    now = new Date().toISOString();
  db().prepare("INSERT INTO search_jobs(id,request_key,actor,status,progress,created_at,updated_at) VALUES(?,?,?,'queued','{}',?,?)").run(id, key, options.actor?.id || 'local', now, now);
  executeLeadSearch({
    ...options,
    onProgress: progress => db().prepare("UPDATE search_jobs SET status='running',progress=?,updated_at=? WHERE id=?").run(JSON.stringify(progress), new Date().toISOString(), id)
  }).then(result => db().prepare("UPDATE search_jobs SET status='complete',result=?,updated_at=? WHERE id=?").run(JSON.stringify(result), new Date().toISOString(), id)).catch(error => db().prepare("UPDATE search_jobs SET status='failed',error=?,updated_at=? WHERE id=?").run(error.statusCode ? error.message : 'Search failed. Saved records remain available.', new Date().toISOString(), id));
  return getSearchJob(id);
}

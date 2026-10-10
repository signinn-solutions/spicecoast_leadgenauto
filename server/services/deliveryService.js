import { randomUUID } from 'node:crypto';
import config from '../config/env.js';
import {assertTenantActive} from './tenantService.js';
import { getDatabase, getTodayDateString, withStorageOperationLock, withMailboxHistoryLock, withOutreachHistoryLock, loadMailboxHistory, saveMailboxHistory, loadOutreachHistory, saveOutreachHistory } from './storageService.js';
import { audit,assertUserPermission } from './accessService.js';
function db() {
  const store = getDatabase();
  store.exec(`CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL, actor TEXT, day TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, error TEXT, provider_message_id TEXT
); CREATE TABLE IF NOT EXISTS suppressions (email TEXT PRIMARY KEY COLLATE NOCASE, reason TEXT NOT NULL, created_at TEXT NOT NULL);`);
  return store;
}
export function suppressRecipient(email, reason = 'Requested no further email') {
  db().prepare('INSERT OR IGNORE INTO suppressions(email,reason,created_at) VALUES(?,?,?)').run(email.trim().toLowerCase(), reason, new Date().toISOString());
}
export function isSuppressed(email) {
  return Boolean(db().prepare('SELECT 1 FROM suppressions WHERE email=? COLLATE NOCASE').get(email));
}
export function listSuppressions() {
  return db().prepare('SELECT * FROM suppressions ORDER BY created_at DESC').all();
}
export function deliveryList() {
  return db().prepare('SELECT id,recipient,subject,status,actor,created_at,updated_at,error FROM deliveries ORDER BY created_at DESC LIMIT 200').all();
}
export function sendUsage() {
  return {
    date: getTodayDateString(),
    count: db().prepare("SELECT count(*) AS count FROM deliveries WHERE day=? AND status IN ('sending','sent','unknown')").get(getTodayDateString()).count,
    limit: config.DAILY_SEND_LIMIT
  };
}
export function validateMail(to, subject, body) {
  if (typeof to !== 'string' || to.length > 254 || !/^([^\s\u0000-\u001f@,;<>]+)@([^\s\u0000-\u001f@,;<>]+)\.[^\s\u0000-\u001f@,;<>]+$/.test(to)) throw Object.assign(new Error('Use one plain recipient email address.'), {
    statusCode: 400,
    definiteFailure: true
  });
  if (typeof subject !== 'string' || subject.length > 500 || /[\r\n\u0000]/.test(subject)) throw Object.assign(new Error('Subject must be a single line up to 500 characters.'), {
    statusCode: 400,
    definiteFailure: true
  });
  if (typeof body !== 'string' || !body.trim() || body.length > 100000) throw Object.assign(new Error('Email body must contain 1 to 100000 characters.'), {
    statusCode: 400,
    definiteFailure: true
  });
}
export async function guardedDelivery(to, subject, body, options, operation) {
  validateMail(to, subject, body);
  return withStorageOperationLock('mail-send', async () => {
    assertTenantActive();
    assertUserPermission(options.actor,'send');
    if (isSuppressed(to)) throw Object.assign(new Error('Recipient has requested no further email.'), {
      statusCode: 409
    });
    const id = options.dispatchKey || randomUUID();
    const previous = db().prepare('SELECT * FROM deliveries WHERE id=?').get(id);
    if (previous && previous.status !== 'failed') throw Object.assign(new Error(previous.status === 'sent' ? 'This message was already accepted by the provider.' : 'Delivery is uncertain. A super admin must check the provider before retrying.'), {
      statusCode: 409
    });
    if (sendUsage().count >= config.DAILY_SEND_LIMIT) throw Object.assign(new Error('Daily outbound send limit reached.'), {
      statusCode: 429
    });
    const now = new Date().toISOString();
    db().prepare("INSERT INTO deliveries(id,recipient,subject,body,status,actor,day,created_at,updated_at) VALUES(?,?,?,?,'sending',?,?,?,?) ON CONFLICT(id) DO UPDATE SET recipient=excluded.recipient,subject=excluded.subject,body=excluded.body,status='sending',actor=excluded.actor,day=excluded.day,updated_at=excluded.updated_at,error=NULL").run(id, to, subject, body, options.actor || 'system', getTodayDateString(), now, now);
    try {
      const result = await operation();
      if (result?.status === 'simulated') {
        db().prepare("UPDATE deliveries SET status='failed',error='Transport is not configured.',updated_at=? WHERE id=?").run(new Date().toISOString(), id);
        return result;
      }
      db().prepare("UPDATE deliveries SET status='sent',provider_message_id=?,updated_at=? WHERE id=?").run(result.messageId || null, new Date().toISOString(), id);
      audit(options.actor, 'mail.accepted', id, {
        recipient: to
      });
      return result;
    } catch (e) {
      const status = e.definiteFailure ? 'failed' : 'unknown';
      db().prepare('UPDATE deliveries SET status=?,error=?,updated_at=? WHERE id=?').run(status, e.message, new Date().toISOString(), id);
      audit(options.actor, 'mail.' + status, id, {
        recipient: to
      });
      throw e;
    }
  });
}
export async function reconcileDelivery(id, accepted, actor) {
  if (typeof accepted !== 'boolean') throw Object.assign(new Error('Confirm whether the provider accepted the message.'), {
    statusCode: 400
  });
  return withMailboxHistoryLock(() => withOutreachHistoryLock(() => withStorageOperationLock('mail-send', () => {
    const record = db().prepare('SELECT * FROM deliveries WHERE id=?').get(id);
    if (!record || !['sending', 'unknown'].includes(record.status)) throw Object.assign(new Error('Only uncertain deliveries can be reconciled.'), {
      statusCode: 409
    });
    const now = new Date().toISOString();
    getDatabase().transaction(() => {
      db().prepare('UPDATE deliveries SET status=?,updated_at=?,error=NULL WHERE id=?').run(accepted ? 'sent' : 'failed', now, id);
      if (accepted && id.startsWith('reply:')) {
        const history = loadMailboxHistory(),
          message = history.find(m => m.id === id.slice(6));
        if (message) {
          message.status = 'sent';
          message.sentAt = now;
          message.draftReply = record.body;
          message.sentReply = {
            subject: record.subject,
            body: record.body,
            sentAt: now,
            sentBy: actor
          };
          message.error = null;
          saveMailboxHistory(history);
        }
      }
      if (accepted && id.startsWith('cold:')) {
        const history = loadOutreachHistory(),
          draft = history.find(m => m.id === id.slice(5));
        if (draft) {
          draft.status = 'sent';
          draft.sentAt = now;
          draft.first_contacted_at = draft.first_contacted_at || now;
          draft.last_contacted_at = now;
          draft.follow_up_count = draft.follow_up_count || 0;
          draft.subject = record.subject;
          draft.body = record.body;
          saveOutreachHistory(history);
        }
      }
      if (accepted && id.startsWith('followup:')) {
        const parts = id.slice(9).split(':'),
          turn = Number(parts.pop()),
          outreachId = parts.join(':');
        const history = loadOutreachHistory(),
          draft = history.find(m => m.id === outreachId);
        if (draft && (draft.follow_up_count || 0) < turn) {
          draft.status = 'followed_up';
          draft.last_contacted_at = now;
          draft.follow_up_count = turn;
          draft.follow_up_draft = null;
          draft.sent_followups = [...(draft.sent_followups || []), {
            turn,
            subject: record.subject,
            body: record.body,
            sentAt: now
          }];
          saveOutreachHistory(history);
        }
      }
    })();
    audit(actor, 'mail.reconciled', id, {
      accepted
    });
    return {
      ...record,
      status: accepted ? 'sent' : 'failed'
    };
  })));
}

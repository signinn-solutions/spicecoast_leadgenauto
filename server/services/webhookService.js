import config from '../config/env.js';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { getTodayDateString, loadReplyUsage, saveReplyUsage, loadMailboxHistory, saveMailboxHistory, loadOutreachHistory, saveOutreachHistory, loadAutoSendSetting, withMailboxHistoryLock, withOutreachHistoryLock } from './storageService.js';
import { extractMetadataAndDraftReply } from './deepseekService.js';
import { sendEmail } from './mailService.js';
import { suppressRecipient, isSuppressed } from './deliveryService.js';
import { computeLeadEngagementScore } from './lifecycleScoringService.js';
export function looksLikeALeadReply(subject = '', body = '') {
  const positiveSignals = config.LEAD_KEYWORDS ? config.LEAD_KEYWORDS.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean) : ['pricing', 'price', 'catalog', 'catalogue', 'interested', 'quote', 'quotation', 'sample', 'moq', 'importer', 'export', 'spices', 'cardamom', 'pepper', 'clove', 'turmeric', 'cinnamon', 'inquiry', 'enquiry', 'specification', 'container', 'fob', 'cif', 'fcl', 'volume', 'harvest'];
  const text = `${subject} ${body}`.toLowerCase();
  return positiveSignals.some(word => text.includes(word));
}
export function verifyWebhookAuth(authHeader = '') {
  if (!config.HOSTINGER_WEBHOOK_BEARER_TOKEN) {
    return false;
  }
  const expected = `Bearer ${config.HOSTINGER_WEBHOOK_BEARER_TOKEN}`;
  if (typeof authHeader !== 'string') return false;
  return timingSafeEqual(createHash('sha256').update(authHeader).digest(), createHash('sha256').update(expected).digest());
}
const stringFields = ['from', 'sender', 'from_address', 'from_email', 'email', 'from_name', 'sender_name', 'name', 'to', 'receiver', 'to_address', 'recipient', 'mailbox', 'to_name', 'receiver_name', 'subject', 'message', 'text', 'body', 'content', 'messageId', 'message_id', 'message_id_header', 'eventId', 'event_id'];
const mailboxPattern = /^[^\s\u0000-\u001f@,;<>]+@[^\s\u0000-\u001f@,;<>]+\.[^\s\u0000-\u001f@,;<>]+$/u;
const invalid = reason => ({
  statusCode: 400,
  response: {
    status: 'rejected',
    reason
  }
});
function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return invalid('Expected an email payload object.');
  for (const field of stringFields) {
    if (Object.hasOwn(payload, field) && typeof payload[field] !== 'string') return invalid(`Field ${field} must be a string.`);
  }
  const sender = (payload.from || payload.sender || payload.from_address || payload.from_email || payload.email || '').trim();
  const receiver = (payload.to || payload.receiver || payload.to_address || payload.recipient || payload.mailbox || config.SENDER_MAILBOX).trim();
  if (sender && (sender.length > 254 || !mailboxPattern.test(sender))) return invalid('Sender must be one plain email address.');
  if (!receiver || receiver.length > 254 || !mailboxPattern.test(receiver)) return invalid('Receiver must be one plain email address.');
  if ((payload.subject || '').length > 500) return invalid('Subject is too long.');
  if (/[\r\n\u0000]/u.test(payload.subject || '')) return invalid('Subject contains an invalid character.');
  if ((payload.message || payload.text || payload.body || payload.content || '').length > 100000) return invalid('Message is too long.');
  if ((payload.from_name || payload.sender_name || payload.name || '').length > 200 || (payload.to_name || payload.receiver_name || '').length > 200) return invalid('Contact name is too long.');
  const sourceMessageId = payload.messageId || payload.message_id || payload.message_id_header || payload.eventId || payload.event_id || '';
  if (sourceMessageId.length > 500) return invalid('Message identifier is too long.');
  return null;
}
export async function processIncomingEmail(payload = {}, authHeader = '', forceBypassAuth = false, manualAutoSend = null) {
  if (!forceBypassAuth && !verifyWebhookAuth(authHeader)) {
    return {
      statusCode: 401,
      response: {
        status: 'rejected',
        reason: 'Invalid or missing webhook bearer token'
      }
    };
  }
  if (payload.providerRef !== undefined && (!payload.providerRef || typeof payload.providerRef !== 'object' || !Number.isInteger(payload.providerRef.uid) || payload.providerRef.uid < 1 || typeof payload.providerRef.folder !== 'string' || payload.providerRef.folder.length > 200)) return invalid('Invalid provider message reference.');
  const validation = validatePayload(payload);
  if (validation) return validation;
  return withMailboxHistoryLock(() => runIncomingEmail(payload, forceBypassAuth, manualAutoSend));
}
async function runIncomingEmail(payload, forceBypassAuth, manualAutoSend) {
  // Parse all possible field names from Hostinger / standard mail webhook shapes
  const senderEmail = (payload.from || payload.sender || payload.from_address || payload.from_email || payload.email || '').trim();
  const senderName = payload.from_name || payload.sender_name || payload.name || '';
  const receiverEmail = (payload.to || payload.receiver || payload.to_address || payload.recipient || payload.mailbox || config.SENDER_MAILBOX).trim();
  const receiverName = payload.to_name || payload.receiver_name || config.TENANT_NAME || 'SpiceCoast';
  const subject = payload.subject || 'Business inquiry';
  const body = payload.message || payload.text || payload.body || payload.content || '';
  const sourceMessageId = (payload.messageId || payload.message_id || payload.message_id_header || payload.eventId || payload.event_id || '').trim();
  if (!senderEmail) {
    return {
      statusCode: 200,
      response: {
        status: 'ignored',
        reason: 'No sender email found in payload'
      }
    };
  }

  // Providers may retry a delivery after a timeout. Deduplicate only when an
  // explicit event/message identifier is present; identical email text can be
  // a legitimate second inquiry.
  if (sourceMessageId) {
    const existing = loadMailboxHistory().find(message => message.sourceMessageId === sourceMessageId && message.source === (forceBypassAuth ? 'simulated' : 'webhook'));
    if (existing) {
      return {
        statusCode: 200,
        response: {
          status: 'duplicate',
          message: existing
        }
      };
    }
  }
  const {
    date: today,
    count: usedTodayInit
  } = loadReplyUsage();
  let usedToday = usedTodayInit;
  const persistReceived = (status, reason) => {
    const message = {
      id: 'msg-' + randomUUID(),
      providerRef: payload.providerRef || null,
      source: forceBypassAuth ? 'simulated' : 'webhook',
      sourceMessageId: sourceMessageId || null,
      sender: senderEmail,
      senderName,
      receiver: receiverEmail,
      receiverName,
      subject,
      body,
      draftReply: '',
      metadata: {},
      status,
      error: reason,
      receivedAt: new Date().toISOString()
    };
    const history = loadMailboxHistory();
    history.unshift(message);
    saveMailboxHistory(history);
    return {
      statusCode: 200,
      response: {
        status: status === 'received' ? 'blocked' : status,
        reason,
        message
      }
    };
  };
  if (receiverEmail.toLowerCase() !== config.SENDER_MAILBOX.toLowerCase()) return {
    statusCode: 400,
    response: {
      status: 'rejected',
      reason: 'Receiver does not match the shared mailbox.'
    }
  };
  if (!forceBypassAuth && /\b(unsubscribe|remove me|stop emailing|stop contacting|do not contact|do not email|don.t contact|not interested|no more emails)\b/i.test(body)) {
    suppressRecipient(senderEmail);
    return persistReceived('suppressed', 'Sender requested no further email.');
  }
  if (!forceBypassAuth && isSuppressed(senderEmail)) return persistReceived('suppressed', 'Sender is on the suppression list.');
  const knownReply = loadOutreachHistory().some(o => o.recipient?.toLowerCase() === senderEmail.toLowerCase() && o.first_contacted_at);
  if (!knownReply && !looksLikeALeadReply(subject, body)) return persistReceived('ignored', 'No lead keywords matched. Message retained for review.');
  if (usedToday >= config.DAILY_REPLY_LIMIT) return persistReceived('received', 'Daily AI draft limit reached. Inquiry saved without an AI draft.');
  if (senderEmail.toLowerCase() === config.SENDER_MAILBOX.toLowerCase() || /^(mailer-daemon|postmaster|no-?reply)@/i.test(senderEmail)) return persistReceived('ignored', 'Automated or self-addressed message retained without a reply.');
  const recordId = 'msg-' + randomUUID();
  // Save before AI/transport work, so provider retries cannot send again after a crash.
  const pending = {
    id: recordId,
    source: forceBypassAuth ? 'simulated' : 'webhook',
    sourceMessageId: sourceMessageId || null,
    providerRef: payload.providerRef || null,
    sender: senderEmail,
    senderName,
    receiver: receiverEmail,
    receiverName,
    subject,
    body,
    status: 'received',
    draftReply: '',
    metadata: {},
    receivedAt: new Date().toISOString()
  };
  const beforeProcessing = loadMailboxHistory();
  beforeProcessing.unshift(pending);
  saveMailboxHistory(beforeProcessing);

  // Extract rich AI metadata & draft contextual reply using DeepSeek
  const {
    reply: replyText,
    metadata,
    model
  } = await extractMetadataAndDraftReply(subject, body, senderEmail, senderName, receiverEmail, receiverName, {
    useAI: !forceBypassAuth
  });
  usedToday += 1;
  saveReplyUsage(today, usedToday);
  const autoSendEffective = forceBypassAuth ? false : manualAutoSend !== null ? manualAutoSend : loadAutoSendSetting();
  let deliveryStatus = 'drafted';
  let deliveryError = null;
  if (autoSendEffective) {
    try {
      const sendResult = await sendEmail(senderEmail, subject, replyText, {
        reply: true,
        dispatchKey: 'reply:' + recordId,
        inReplyTo: payload.providerRef || null,
        messageId: sourceMessageId || null
      });
      if (sendResult?.status === 'simulated') {
        throw new Error('Email transport is not configured. Message was not sent.');
      }
      deliveryStatus = 'sent';
    } catch (err) {
      deliveryStatus = 'send_failed';
      deliveryError = err.message;
    }
  } else {
    deliveryStatus = 'drafted';
  }

  // Format timestamp
  const formattedDate = new Date().toISOString();
  const messageRecord = {
    id: recordId,
    source: forceBypassAuth ? 'simulated' : 'webhook',
    sourceMessageId: sourceMessageId || null,
    providerRef: payload.providerRef || null,
    sender: senderEmail,
    senderName: metadata.buyerName || senderName || senderEmail.split('@')[0],
    receiver: receiverEmail,
    receiverName: receiverName,
    subject,
    body,
    draftReply: replyText,
    metadata: {
      buyerName: metadata.buyerName,
      buyerCompany: metadata.buyerCompany,
      receiverEmail: metadata.receiverEmail,
      receiverName: metadata.receiverName,
      intent: metadata.intent,
      detectedProducts: metadata.detectedProducts,
      requestedVolume: metadata.requestedVolume,
      destinationPort: metadata.destinationPort,
      priority: metadata.priority,
      sentiment: metadata.sentiment,
      summary: metadata.summary
    },
    ...(deliveryStatus === 'sent' ? {
      sentAt: formattedDate,
      sentReply: {
        subject,
        body: replyText,
        sentAt: formattedDate,
        sentBy: 'automation'
      }
    } : {}),
    status: deliveryStatus,
    error: deliveryError,
    autoSend: autoSendEffective,
    model,
    mailbox: receiverEmail,
    receivedAt: formattedDate
  };

  // Compute engagement score and link to outreach record if sender was contacted
  await withOutreachHistoryLock(async () => {
    const outreach = loadOutreachHistory();
    const matchedOutreach = outreach.find(o => o.recipient && o.recipient.toLowerCase() === senderEmail.toLowerCase());
    const scoreResult = await computeLeadEngagementScore(matchedOutreach || {
      directInbound: true,
      company: metadata.buyerCompany
    }, [messageRecord], matchedOutreach ? [{
      sentAt: matchedOutreach.sentAt || matchedOutreach.first_contacted_at
    }] : []);
    messageRecord.score = scoreResult;
    if (matchedOutreach && matchedOutreach.first_contacted_at) {
      matchedOutreach.status = scoreResult.isHot ? 'hot' : 'replied';
      matchedOutreach.score_result = scoreResult;
      saveOutreachHistory(outreach);
    }
  });

  // Save to interaction history
  const history = loadMailboxHistory();
  const recordIndex = history.findIndex(message => message.id === recordId);
  if (recordIndex >= 0) history[recordIndex] = messageRecord;else history.unshift(messageRecord);
  saveMailboxHistory(history);
  return {
    statusCode: 200,
    response: {
      status: deliveryStatus,
      to: senderEmail,
      receiver: receiverEmail,
      reply: replyText,
      metadata: messageRecord.metadata,
      message: messageRecord,
      usage: {
        date: today,
        count: usedToday,
        remaining: Math.max(0, config.DAILY_REPLY_LIMIT - usedToday)
      }
    }
  };
}

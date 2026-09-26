import config from '../config/env.js';
import { randomUUID } from 'node:crypto';
import {
  getTodayDateString,
  loadReplyUsage,
  saveReplyUsage,
  loadMailboxHistory,
  saveMailboxHistory,
  loadAutoSendSetting,
  withMailboxHistoryLock,
} from './storageService.js';
import { extractMetadataAndDraftReply } from './deepseekService.js';
import { sendEmail } from './mailService.js';

export function looksLikeALeadReply(subject = '', body = '') {
  const positiveSignals = [
    'pricing',
    'price',
    'catalog',
    'catalogue',
    'interested',
    'quote',
    'quotation',
    'sample',
    'moq',
    'importer',
    'export',
    'spices',
    'cardamom',
    'pepper',
    'clove',
    'turmeric',
    'cinnamon',
    'inquiry',
    'enquiry',
    'specification',
    'container',
    'fob',
    'cif',
    'fcl',
    'volume',
    'harvest',
  ];
  const text = `${subject} ${body}`.toLowerCase();
  return positiveSignals.some((word) => text.includes(word));
}

export function verifyWebhookAuth(authHeader = '') {
  if (!config.HOSTINGER_WEBHOOK_BEARER_TOKEN) {
    return false;
  }
  const expected = `Bearer ${config.HOSTINGER_WEBHOOK_BEARER_TOKEN}`;
  return authHeader === expected || authHeader === config.HOSTINGER_WEBHOOK_BEARER_TOKEN;
}

const stringFields = [
  'from', 'sender', 'from_address', 'from_email', 'email',
  'from_name', 'sender_name', 'name',
  'to', 'receiver', 'to_address', 'recipient', 'mailbox',
  'to_name', 'receiver_name', 'subject', 'message', 'text', 'body', 'content',
  'messageId', 'message_id', 'message_id_header', 'eventId', 'event_id',
];
const mailboxPattern = /^[^\s\u0000-\u001f@,;<>]+@[^\s\u0000-\u001f@,;<>]+\.[^\s\u0000-\u001f@,;<>]+$/u;
const invalid = (reason) => ({ statusCode: 400, response: { status: 'rejected', reason } });

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
  if ((payload.from_name || payload.sender_name || payload.name || '').length > 200 ||
      (payload.to_name || payload.receiver_name || '').length > 200) return invalid('Contact name is too long.');
  const sourceMessageId = payload.messageId || payload.message_id || payload.message_id_header || payload.eventId || payload.event_id || '';
  if (sourceMessageId.length > 500) return invalid('Message identifier is too long.');
  return null;
}

export async function processIncomingEmail(payload = {}, authHeader = '', forceBypassAuth = false, manualAutoSend = null) {
  if (!forceBypassAuth && !verifyWebhookAuth(authHeader)) {
    return { statusCode: 401, response: { status: 'rejected', reason: 'Invalid or missing webhook bearer token' } };
  }
  const validation = validatePayload(payload);
  if (validation) return validation;
  return withMailboxHistoryLock(() => runIncomingEmail(payload, forceBypassAuth, manualAutoSend));
}

async function runIncomingEmail(payload, forceBypassAuth, manualAutoSend) {
  // Parse all possible field names from Hostinger / standard mail webhook shapes
  const senderEmail =
    (payload.from || payload.sender || payload.from_address || payload.from_email || payload.email || '').trim();
  const senderName = payload.from_name || payload.sender_name || payload.name || '';
  const receiverEmail =
    (payload.to || payload.receiver || payload.to_address || payload.recipient || payload.mailbox || config.SENDER_MAILBOX).trim();
  const receiverName = payload.to_name || payload.receiver_name || 'The Spice Coast (Sales Desk)';
  const subject = payload.subject || 'Spice Inquiry';
  const body = payload.message || payload.text || payload.body || payload.content || '';
  const sourceMessageId = (payload.messageId || payload.message_id || payload.message_id_header || payload.eventId || payload.event_id || '').trim();

  if (!senderEmail) {
    return {
      statusCode: 200,
      response: { status: 'ignored', reason: 'No sender email found in payload' },
    };
  }

  const isLead = looksLikeALeadReply(subject, body);
  if (!isLead) {
    return {
      statusCode: 200,
      response: { status: 'ignored', reason: 'Did not match B2B lead keywords (filtered out)' },
    };
  }

  // Providers may retry a delivery after a timeout. Deduplicate only when an
  // explicit event/message identifier is present; identical email text can be
  // a legitimate second inquiry.
  if (sourceMessageId) {
    const existing = loadMailboxHistory().find((message) => message.sourceMessageId === sourceMessageId);
    if (existing) {
      return { statusCode: 200, response: { status: 'duplicate', message: existing } };
    }
  }

  const { date: today, count: usedTodayInit } = loadReplyUsage();
  let usedToday = usedTodayInit;

  if (usedToday >= config.DAILY_REPLY_LIMIT) {
    return {
      statusCode: 200,
      response: { status: 'blocked', reason: `Daily reply limit of ${config.DAILY_REPLY_LIMIT} reached.` },
    };
  }

  // Extract rich AI metadata & draft contextual reply using DeepSeek
  const { reply: replyText, metadata, model } = await extractMetadataAndDraftReply(
    subject,
    body,
    senderEmail,
    senderName,
    receiverEmail,
    receiverName,
    { useAI: !forceBypassAuth }
  );

  const autoSendEffective = forceBypassAuth ? false : manualAutoSend !== null ? manualAutoSend : loadAutoSendSetting();
  let deliveryStatus = 'drafted';
  let deliveryError = null;

  if (autoSendEffective) {
    try {
      const sendResult = await sendEmail(senderEmail, subject, replyText, { reply: true });
      if (sendResult?.status === 'simulated') {
        throw new Error('Email transport is not configured. Message was not sent.');
      }
      deliveryStatus = 'sent';
      usedToday += 1;
      saveReplyUsage(today, usedToday);
    } catch (err) {
      deliveryStatus = 'send_failed';
      deliveryError = err.message;
    }
  } else {
    deliveryStatus = 'drafted';
    usedToday += 1;
    saveReplyUsage(today, usedToday);
  }

  // Format timestamp
  const d = new Date();
  const formattedDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

  const messageRecord = {
    id: `msg-${randomUUID()}`,
    source: forceBypassAuth ? 'simulated' : 'webhook',
    sourceMessageId: sourceMessageId || null,
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
      summary: metadata.summary,
    },
    status: deliveryStatus,
    error: deliveryError,
    autoSend: autoSendEffective,
    model,
    mailbox: receiverEmail,
    receivedAt: formattedDate,
  };

  // Save to interaction history
  const history = loadMailboxHistory();
  history.unshift(messageRecord);
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
        remaining: Math.max(0, config.DAILY_REPLY_LIMIT - usedToday),
      },
    },
  };
}

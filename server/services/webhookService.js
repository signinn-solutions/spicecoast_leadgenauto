import config from '../config/env.js';
import {
  getTodayDateString,
  loadReplyUsage,
  saveReplyUsage,
  loadMailboxHistory,
  saveMailboxHistory,
  loadAutoSendSetting,
  withStorageOperationLock,
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

export async function processIncomingEmail(payload = {}, authHeader = '', forceBypassAuth = false, manualAutoSend = null) {
  return withStorageOperationLock('inbound-reply', () => runIncomingEmail(payload, authHeader, forceBypassAuth, manualAutoSend));
}

async function runIncomingEmail(payload, authHeader, forceBypassAuth, manualAutoSend) {
  if (!forceBypassAuth && !verifyWebhookAuth(authHeader)) {
    return {
      statusCode: 401,
      response: { status: 'rejected', reason: 'Invalid or missing webhook bearer token' },
    };
  }

  // Parse all possible field names from Hostinger / standard mail webhook shapes
  const senderEmail =
    payload.from || payload.sender || payload.from_address || payload.from_email || payload.email || '';
  const senderName = payload.from_name || payload.sender_name || payload.name || '';
  const receiverEmail =
    payload.to || payload.receiver || payload.to_address || payload.recipient || payload.mailbox || config.SENDER_MAILBOX;
  const receiverName = payload.to_name || payload.receiver_name || 'The Spice Coast (Sales Desk)';
  const subject = payload.subject || 'Spice Inquiry';
  const body = payload.message || payload.text || payload.body || payload.content || '';

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

  const { date: today, count: usedTodayInit } = loadReplyUsage();
  let usedToday = usedTodayInit;

  if (usedToday >= config.DAILY_REPLY_LIMIT) {
    return {
      statusCode: 200,
      response: { status: 'blocked', reason: `Daily reply limit of ${config.DAILY_REPLY_LIMIT} reached.` },
    };
  }

  // Extract rich AI metadata & draft contextual reply using DeepSeek
  const { reply: replyText, metadata } = await extractMetadataAndDraftReply(
    subject,
    body,
    senderEmail,
    senderName,
    receiverEmail,
    receiverName,
    { useAI: !forceBypassAuth }
  );

  const autoSendEffective = manualAutoSend !== null ? manualAutoSend : loadAutoSendSetting();
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
    id: `msg-${Date.now()}`,
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
    model: config.DEEPSEEK_API_KEY ? config.DEEPSEEK_MODEL : 'DeepSeek Simulated',
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

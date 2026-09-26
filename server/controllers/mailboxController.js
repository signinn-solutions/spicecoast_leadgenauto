import config from '../config/env.js';
import {
  loadReplyUsage,
  loadMailboxHistory,
  saveMailboxHistory,
  loadOutreachHistory,
  saveOutreachHistory,
  loadLeadsHistory,
  loadAutoSendSetting,
  saveAutoSendSetting,
  withOutreachHistoryLock,
  withMailboxHistoryLock,
} from '../services/storageService.js';
import { processIncomingEmail } from '../services/webhookService.js';
import { sendEmail } from '../services/mailService.js';

export async function handleWebhook(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const payload = req.body || {};
    const { statusCode, response } = await processIncomingEmail(payload, authHeader, false);
    return res.status(statusCode).json(response);
  } catch (err) {
    next(err);
  }
}

export async function getMailboxStatus(req, res, next) {
  try {
    const { date: today, count: usedToday } = loadReplyUsage();
    const outreach = loadOutreachHistory();
    const pendingDrafts = outreach.filter((o) => o.status === 'pending_review').length;
    const sentOutreach = outreach.filter((o) => o.status === 'sent').length;

    return res.status(200).json({
      mailbox: config.SENDER_MAILBOX,
      auto_send: loadAutoSendSetting(),
      daily_limit: config.DAILY_REPLY_LIMIT,
      used_today: usedToday,
      remaining_today: Math.max(0, config.DAILY_REPLY_LIMIT - usedToday),
      date: today,
      has_deepseek_key: Boolean(config.DEEPSEEK_API_KEY),
      has_hostinger_token: Boolean(config.HOSTINGER_API_TOKEN),
      has_webhook_token: Boolean(config.HOSTINGER_WEBHOOK_BEARER_TOKEN),
      deepseek_model: config.DEEPSEEK_MODEL,
      send_endpoint: config.HOSTINGER_SEND_ENDPOINT,
      outreachStats: {
        total: outreach.length,
        pendingDrafts,
        sentOutreach,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMailboxMessages(req, res, next) {
  try {
    const messages = loadMailboxHistory();
    return res.status(200).json({
      messages,
      total: messages.length,
    });
  } catch (err) {
    next(err);
  }
}

export async function getOutreachList(req, res, next) {
  try {
    const outreach = loadOutreachHistory();
    return res.status(200).json({
      outreach,
      total: outreach.length,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateColdMailDraft(req, res, next) {
  return withOutreachHistoryLock(() => updateColdMailDraftUnlocked(req, res, next));
}

async function updateColdMailDraftUnlocked(req, res, next) {
  try {
    const { id, subject, body } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'Missing outreach draft ID.' });
    }

    const outreach = loadOutreachHistory();
    let updatedRecord = null;

    for (const item of outreach) {
      if (item.id === id || (item.leadId && `outreach-${item.leadId}` === id)) {
        if (item.status !== 'pending_review') {
          return res.status(409).json({ error: 'Only pending drafts can be edited.' });
        }
        if (typeof subject === 'string') item.subject = subject;
        if (typeof body === 'string') item.body = body;
        updatedRecord = item;
        break;
      }
    }

    if (!updatedRecord) {
      return res.status(404).json({ error: 'Outreach draft not found.' });
    }

    saveOutreachHistory(outreach);
    return res.status(200).json({ success: true, outreach: updatedRecord });
  } catch (err) {
    next(err);
  }
}

export async function sendColdMail(req, res, next) {
  return withOutreachHistoryLock(() => sendColdMailUnlocked(req, res, next));
}

async function sendColdMailUnlocked(req, res, next) {
  try {
    const { id, to, subject, body } = req.body || {};
    if (typeof id !== 'string' || !id.trim() || typeof to !== 'string' || !to.trim() ||
        typeof body !== 'string' || !body.trim() || (subject !== undefined && typeof subject !== 'string')) {
      return res.status(400).json({ error: 'Missing outreach draft ID, recipient email or email body.' });
    }

    const draft = loadOutreachHistory().find((item) => item.id === id || (item.leadId && `outreach-${item.leadId}` === id));
    if (!draft) return res.status(404).json({ error: 'Outreach draft not found.' });
    if (draft.status !== 'pending_review') return res.status(409).json({ error: 'Outreach draft was already sent.' });
    if (draft.recipient !== to) return res.status(400).json({ error: 'Recipient does not match outreach draft.' });
    const savedLead = loadLeadsHistory().leads?.find((lead) => lead.id === draft.leadId);
    if (draft.source === 'simulated' || savedLead?.source === 'simulated') {
      return res.status(400).json({ error: 'Simulated leads cannot receive outreach email.' });
    }
    if (!savedLead || savedLead.source !== 'live' || savedLead.email !== to ||
        !['deliverable', 'valid'].includes(savedLead.emailStatus)) {
      return res.status(400).json({ error: 'A saved, verified live lead is required for outreach.' });
    }

    // Explicit confirmation dispatch
    const sendResult = await sendEmail(to, subject || 'Partnership with The Spice Coast', body);
    if (sendResult?.status === 'simulated') {
      return res.status(503).json({ error: 'Email transport is not configured. Message was not sent.' });
    }

    const d = new Date();
    const sentDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

    // Update in outreach history
    const outreach = loadOutreachHistory();
    let found = false;
    for (const item of outreach) {
      if (item.id === id || (item.leadId && `outreach-${item.leadId}` === id)) {
        item.status = 'sent';
        item.sentAt = sentDate;
        if (subject) item.subject = subject;
        if (body) item.body = body;
        found = true;
        break;
      }
    }

    if (!found) {
      outreach.unshift({
        id: id || `outreach-${Date.now()}`,
        recipient: to,
        subject: subject || 'Direct Origin Spices Partnership',
        body,
        status: 'sent',
        sentAt: sentDate,
        createdAt: sentDate.slice(0, 10),
      });
    }
    saveOutreachHistory(outreach);

    return res.status(200).json({
      status: 'sent',
      to,
      sentAt: sentDate,
      result: sendResult,
    });
  } catch (err) {
    return res.status(500).json({ error: `Failed to dispatch cold email: ${err.message}` });
  }
}

export async function testIncomingEmail(req, res, next) {
  try {
    const body = req.body || {};
    const senderEmail = body.from || 'inquiry@eurospice-hamburg.de';
    const senderName = body.from_name || 'Markus Weber';
    const subject = body.subject || 'Inquiry: Bulk Malabar Black Pepper & Cardamom FOB pricing';
    const message =
      body.message ||
      'Hello SpiceCoast Team,\n\nWe are looking to import 2 FCL containers of TGSEB Black Pepper and Alleppey Green Cardamom (8mm). Please share your current specification sheet and FOB price quotation.\n\nBest regards,\nMarkus Weber';
    // Simulation must only create a draft, even when auto-send is enabled.
    const autoSend = false;

    const payload = {
      from: senderEmail,
      from_name: senderName,
      subject,
      message,
    };

    const { statusCode, response } = await processIncomingEmail(payload, '', true, autoSend);
    return res.status(statusCode).json(response);
  } catch (err) {
    next(err);
  }
}

export async function sendReviewedDraft(req, res, next) {
  return withMailboxHistoryLock(() => sendReviewedDraftUnlocked(req, res, next));
}

async function sendReviewedDraftUnlocked(req, res, next) {
  try {
    const { id: messageId, to: toAddress, subject, reply: replyText } = req.body || {};

    if (typeof messageId !== 'string' || !messageId.trim() || typeof toAddress !== 'string' || !toAddress.trim() ||
        typeof replyText !== 'string' || !replyText.trim() || (subject !== undefined && typeof subject !== 'string')) {
      return res.status(400).json({ error: 'Missing mailbox draft ID, recipient address or reply body.' });
    }

    if (messageId) {
      const message = loadMailboxHistory().find((item) => item.id === messageId);
      if (!message) return res.status(404).json({ error: 'Mailbox draft not found.' });
      if (message.status !== 'drafted') return res.status(409).json({ error: 'Mailbox draft was already handled.' });
      if (message.source === 'simulated') return res.status(400).json({ error: 'Simulated inquiries cannot receive email.' });
      if (message.sender !== toAddress) return res.status(400).json({ error: 'Recipient does not match mailbox draft.' });
    }

    const sendRes = await sendEmail(toAddress, subject || 'Spice Inquiry', replyText, { reply: true });
    if (sendRes?.status === 'simulated') {
      return res.status(503).json({ error: 'Email transport is not configured. Message was not sent.' });
    }

    // Update message status in history
    const history = loadMailboxHistory();
    const d = new Date();
    const sentDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

    for (const msg of history) {
      if ((messageId && msg.id === messageId) || (!messageId && msg.sender === toAddress && msg.status === 'drafted')) {
        msg.status = 'sent';
        msg.sentAt = sentDate;
        break;
      }
    }
    saveMailboxHistory(history);

    return res.status(200).json({ status: 'sent', result: sendRes });
  } catch (err) {
    return res.status(500).json({ error: `Failed to dispatch via Hostinger API: ${err.message}` });
  }
}

export async function toggleAutosend(req, res, next) {
  try {
    const { auto_send: nextState } = req.body || {};
    if (typeof nextState !== 'boolean') {
      return res.status(400).json({ error: 'auto_send must be a boolean.' });
    }
    saveAutoSendSetting(nextState);
    return res.status(200).json({ auto_send: loadAutoSendSetting() });
  } catch (err) {
    next(err);
  }
}

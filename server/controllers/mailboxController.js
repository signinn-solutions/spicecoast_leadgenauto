import config from '../config/env.js';
import {
  loadReplyUsage,
  loadMailboxHistory,
  saveMailboxHistory,
  loadOutreachHistory,
  saveOutreachHistory,
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
      auto_send: config.AUTO_SEND,
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
  try {
    const { id, subject, body } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'Missing outreach draft ID.' });
    }

    const outreach = loadOutreachHistory();
    let updatedRecord = null;

    for (const item of outreach) {
      if (item.id === id) {
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
  try {
    const { id, to, subject, body } = req.body || {};
    if (!to || !body) {
      return res.status(400).json({ error: 'Missing recipient email or email body.' });
    }

    // Explicit confirmation dispatch
    const sendResult = await sendEmail(to, subject || 'Partnership with The Spice Coast', body);

    const d = new Date();
    const sentDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

    // Update in outreach history
    const outreach = loadOutreachHistory();
    let found = false;
    for (const item of outreach) {
      if (item.id === id || item.recipient === to) {
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
    const autoSend = Boolean(body.auto_send);

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
  try {
    const { id: messageId, to: toAddress, subject, reply: replyText } = req.body || {};

    if (!toAddress || !replyText) {
      return res.status(400).json({ error: 'Missing recipient address or reply body.' });
    }

    const sendRes = await sendEmail(toAddress, subject || 'Spice Inquiry', replyText);

    // Update message status in history
    const history = loadMailboxHistory();
    const d = new Date();
    const sentDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

    for (const msg of history) {
      if (msg.id === messageId || (msg.sender === toAddress && msg.status === 'drafted')) {
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
    if (typeof nextState !== 'undefined') {
      config.AUTO_SEND = Boolean(nextState);
    }
    return res.status(200).json({ auto_send: config.AUTO_SEND });
  } catch (err) {
    next(err);
  }
}

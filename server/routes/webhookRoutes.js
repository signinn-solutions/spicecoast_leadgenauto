import express from 'express';
import config from '../config/env.js';
import { handleWebhook } from '../controllers/mailboxController.js';
import { loadReplyUsage } from '../services/storageService.js';

const router = express.Router();

// GET /webhook: Browser / Ping status check
router.get('/webhook', (req, res) => {
  const { date: today, count: usedToday } = loadReplyUsage();

  if (req.accepts('html') && !req.accepts('json')) {
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Hostinger Webhook Status | SpiceCoast</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #17140f; color: #f3ecdd; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background: #211c15; border: 1px solid #3c3324; border-radius: 16px; padding: 32px; max-width: 540px; width: 100%; box-shadow: 0 12px 36px rgba(0,0,0,0.5); }
          .header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
          .badge { background: rgba(126, 168, 110, 0.18); color: #7ea86e; border: 1px solid #7ea86e; padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
          h1 { font-size: 22px; margin: 0; color: #f3ecdd; font-weight: 600; }
          p { color: #b3a892; font-size: 14px; line-height: 1.5; margin: 0 0 20px; }
          .info-box { background: #17140f; border: 1px solid #2d2718; border-radius: 10px; padding: 16px; font-family: monospace; font-size: 13px; margin-bottom: 24px; line-height: 1.7; color: #e3a22e; }
          .btn { display: inline-block; background: linear-gradient(155deg, #e3a22e, #b5761e); color: #1a1509; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 20px; border-radius: 8px; text-align: center; }
          .btn:hover { filter: brightness(1.1); }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <span class="badge">● ${config.HOSTINGER_WEBHOOK_BEARER_TOKEN ? 'Ready' : 'Needs configuration'}</span>
            <h1>Hostinger Webhook</h1>
          </div>
          <p>This endpoint receives <strong>POST</strong> webhook events from Hostinger Agentic Mail. When incoming emails arrive, DeepSeek automatically processes them and generates contextual drafts.</p>
          <div class="info-box">
            Method: <strong>POST</strong><br />
            Mailbox: <strong>${config.SENDER_MAILBOX}</strong><br />
            AI Model: <strong>${config.DEEPSEEK_MODEL}</strong><br />
            Auth: <strong>${config.HOSTINGER_WEBHOOK_BEARER_TOKEN ? 'Bearer Token Active' : 'Bearer token required'}</strong><br />
            Quota Used Today: <strong>${usedToday}/${config.DAILY_REPLY_LIMIT}</strong>
          </div>
          <a href="/" class="btn">Open SpiceCoast Dashboard →</a>
        </div>
      </body>
      </html>
    `);
  }

  return res.status(200).json({
    status: config.HOSTINGER_WEBHOOK_BEARER_TOKEN ? 'online' : 'needs_configuration',
    message: config.HOSTINGER_WEBHOOK_BEARER_TOKEN ? 'Hostinger Webhook listener is ready to receive POST payloads.' : 'Configure HOSTINGER_WEBHOOK_BEARER_TOKEN before sending POST payloads.',
    method: 'POST',
    endpoint: '/webhook',
    mailbox: config.SENDER_MAILBOX,
    ai_model: config.DEEPSEEK_MODEL,
    has_bearer_token: Boolean(config.HOSTINGER_WEBHOOK_BEARER_TOKEN),
    daily_quota: {
      date: today,
      used_today: usedToday,
      remaining_today: Math.max(0, config.DAILY_REPLY_LIMIT - usedToday),
    },
  });
});

// POST /webhook: Hostinger incoming webhook handler
router.post('/webhook', handleWebhook);

export default router;

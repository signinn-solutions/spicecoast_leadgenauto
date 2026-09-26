import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

export const config = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  NODE_ENV: process.env.NODE_ENV || 'development',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || '',
  TRUST_PROXY: process.env.TRUST_PROXY === '1' ? 1 : false,

  // Google Places API
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',

  // Hunter.io API
  HUNTER_API_KEY: process.env.HUNTER_API_KEY || '',

  // DeepSeek AI API
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-chat',

  // Hostinger Agentic Mail API & Webhook
  HOSTINGER_API_TOKEN: process.env.HOSTINGER_API_TOKEN || '',
  HOSTINGER_WEBHOOK_BEARER_TOKEN: process.env.HOSTINGER_WEBHOOK_BEARER_TOKEN || '',
  SENDER_MAILBOX: process.env.SENDER_MAILBOX || 'sales@thespicecoast.com',

  // Hostinger Send Endpoint
  get HOSTINGER_SEND_ENDPOINT() {
    return (
      process.env.HOSTINGER_SEND_ENDPOINT ||
      `https://api.mail.hostinger.com/v1/mailboxes/${this.SENDER_MAILBOX}/messages`
    );
  },

  // SMTP Settings (Optional fallback/alternative)
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',

  // Automation Guardrails
  AUTO_SEND: (process.env.AUTO_SEND || 'false').toLowerCase() === 'true',
  DAILY_LEAD_LIMIT: parseInt(process.env.DAILY_LEAD_LIMIT || process.env.DAILY_LIMIT || '50', 10),
  DAILY_REPLY_LIMIT: parseInt(process.env.DAILY_REPLY_LIMIT || '30', 10),

  // SQLite storage and preserved legacy JSON import sources
  DB_PATH: process.env.SPICECOAST_DB_PATH || path.join(rootDir, 'spicecoast.sqlite'),
  DAILY_USAGE_FILE: path.join(rootDir, 'daily_usage.json'),
  REPLY_USAGE_FILE: path.join(rootDir, 'reply_usage.json'),
  LEADS_HISTORY_FILE: path.join(rootDir, 'leads_history.json'),
  SEEN_PLACES_FILE: path.join(rootDir, 'seen_places.json'),
  MAILBOX_HISTORY_FILE: path.join(rootDir, 'mailbox_history.json'),
  OUTREACH_HISTORY_FILE: path.join(rootDir, 'outreach_history.json'),
};

export default config;

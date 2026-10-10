import dotenv from 'dotenv';
import {tenantContext} from '../services/tenantContext.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env file
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
export const baseConfig = {
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
  HUNTER_ENABLED: process.env.HUNTER_ENABLED === 'true',
  // DeepSeek AI API
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  // Hostinger Agentic Mail API & Webhook
  SETTINGS_ENCRYPTION_KEY: process.env.SETTINGS_ENCRYPTION_KEY || '',
  HOSTINGER_MAILBOX_ID: process.env.HOSTINGER_MAILBOX_ID || '',
  DAILY_SEND_LIMIT: parseInt(process.env.DAILY_SEND_LIMIT || '50', 10),
  QUOTA_TIMEZONE: process.env.QUOTA_TIMEZONE || 'Asia/Kolkata',
  HOSTINGER_API_TOKEN: process.env.HOSTINGER_API_TOKEN || '',
  HOSTINGER_WEBHOOK_BEARER_TOKEN: process.env.HOSTINGER_WEBHOOK_BEARER_TOKEN || '',
  SENDER_MAILBOX: process.env.SENDER_MAILBOX || 'sales@thespicecoast.com',
  HOSTINGER_SEND_ENDPOINT_OVERRIDE: process.env.HOSTINGER_SEND_ENDPOINT || '',
  // Hostinger Send Endpoint
  get HOSTINGER_SEND_ENDPOINT() {
    return this.HOSTINGER_SEND_ENDPOINT_OVERRIDE || (this.HOSTINGER_MAILBOX_ID ? `https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(this.HOSTINGER_MAILBOX_ID)}/send` : '');
  },
  // SMTP Settings (Optional fallback/alternative)
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  BUSINESS_CONTEXT: process.env.BUSINESS_CONTEXT || '',
  LEAD_KEYWORDS: process.env.LEAD_KEYWORDS || '',
  // Automation Guardrails
  AUTO_SEND: (process.env.AUTO_SEND || 'false').toLowerCase() === 'true',
  DAILY_LEAD_LIMIT: parseInt(process.env.DAILY_LEAD_LIMIT || process.env.DAILY_LIMIT || '-1', 10),
  DAILY_REPLY_LIMIT: parseInt(process.env.DAILY_REPLY_LIMIT || '30', 10),
  // SQLite storage and preserved legacy JSON import sources
  DB_PATH: process.env.SPICECOAST_DB_PATH || path.join(rootDir, 'spicecoast.sqlite'),
  DAILY_USAGE_FILE: path.join(rootDir, 'daily_usage.json'),
  REPLY_USAGE_FILE: path.join(rootDir, 'reply_usage.json'),
  LEADS_HISTORY_FILE: path.join(rootDir, 'leads_history.json'),
  SEEN_PLACES_FILE: path.join(rootDir, 'seen_places.json'),
  MAILBOX_HISTORY_FILE: path.join(rootDir, 'mailbox_history.json'),
  OUTREACH_HISTORY_FILE: path.join(rootDir, 'outreach_history.json')
};
export const config = new Proxy(baseConfig, {
  get(target,key,receiver) {const scoped=tenantContext()?.config;return scoped && Object.hasOwn(scoped,key) ? scoped[key] : Reflect.get(target,key,receiver);},
  set(target,key,value) {const scoped=tenantContext()?.config;if(scoped) scoped[key]=value;else target[key]=value;return true;}
});
export default config;

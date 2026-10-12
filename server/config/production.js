import path from 'node:path';

export function validateProductionConfig(config) {
  if (config.NODE_ENV !== 'production') return;
  const issues = [];
  if (!config.ADMIN_EMAIL || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(config.ADMIN_PASSWORD_HASH)) issues.push('Set ADMIN_EMAIL and a valid ADMIN_PASSWORD_HASH');
  if (!config.GROQ_API_KEY) issues.push('Set GROQ_API_KEY');
  if (!path.isAbsolute(config.DB_PATH)) issues.push('Use an absolute SPICECOAST_DB_PATH');
  if (config.HOSTINGER_API_TOKEN && !config.HOSTINGER_SEND_ENDPOINT) issues.push('Set HOSTINGER_MAILBOX_RESOURCE_ID');
  if (!(config.HOSTINGER_API_TOKEN || (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS))) issues.push('Configure Hostinger or SMTP delivery');
  if (!config.HOSTINGER_WEBHOOK_BEARER_TOKEN) issues.push('Set HOSTINGER_WEBHOOK_BEARER_TOKEN');
  if (issues.length) throw new Error(`Production configuration incomplete: ${issues.join('; ')}`);
}

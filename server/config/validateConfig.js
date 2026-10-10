import config from './env.js';
export function validateRuntimeConfig() {
  for (const key of ['DAILY_LEAD_LIMIT', 'DAILY_REPLY_LIMIT', 'DAILY_SEND_LIMIT']) if (!Number.isInteger(config[key]) || config[key] < 1 || config[key] > 10000) throw new Error(key + ' must be an integer between 1 and 10000.');
  if (!Number.isInteger(config.PORT) || config.PORT < 1 || config.PORT > 65535) throw new Error('PORT must be between 1 and 65535.');
  new Intl.DateTimeFormat('en-CA', {
    timeZone: config.QUOTA_TIMEZONE
  }).format(new Date());
}

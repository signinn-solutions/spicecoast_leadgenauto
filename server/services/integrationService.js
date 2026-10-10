import { tenantContext } from './tenantContext.js';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import config from '../config/env.js';
import { getDatabase, withMailboxHistoryLock, withOutreachHistoryLock, withStorageOperationLock } from './storageService.js';
import { audit } from './accessService.js';
export const INTEGRATION_FIELDS = {
  BUSINESS_CONTEXT: {
    label: 'Business description and approved offerings'
  },
  LEAD_KEYWORDS: {
    label: 'Inbound lead keywords (comma-separated)'
  },
  GOOGLE_API_KEY: {
    secret: true,
    label: 'Google Places API key'
  },
  HUNTER_API_KEY: {
    secret: true,
    label: 'Hunter API key'
  },
  DEEPSEEK_API_KEY: {
    secret: true,
    label: 'DeepSeek API key'
  },
  DEEPSEEK_MODEL: {
    label: 'DeepSeek model'
  },
  HOSTINGER_API_TOKEN: {
    secret: true,
    label: 'Hostinger Mail API token'
  },
  HOSTINGER_WEBHOOK_BEARER_TOKEN: {
    secret: true,
    label: 'Inbound webhook bearer token'
  },
  HOSTINGER_MAILBOX_ID: {
    label: 'Hostinger mailbox resource ID'
  },
  SENDER_MAILBOX: {
    label: 'Shared sender mailbox'
  },
  SMTP_HOST: {
    label: 'SMTP host'
  },
  SMTP_PORT: {
    number: true,
    min: 1,
    max: 65535,
    label: 'SMTP port'
  },
  SMTP_USER: {
    label: 'SMTP username'
  },
  SMTP_PASS: {
    secret: true,
    label: 'SMTP password'
  },
  SMTP_SECURE: {
    boolean: true,
    label: 'SMTP implicit TLS'
  },
  DAILY_LEAD_LIMIT: {
    number: true,
    min: 1,
    max: 10000,
    label: 'Workspace daily discovery limit'
  },
  DAILY_REPLY_LIMIT: {
    number: true,
    min: 1,
    max: 10000,
    label: 'Daily inbound AI draft limit'
  },
  DAILY_SEND_LIMIT: {
    number: true,
    min: 1,
    max: 10000,
    label: 'Daily outbound send limit'
  }
};
function encryptionKey() {
  if (!/^[a-f0-9]{64}$/i.test(config.SETTINGS_ENCRYPTION_KEY)) throw Object.assign(new Error('Set SETTINGS_ENCRYPTION_KEY to a 64-character hexadecimal secret before saving provider settings.'), {
    statusCode: 503
  });
  return Buffer.from(config.SETTINGS_ENCRYPTION_KEY, 'hex');
}
function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    data: data.toString('hex')
  });
}
function decrypt(value) {
  const row = JSON.parse(value);
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(row.iv, 'hex'));
  cipher.setAuthTag(Buffer.from(row.tag, 'hex'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(row.data, 'hex')), cipher.final()]).toString('utf8'));
}
export function loadProviderSettings() {
  const row = getDatabase().prepare("SELECT value FROM settings WHERE name='provider_config'").get();
  if (row) {
    const saved = decrypt(row.value);
    for (const k of Object.keys(INTEGRATION_FIELDS)) if (Object.hasOwn(saved, k)) config[k] = saved[k];
  }
}
export function providerSettings() {
  return {
    encryptionReady: /^[a-f0-9]{64}$/i.test(config.SETTINGS_ENCRYPTION_KEY),
    fields: Object.entries(INTEGRATION_FIELDS).filter(([key]) => !tenantContext() || !key.startsWith('DAILY_')).map(([key, field]) => ({
      key,
      ...field,
      ...(field.secret ? {
        configured: Boolean(config[key])
      } : {
        value: config[key]
      })
    }))
  };
}
function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Expected integration settings.'), {
    statusCode: 400
  });
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (tenantContext() && key.startsWith('DAILY_')) throw Object.assign(new Error('Manage company quotas in its subscription plan.'), {
      statusCode: 400
    });
    const f = INTEGRATION_FIELDS[key];
    if (!f) throw Object.assign(new Error('Unsupported setting: ' + key), {
      statusCode: 400
    });
    if (f.number) {
      if (!Number.isInteger(value) || value < f.min || value > f.max) throw Object.assign(new Error(f.label + ' is out of range.'), {
        statusCode: 400
      });
    } else if (f.boolean) {
      if (typeof value !== 'boolean') throw Object.assign(new Error(f.label + ' must be boolean.'), {
        statusCode: 400
      });
    } else if (typeof value !== 'string' || value.length > 4096 || /[\r\n\u0000]/.test(value)) throw Object.assign(new Error(f.label + ' must be a single line of text.'), {
      statusCode: 400
    });
    output[key] = typeof value === 'string' ? value.trim() : value;
  }
  if (Object.hasOwn(output, 'SENDER_MAILBOX') && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(output.SENDER_MAILBOX)) throw Object.assign(new Error('Enter one plain sender email address.'), {
    statusCode: 400
  });
  if (output.HOSTINGER_MAILBOX_ID && !/^[a-z0-9_-]{1,100}$/i.test(output.HOSTINGER_MAILBOX_ID)) throw Object.assign(new Error('Enter the Hostinger mailbox resource ID, not an email address.'), {
    statusCode: 400
  });
  if (output.SMTP_HOST && !/^[a-z0-9.-]+$/i.test(output.SMTP_HOST)) throw Object.assign(new Error('Enter an SMTP hostname.'), {
    statusCode: 400
  });
  return output;
}
export async function saveProviderSettings(input, actor) {
  const patch = validate(input);
  encryptionKey();
  return withMailboxHistoryLock(() => withStorageOperationLock('lead-search', () => withOutreachHistoryLock(() => withStorageOperationLock('mail-send', async () => {
    const row = getDatabase().prepare("SELECT value FROM settings WHERE name='provider_config'").get();
    const saved = row ? decrypt(row.value) : {};
    Object.assign(saved, patch);
    getDatabase().prepare("INSERT INTO settings(name,value) VALUES('provider_config',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value").run(encrypt(saved));
    Object.assign(config, patch);
    audit(actor, 'integrations.updated', 'workspace', {
      fields: Object.keys(patch)
    });
    return providerSettings();
  }))));
}
export async function checkProvider(provider) {
  const fetchJson = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('Provider returned HTTP ' + response.status);
    return response.json();
  };
  try {
    if (provider === 'hunter') {
      if (!config.HUNTER_API_KEY) throw new Error('Hunter key is missing.');
      const data = await fetchJson('https://api.hunter.io/v2/account?api_key=' + encodeURIComponent(config.HUNTER_API_KEY));
      return {
        ok: true,
        provider,
        requests: data.data?.requests || null
      };
    }
    if (provider === 'deepseek') {
      if (!config.DEEPSEEK_API_KEY) throw new Error('DeepSeek key is missing.');
      await fetchJson('https://api.deepseek.com/models', {
        headers: {
          Authorization: 'Bearer ' + config.DEEPSEEK_API_KEY
        }
      });
      return {
        ok: true,
        provider
      };
    }
    if (provider === 'hostinger') {
      if (!config.HOSTINGER_API_TOKEN) throw new Error('Hostinger token is missing.');
      const data = await fetchJson('https://api.mail.hostinger.com/api/v1/me', {
        headers: {
          Authorization: 'Bearer ' + config.HOSTINGER_API_TOKEN
        }
      });
      const mailboxes = (Array.isArray(data.data?.mailboxes) ? data.data.mailboxes : []).map(m => ({
        resourceId: m.resourceId,
        address: m.address
      }));
      return {
        ok: true,
        provider,
        mailboxes,
        senderAccessible: mailboxes.some(m => m.address?.toLowerCase() === config.SENDER_MAILBOX.toLowerCase() && m.resourceId === config.HOSTINGER_MAILBOX_ID)
      };
    }
    if (provider === 'google') return {
      ok: false,
      provider,
      reason: 'Google Places authentication and billing require an actual search. Use a one-result live search; it can incur provider charges.'
    };
    throw new Error('Choose hunter, deepseek, hostinger, or google.');
  } catch (error) {
    return {
      ok: false,
      provider,
      reason: error.message.startsWith('Provider returned HTTP') || /missing|Choose/.test(error.message) ? error.message : 'Provider connection failed.'
    };
  }
}

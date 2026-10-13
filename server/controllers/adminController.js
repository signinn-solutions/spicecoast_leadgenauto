import config from '../config/env.js';
import { resetOperationalData } from '../services/resetData.js';
import { getAiSettings } from '../services/aiProvider.js';
import { requestHunter } from '../services/hunterClient.js';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  getAuditLogs,
  getSystemMetrics,
  addAuditLog,
} from '../services/userService.js';
import {
  loadDailyUsage,
  saveDailyUsage,
  loadReplyUsage,
  saveReplyUsage,
  loadHunterSetting,
  saveHunterSetting,
  loadAutoSendSetting,
  saveAutoSendSetting,
  getTodayDateString,
  withStorageOperationLock,
  withOutreachHistoryLock,
  withMailboxHistoryLock,
} from '../services/storageService.js';
import {
  isHunterQuotaExceeded,
  resetHunterQuotaState,
  setHunterQuotaExceeded,
} from '../services/leadFinderService.js';

export async function listUsersHandler(req, res, next) {
  try {
    const users = getAllUsers();
    return res.status(200).json({ users });
  } catch (err) {
    next(err);
  }
}

export async function resetDataHandler(req, res, next) {
  try {
    const { scope, confirmation } = req.body || {};
    if (!['leads', 'all'].includes(scope) || confirmation !== (scope === 'all' ? 'RESET DATA' : 'RESET LEADS')) return res.status(400).json({ error: 'Choose a reset scope and type the exact confirmation phrase.' });
    return res.json(await resetOperationalData(scope, req.dashboardSession.email));
  } catch (error) { next(error); }
}

export async function createUserHandler(req, res, next) {
  try {
    const { name, email, password, role, notes } = req.body || {};
    const actorEmail = req.dashboardSession?.email || 'superadmin';
    const newUser = await createUser({ name, email, password, role, createdBy: actorEmail, notes });
    return res.status(201).json({ success: true, user: newUser });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
}

export async function updateUserHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { name, role, status, password, notes } = req.body || {};
    const actorEmail = req.dashboardSession?.email || 'superadmin';
    const updated = await updateUser(id, { name, role, status, password, notes }, actorEmail);
    return res.status(200).json({ success: true, user: updated });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
}

export async function deleteUserHandler(req, res, next) {
  try {
    const { id } = req.params;
    const actorEmail = req.dashboardSession?.email || 'superadmin';
    const result = await withStorageOperationLock('lead-search', () => withMailboxHistoryLock(() => withOutreachHistoryLock(() => deleteUser(id, actorEmail))));
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
}

export async function getSystemHealthHandler(req, res, next) {
  try {
    const metrics = getSystemMetrics();
    const hunterEnabled = loadHunterSetting();
    const autoSend = loadAutoSendSetting();
    const { date: todayDate, count: dailyLeads } = loadDailyUsage();
    const { count: dailyReplies } = loadReplyUsage();

    const diagnostics = {
      google_places: {
        configured: Boolean(config.GOOGLE_API_KEY),
        status: config.GOOGLE_API_KEY ? 'healthy' : 'unconfigured',
        details: config.GOOGLE_API_KEY ? 'Google Places API key loaded' : 'Missing API key',
      },
      hunter_io: {
        configured: Boolean(config.HUNTER_API_KEY),
        status: !hunterEnabled
          ? 'disabled_by_operator'
          : isHunterQuotaExceeded()
          ? 'quota_exceeded'
          : config.HUNTER_API_KEY
          ? 'healthy'
          : 'unconfigured',
        enabled: hunterEnabled,
        quota_exceeded: isHunterQuotaExceeded(),
        details: !hunterEnabled
          ? 'Hunter disabled: Inbuilt scraper engine active'
          : isHunterQuotaExceeded()
          ? 'Hunter quota reached. Admin must restore quota or select scraper.'
          : 'Optional Hunter mode selected; requires a configured API key.',
      },
      inbuilt_scraper: {
        configured: true,
        status: 'healthy',
        details: 'Native HTML crawler + DNS MX record validator ready',
      },
      groq_ai: {
        provider: getAiSettings().provider,
        label: getAiSettings().label,
        configured: Boolean(getAiSettings().apiKey),
        model: getAiSettings().model,
        status: getAiSettings().apiKey ? 'healthy' : 'unconfigured',
        details: getAiSettings().apiKey ? `Configured using ${getAiSettings().model}` : 'Missing API key',
      },
      hostinger_mail: {
        configured: Boolean(config.HOSTINGER_API_TOKEN),
        mailbox: config.SENDER_MAILBOX,
        status: config.HOSTINGER_API_TOKEN ? 'healthy' : 'unconfigured',
        webhook_token_configured: Boolean(config.HOSTINGER_WEBHOOK_BEARER_TOKEN),
        details: config.HOSTINGER_API_TOKEN ? `Bound to ${config.SENDER_MAILBOX}; delivery not tested` : 'API token missing; API delivery unavailable',
      },
    };

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      environment: config.NODE_ENV,
      server_uptime: metrics.uptimeSeconds,
      auto_send: autoSend,
      discovery_engine: hunterEnabled ? 'hunter' : 'scraper',
      quotas: {
        date: todayDate,
        leads_harvested: dailyLeads,
        leads_limit: config.DAILY_LEAD_LIMIT,
        leads_remaining: Math.max(0, config.DAILY_LEAD_LIMIT - dailyLeads),
        replies_dispatched: dailyReplies,
        replies_limit: config.DAILY_REPLY_LIMIT,
        replies_remaining: Math.max(0, config.DAILY_REPLY_LIMIT - dailyReplies),
      },
      system: metrics,
      integrations: diagnostics,
    });
  } catch (err) {
    next(err);
  }
}

export async function resetHunterQuotaHandler(req, res, next) {
  try {
    resetHunterQuotaState();
    addAuditLog({
      userEmail: req.dashboardSession?.email || 'superadmin',
      action: 'quota_reset',
      details: 'Superadmin reset Hunter.io quota state flag.',
      category: 'admin',
    });
    return res.status(200).json({
      success: true,
      message: 'Hunter.io quota flag has been reset. API will be queried on next discovery.',
      hunter_quota_exceeded: false,
    });
  } catch (err) {
    next(err);
  }
}

export async function resetDailyUsageHandler(req, res, next) {
  try {
    const { type } = req.body || {};
    if (!['leads', 'replies'].includes(type)) {
      return res.status(400).json({ error: 'Usage type must be leads or replies.' });
    }
    const today = getTodayDateString();
    if (type === 'replies') {
      saveReplyUsage(today, 0);
    } else {
      saveDailyUsage(today, 0);
    }

    addAuditLog({
      userEmail: req.dashboardSession?.email || 'superadmin',
      action: 'daily_usage_reset',
      details: `Superadmin cleared daily ${type || 'leads'} usage counter for ${today}.`,
      category: 'admin',
    });

    return res.status(200).json({
      success: true,
      message: `Reset ${type || 'leads'} usage count to 0 for today.`,
    });
  } catch (err) {
    next(err);
  }
}

export async function testConnectionHandler(req, res, next) {
  try {
    const { service } = req.body || {};
    const startTime = Date.now();

    if (service === 'google_places') {
      if (!config.GOOGLE_API_KEY) {
        return res.status(400).json({ ok: false, error: 'Google Places API key is not configured.' });
      }
      try {
        const resp = await fetch(
          `https://places.googleapis.com/v1/places:searchText`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': config.GOOGLE_API_KEY,
              'X-Goog-FieldMask': 'places.id',
            },
            body: JSON.stringify({ textQuery: 'Spices in Dubai', pageSize: 1 }),
            signal: AbortSignal.timeout(5000),
          }
        );
        const latency = Date.now() - startTime;
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          return res.status(200).json({ ok: false, status: resp.status, latency, error: err.error?.message || `HTTP ${resp.status}` });
        }
        return res.status(200).json({ ok: true, latency, message: 'Google Places API connection verified successfully.' });
      } catch (err) {
        return res.status(200).json({ ok: false, latency: Date.now() - startTime, error: err.message });
      }
    }

    if (service === 'hunter') {
      if (!config.HUNTER_API_KEY) return res.status(400).json({ ok: false, error: 'Hunter API key is not configured.' });
      const account = await requestHunter('account', { maxAttempts: 1 });
      if (!account.ok || !account.data) return res.status(200).json({ ok: false, status: account.status, error: `Hunter authentication failed (HTTP ${account.status}).` });
      // A filter-only Discover probe does not consume a natural-language query or email credits.
      const discover = await requestHunter('discover', { body: { organization: { domain: ['hunter.io'] } }, maxAttempts: 1 });
      return res.status(200).json({
        ok: discover.ok, authenticated: true, discover_access: discover.ok,
        latency: Date.now() - startTime,
        ...(discover.ok ? { message: 'Hunter account authenticated and Discover access confirmed.' } : { error: `Account authenticated, but Discover access failed (HTTP ${discover.status}).` }),
        account: { plan_name: account.data.plan_name, requests: account.data.requests },
      });
    }

    if (service === 'groq') {
      if (!getAiSettings().apiKey) {
        return res.status(400).json({ ok: false, error: `${getAiSettings().label} API key is not configured.` });
      }
      try {
        const resp = await fetch(`${getAiSettings().baseURL}/models`, {
          headers: { Authorization: `Bearer ${getAiSettings().apiKey}` },
          signal: AbortSignal.timeout(5000),
        });
        const latency = Date.now() - startTime;
        if (!resp.ok) {
          return res.status(200).json({ ok: false, status: resp.status, latency, error: `${getAiSettings().label} responded with HTTP ${resp.status}` });
        }
        return res.status(200).json({ ok: true, latency, message: `${getAiSettings().label} API authenticated successfully.` });
      } catch (err) {
        return res.status(200).json({ ok: false, latency: Date.now() - startTime, error: err.message });
      }
    }

    if (service === 'hostinger') {
      const latency = Date.now() - startTime;
      if (!config.HOSTINGER_API_TOKEN) {
        return res.status(400).json({
          ok: false,
          verified: false,
          latency,
          error: 'Hostinger API token is not configured. API delivery cannot be verified.',
        });
      }
      try {
        const response = await fetch('https://api.mail.hostinger.com/api/v1/me', { headers: { Authorization: `Bearer ${config.HOSTINGER_API_TOKEN}` }, signal: AbortSignal.timeout(10000) });
        const payload = await response.json().catch(() => ({}));
        const mailbox = payload.data?.mailboxes?.find(item => item.address?.toLowerCase() === config.SENDER_MAILBOX.toLowerCase() && item.resourceId === config.HOSTINGER_MAILBOX_RESOURCE_ID);
        const ok = response.ok && Boolean(mailbox);
        return res.status(200).json({ ok, verified: ok, latency: Date.now() - startTime,
          ...(ok ? { message: 'Hostinger token and sender mailbox access verified. Actual delivery requires an approved send.' } : { error: response.ok ? 'Configured sender/resource ID does not match an authorized mailbox.' : `Hostinger authentication failed (HTTP ${response.status}).` }) });
      } catch { return res.status(200).json({ ok: false, verified: false, latency: Date.now() - startTime, error: 'Hostinger connection failed.' }); }
    }

    if (service === 'sqlite') {
      getSystemMetrics();
      return res.status(200).json({
        ok: true,
        latency: Date.now() - startTime,
        message: 'SQLite database WAL journal connection active and healthy.',
      });
    }

    return res.status(400).json({ error: 'Unknown service requested for connection test.' });
  } catch (err) {
    next(err);
  }
}

export async function toggleEngineHandler(req, res, next) {
  try {
    const { engine } = req.body || {};
    if (!['hunter', 'scraper'].includes(engine)) {
      return res.status(400).json({ error: 'Engine must be hunter or scraper.' });
    }
    const hunterEnabled = engine === 'hunter';
    saveHunterSetting(hunterEnabled);
    if (hunterEnabled) {
      resetHunterQuotaState();
    }
    addAuditLog({
      userEmail: req.dashboardSession?.email || 'superadmin',
      action: 'engine_switch',
      details: `Superadmin switched system discovery engine to ${hunterEnabled ? 'Hunter.io Native Discovery' : 'Google Places Scraper'}`,
      category: 'admin',
    });
    return res.status(200).json({
      success: true,
      discovery_engine: hunterEnabled ? 'hunter' : 'scraper',
      hunter_enabled: hunterEnabled,
    });
  } catch (err) {
    next(err);
  }
}

export async function getAuditLogsHandler(req, res, next) {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const logs = getAuditLogs(limit);
    return res.status(200).json({ logs });
  } catch (err) {
    next(err);
  }
}

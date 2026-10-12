import config from '../config/env.js';
import {
  loadDailyUsage,
  loadLeadsHistory,
  loadOutreachHistory,
  saveOutreachHistory,
  loadHunterSetting,
  saveHunterSetting,
  withOutreachHistoryLock,
} from '../services/storageService.js';
import { executeLeadSearch, isHunterQuotaExceeded } from '../services/leadFinderService.js';
import { generateColdEmail } from '../services/deepseekService.js';

export async function getStatus(req, res, next) {
  try {
    const { date: today, count: usedToday } = loadDailyUsage();
    const remaining = Math.max(0, config.DAILY_LEAD_LIMIT - usedToday);
    const hunterEnabled = loadHunterSetting();
    return res.status(200).json({
      date: today,
      count: usedToday,
      limit: config.DAILY_LEAD_LIMIT,
      remaining,
      has_google_key: Boolean(config.GOOGLE_API_KEY),
      has_hunter_key: Boolean(config.HUNTER_API_KEY),
      hunter_enabled: hunterEnabled,
      use_inbuilt_scraper: !hunterEnabled,
      hunter_quota_exceeded: isHunterQuotaExceeded(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getLeads(req, res, next) {
  try {
    const history = loadLeadsHistory();
    const outreachByLeadId = new Map();
    for (const record of loadOutreachHistory()) {
      if (record.leadId && !outreachByLeadId.has(record.leadId)) outreachByLeadId.set(record.leadId, record);
    }
    const leads = (history.leads || []).map((lead) => {
      const { coldMailDraft: _staleDraft, ...currentLead } = lead;
      const record = outreachByLeadId.get(lead.id);
      if (!record) return currentLead;
      return {
        ...currentLead,
        coldMailDraft: {
          id: record.id,
          subject: record.subject,
          body: record.body,
          status: record.status,
          generatedAt: record.createdAt,
          ...(record.sentAt ? { sentAt: record.sentAt } : {}),
        },
      };
    });
    const { date: today, count: usedToday } = loadDailyUsage();
    return res.status(200).json({
      all_leads: leads,
      search_history: history.searches || [],
      usage: { date: today, count: usedToday },
    });
  } catch (err) {
    next(err);
  }
}

import { jobManager } from '../services/jobManager.js';

export async function searchLeads(req, res, next) {
  try {
    const { business_type, businessType, city, country, count, requestedCount, mode, engine, discoveryEngine, sync } = req.body || {};
    const searchOptions = {
      businessType: business_type || businessType,
      city,
      country,
      requestedCount: count || requestedCount,
      mode: mode || 'live',
      engine: engine || discoveryEngine,
    };

    // If caller explicitly requested synchronous execution (e.g. CLI scripts or sync test runs)
    const isSync = sync === true || req.query.sync === 'true' || req.headers['x-sync-search'] === 'true';
    if (isSync) {
      const result = await executeLeadSearch(searchOptions);
      return res.status(200).json(result);
    }

    // Default: Asynchronous Job with real-time SSE progress streaming
    const job = jobManager.createJob('lead_search', searchOptions);

    // Detach from current request socket and execute in background
    (async () => {
      try {
        const result = await executeLeadSearch(searchOptions, (progress) => {
          jobManager.updateProgress(job.id, progress);
        });
        jobManager.completeJob(job.id, result);
      } catch (err) {
        jobManager.failJob(job.id, err);
      }
    })();

    return res.status(202).json({
      jobId: job.id,
      status: 'running',
      message: 'Lead discovery job started.',
      streamUrl: `/api/jobs/${job.id}/stream`,
      statusUrl: `/api/jobs/${job.id}`,
      total: count,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
}

export function getJobStatus(req, res) {
  const { jobId } = req.params;
  const job = jobManager.getJob(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found or expired.' });
  }
  return res.status(200).json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    logs: job.logs,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  });
}

export function streamJobProgress(req, res) {
  const { jobId } = req.params;
  const job = jobManager.getJob(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found or expired.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Send initial snapshot immediately
  res.write(`data: ${JSON.stringify({ type: 'init', status: job.status, progress: job.progress, logs: job.logs })}\n\n`);

  if (job.status === 'completed') {
    res.write(`data: ${JSON.stringify({ type: 'completed', result: job.result, progress: job.progress })}\n\n`);
    return res.end();
  }
  if (job.status === 'failed') {
    res.write(`data: ${JSON.stringify({ type: 'failed', error: job.error, progress: job.progress })}\n\n`);
    return res.end();
  }

  // Subscribe to live job updates
  const unsubscribe = jobManager.subscribe(jobId, (event) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (['completed', 'failed'].includes(event.type)) {
        res.end();
      }
    } catch {
      unsubscribe();
    }
  });

  const pingInterval = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(pingInterval);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    unsubscribe();
  });
}

export async function generateLeadColdMail(req, res, next) {
  try {
    const { leadId, email, force } = req.body || {};
    const savedLead = loadLeadsHistory().leads?.find((lead) => lead.id === leadId);
    if (!savedLead || !email || savedLead.email !== email || !['deliverable', 'valid'].includes(savedLead.emailStatus)) {
      return res.status(400).json({ error: 'A saved lead with a matching email is required.' });
    }
    const outreachHistory = loadOutreachHistory();
    const existingIdx = outreachHistory.findIndex((o) => o.leadId === leadId || (o.recipient && o.recipient === email));
    if (existingIdx >= 0 && outreachHistory[existingIdx].status === 'sent') {
      return res.status(409).json({ error: 'Outreach to this lead has already been sent.' });
    }
    if (existingIdx >= 0 && outreachHistory[existingIdx].leadId && outreachHistory[existingIdx].leadId !== leadId) {
      return res.status(409).json({ error: 'This email already belongs to another outreach draft.' });
    }

    // Idempotency: return existing draft unless explicit force:true regeneration is requested
    if (existingIdx >= 0 && !force) {
      const existingRecord = outreachHistory[existingIdx];
      return res.status(200).json({
        success: true,
        cached: true,
        draft: {
          subject: existingRecord.subject,
          body: existingRecord.body,
          model: existingRecord.model || (existingRecord.source === 'live' ? 'deepseek' : 'Local template'),
          source: existingRecord.draftSource || (existingRecord.model === 'Local template' ? 'template_fallback' : 'deepseek'),
        },
        outreachRecord: existingRecord,
      });
    }

    const leadObj = {
      id: savedLead.id,
      name: savedLead.name || 'Valued Partner',
      email: savedLead.email,
      city: savedLead.city || '',
      country: savedLead.country || '',
      businessType: savedLead.businessType || 'Spice Importer',
      address: savedLead.address || '',
    };

    // Run AI call outside the mutex lock so multiple draft requests execute concurrently in parallel
    const draft = await generateColdEmail(leadObj, { useAI: savedLead.source === 'live', force });
    const draftSource = draft.model === 'Local template' ? 'template_fallback' : 'deepseek';

    // Atomically persist to outreach history under lock
    const outreachRecord = await withOutreachHistoryLock(() => {
      const currentHistory = loadOutreachHistory();
      const currentExistingIdx = currentHistory.findIndex((o) => o.leadId === leadId || (o.recipient && o.recipient === email));
      if (currentExistingIdx >= 0 && currentHistory[currentExistingIdx].status === 'sent') {
        const err = new Error('Outreach to this lead has already been sent.');
        err.statusCode = 409;
        throw err;
      }
      const record = {
        id: currentExistingIdx >= 0 ? currentHistory[currentExistingIdx].id : `outreach-${leadObj.id}`,
        leadId: leadObj.id,
        source: savedLead?.source || 'unknown',
        leadName: leadObj.name,
        recipient: leadObj.email,
        company: leadObj.name,
        location: `${leadObj.city}, ${leadObj.country}`.replace(/^, |^ - |, $/g, ''),
        subject: draft.subject,
        body: draft.body,
        status: 'pending_review',
        draftSource,
        model: draft.model,
        createdAt: new Date().toISOString().slice(0, 10),
      };

      if (currentExistingIdx >= 0) {
        currentHistory[currentExistingIdx] = record;
      } else {
        currentHistory.unshift(record);
      }
      saveOutreachHistory(currentHistory);
      return record;
    });

    return res.status(200).json({
      success: true,
      draft: {
        ...draft,
        source: draftSource,
      },
      outreachRecord,
    });
  } catch (err) {
    next(err);
  }
}

export async function toggleHunterSetting(req, res, next) {
  try {
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean.' });
    }
    saveHunterSetting(enabled);
    const hunterEnabled = loadHunterSetting();
    return res.status(200).json({
      hunter_enabled: hunterEnabled,
      use_inbuilt_scraper: !hunterEnabled,
    });
  } catch (err) {
    next(err);
  }
}


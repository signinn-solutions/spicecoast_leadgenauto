import {tenantContext} from '../services/tenantContext.js';
import config from '../config/env.js';
import { startSearchJob, getSearchJob, recentSearchJobs } from '../services/searchJobService.js';
import { userUsage } from '../services/accessService.js';
import { loadDailyUsage, loadLeadsHistory, loadOutreachHistory, saveOutreachHistory, withOutreachHistoryLock, withStorageOperationLock, saveLeadsHistory } from '../services/storageService.js';
import { executeLeadSearch, validateSearchInput, isHunterQuotaExceeded, isHunterEnabled, verifyEmail } from '../services/leadFinderService.js';
import { generateColdEmail } from '../services/deepseekService.js';
export async function getStatus(req, res, next) {
  try {
    const {
      date: today,
      count: usedToday
    } = loadDailyUsage();
    const remaining = config.DAILY_LEAD_LIMIT === -1 ? null : Math.max(0, config.DAILY_LEAD_LIMIT - usedToday);
    return res.status(200).json({
      date: today,
      count: usedToday,
      limit: config.DAILY_LEAD_LIMIT,
      unlimited: config.DAILY_LEAD_LIMIT === -1,
      remaining,
      subscription: tenantContext()?.tenant?.subscription || null,
      has_google_key: Boolean(config.GOOGLE_API_KEY),
      has_hunter_key: Boolean(config.HUNTER_API_KEY),
      hunter_enabled: isHunterEnabled(),
      email_discovery: isHunterEnabled() ? 'website_then_hunter' : 'website',
      hunter_quota_exceeded: isHunterQuotaExceeded(),
      max_batch: 60,
      user_usage: req.dashboardSession?.user ? {
        count: userUsage(req.dashboardSession.user.id),
        limit: req.dashboardSession.user.dailyLeadLimit,
        unlimited: req.dashboardSession.user.dailyLeadLimit === -1
      } : null
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
    const leads = (history.leads || []).map(lead => {
      const {
        coldMailDraft: _staleDraft,
        ...currentLead
      } = lead;
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
          ...(record.sentAt ? {
            sentAt: record.sentAt
          } : {})
        }
      };
    });
    const {
      date: today,
      count: usedToday
    } = loadDailyUsage();
    return res.status(200).json({
      all_leads: leads,
      search_history: history.searches || [],
      usage: {
        date: today,
        count: usedToday
      }
    });
  } catch (err) {
    next(err);
  }
}
export async function searchLeads(req, res, next) {
  try {
    const body=req.body || {};
    const {
      business_type,
      city,
      country,
      count,
      mode
    } = body;
    const actor = req.dashboardSession?.user || null;
    const options = {
      businessType: business_type,
      city,
      country,
      requestedCount: count,
      mode: mode || 'live',
      actor,
      autoDraft: body.auto_draft ?? false
    };
    validateSearchInput(options);
    if (body.background === true) return res.status(202).json({
      job: startSearchJob(options, body.request_id)
    });
    const result = await executeLeadSearch(options);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        error: err.message
      });
    }
    next(err);
  }
}
export async function generateLeadColdMail(req, res, next) {
  return withOutreachHistoryLock(() => generateLeadColdMailUnlocked(req, res, next));
}
async function generateLeadColdMailUnlocked(req, res, next) {
  try {
    const {
      leadId,
      email
    } = req.body || {};
    const savedLead = loadLeadsHistory().leads?.find(lead => lead.id === leadId);
    if (!savedLead || !email || savedLead.email !== email || !['deliverable', 'valid'].includes(savedLead.emailStatus)) {
      return res.status(400).json({
        error: 'A saved lead with a matching email is required.'
      });
    }
    const outreachHistory = loadOutreachHistory();
    const existingIdx = outreachHistory.findIndex(o => o.leadId === leadId || o.recipient && o.recipient === email);
    if (existingIdx >= 0 && (outreachHistory[existingIdx].sentAt || outreachHistory[existingIdx].first_contacted_at || outreachHistory[existingIdx].status !== 'pending_review')) {
      return res.status(409).json({
        error: 'Outreach to this lead has already been sent.'
      });
    }
    if (existingIdx >= 0 && outreachHistory[existingIdx].leadId && outreachHistory[existingIdx].leadId !== leadId) {
      return res.status(409).json({
        error: 'This email already belongs to another outreach draft.'
      });
    }
    const leadObj = {
      id: savedLead.id,
      name: savedLead.name || 'Valued Partner',
      email: savedLead.email,
      city: savedLead.city || '',
      country: savedLead.country || '',
      businessType: savedLead.businessType || 'Spice Importer',
      address: savedLead.address || ''
    };
    const draft = await generateColdEmail(leadObj, {
      useAI: savedLead.source === 'live'
    });

    // Persist to outreach history
    const outreachRecord = {
      id: `outreach-${leadObj.id}`,
      leadId: leadObj.id,
      source: savedLead?.source || 'unknown',
      leadName: leadObj.name,
      recipient: leadObj.email,
      company: leadObj.name,
      location: `${leadObj.city}, ${leadObj.country}`.replace(/^, |^ - |, $/g, ''),
      subject: draft.subject,
      body: draft.body,
      status: 'pending_review',
      createdAt: new Date().toISOString().slice(0, 10)
    };
    if (existingIdx >= 0) {
      outreachHistory[existingIdx] = outreachRecord;
    } else {
      outreachHistory.unshift(outreachRecord);
    }
    saveOutreachHistory(outreachHistory);
    return res.status(200).json({
      success: true,
      draft,
      outreachRecord
    });
  } catch (err) {
    next(err);
  }
}
export function searchJobStatus(req, res) {
  const job = getSearchJob(req.params.id);
  return job ? res.json({
    job
  }) : res.status(404).json({
    error: 'Search job not found.'
  });
}
export function searchJobList(req, res) {
  return res.json({
    jobs: recentSearchJobs()
  });
}
export async function verifyLeadEmail(req, res, next) {
  try {
    return await withStorageOperationLock('lead-search', async () => {
      let history = loadLeadsHistory(),
        lead = history.leads.find(l => l.id === req.body?.leadId);
      if (!lead || lead.source !== 'live' || !lead.email?.includes('@')) return res.status(400).json({
        error: 'A saved live lead with an email is required.'
      });
      if (!isHunterEnabled()) return res.status(503).json({
        error: 'Signinn must enable Hunter and configure its key before verifying email. Published website addresses remain unverified.'
      });
      const status = await verifyEmail(lead.email);
      history = loadLeadsHistory();
      lead = history.leads.find(l => l.id === req.body.leadId);
      lead.emailStatus = ['valid', 'deliverable'].includes(status) ? 'deliverable' : ['accept_all', 'webmail', 'risky'].includes(status) ? 'risky' : status === 'invalid' ? 'invalid' : 'unknown';
      lead.emailVerification = lead.emailStatus === 'deliverable' ? {
        provider: 'hunter',
        status: 'valid',
        verifiedAt: new Date().toISOString()
      } : null;
      saveLeadsHistory(history);
      return res.json({
        lead
      });
    });
  } catch (e) {
    next(e);
  }
}

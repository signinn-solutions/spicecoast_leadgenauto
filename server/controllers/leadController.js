import config from '../config/env.js';
import { loadDailyUsage, loadLeadsHistory, saveLeadsHistory, loadOutreachHistory, saveOutreachHistory } from '../services/storageService.js';
import { executeLeadSearch } from '../services/leadFinderService.js';
import { generateColdEmail } from '../services/deepseekService.js';

export async function getStatus(req, res, next) {
  try {
    const { date: today, count: usedToday } = loadDailyUsage();
    const remaining = Math.max(0, config.DAILY_LEAD_LIMIT - usedToday);
    return res.status(200).json({
      date: today,
      count: usedToday,
      limit: config.DAILY_LEAD_LIMIT,
      remaining,
      has_google_key: Boolean(config.GOOGLE_API_KEY),
      has_hunter_key: Boolean(config.HUNTER_API_KEY),
    });
  } catch (err) {
    next(err);
  }
}

export async function getLeads(req, res, next) {
  try {
    const history = loadLeadsHistory();
    const { date: today, count: usedToday } = loadDailyUsage();
    return res.status(200).json({
      all_leads: history.leads || [],
      search_history: history.searches || [],
      usage: { date: today, count: usedToday },
    });
  } catch (err) {
    next(err);
  }
}

export async function searchLeads(req, res, next) {
  try {
    const { business_type, city, country, count, mode } = req.body || {};
    const result = await executeLeadSearch({
      businessType: business_type,
      city,
      country,
      requestedCount: count,
      mode: mode || 'auto',
    });
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
}

export async function generateLeadColdMail(req, res, next) {
  try {
    const { leadId, email } = req.body || {};
    const savedLead = loadLeadsHistory().leads?.find((lead) => lead.id === leadId);
    if (!savedLead || !email || savedLead.email !== email || !['deliverable', 'valid'].includes(savedLead.emailStatus)) {
      return res.status(400).json({ error: 'A saved lead with a matching email is required.' });
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

    const draft = await generateColdEmail(leadObj, { useAI: savedLead.source === 'live' });

    // Persist to outreach history
    const outreachHistory = loadOutreachHistory();
    const existingIdx = outreachHistory.findIndex((o) => o.leadId === leadId || (o.recipient && o.recipient === email));
    if (existingIdx >= 0 && outreachHistory[existingIdx].status === 'sent') {
      return res.status(409).json({ error: 'Outreach to this lead has already been sent.' });
    }
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
      createdAt: new Date().toISOString().slice(0, 10),
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
      outreachRecord,
    });
  } catch (err) {
    next(err);
  }
}

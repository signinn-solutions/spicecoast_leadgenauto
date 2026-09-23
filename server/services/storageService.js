import fs from 'fs';
import path from 'path';
import config from '../config/env.js';

export function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function loadDailyUsage(usageFile = config.DAILY_USAGE_FILE) {
  const today = getTodayDateString();
  if (fs.existsSync(usageFile)) {
    try {
      const raw = fs.readFileSync(usageFile, 'utf-8');
      const data = JSON.parse(raw);
      if (data && data.date === today) {
        return { date: today, count: parseInt(data.count, 10) || 0 };
      }
    } catch (e) {
      return { date: today, count: 0 };
    }
  }
  return { date: today, count: 0 };
}

export function saveDailyUsage(today, count, usageFile = config.DAILY_USAGE_FILE) {
  try {
    fs.writeFileSync(usageFile, JSON.stringify({ date: today, count }, null, 2), 'utf-8');
  } catch (e) {
    console.warn(`[Storage Warning] Could not save daily usage to ${usageFile}: ${e.message}`);
  }
}

export function loadReplyUsage(replyUsageFile = config.REPLY_USAGE_FILE) {
  const today = getTodayDateString();
  if (fs.existsSync(replyUsageFile)) {
    try {
      const raw = fs.readFileSync(replyUsageFile, 'utf-8');
      const data = JSON.parse(raw);
      if (data && data.date === today) {
        return { date: today, count: parseInt(data.count, 10) || 0 };
      }
    } catch (e) {
      return { date: today, count: 0 };
    }
  }
  return { date: today, count: 0 };
}

export function saveReplyUsage(today, count, replyUsageFile = config.REPLY_USAGE_FILE) {
  try {
    fs.writeFileSync(replyUsageFile, JSON.stringify({ date: today, count }, null, 2), 'utf-8');
  } catch (e) {
    console.warn(`[Storage Warning] Could not save reply usage to ${replyUsageFile}: ${e.message}`);
  }
}

export function loadLeadsHistory(historyFile = config.LEADS_HISTORY_FILE) {
  if (fs.existsSync(historyFile)) {
    try {
      const raw = fs.readFileSync(historyFile, 'utf-8');
      const data = JSON.parse(raw);
      return {
        leads: Array.isArray(data.leads) ? data.leads : [],
        searches: Array.isArray(data.searches) ? data.searches : [],
      };
    } catch (e) {
      return { leads: [], searches: [] };
    }
  }
  return { leads: [], searches: [] };
}

export function saveLeadsHistory(data, historyFile = config.LEADS_HISTORY_FILE) {
  try {
    fs.writeFileSync(historyFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn(`[Storage Warning] Could not save leads history: ${e.message}`);
  }
}

export function loadSeenPlaces(seenFile = config.SEEN_PLACES_FILE) {
  const seenMap = {};

  // 1. Read seen_places.json
  if (fs.existsSync(seenFile)) {
    try {
      const raw = fs.readFileSync(seenFile, 'utf-8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        const entries = data.places || data;
        for (const [id, details] of Object.entries(entries)) {
          if (details && typeof details === 'object') {
            seenMap[id] = details;
          }
        }
      }
    } catch (e) {
      console.warn(`[Storage Warning] Could not read seen places: ${e.message}`);
    }
  }

  // 2. Read leads_history.json and index all past leads into seenMap
  const history = loadLeadsHistory();
  if (history && Array.isArray(history.leads)) {
    for (const lead of history.leads) {
      if (lead && lead.name) {
        let domain = null;
        if (lead.website) {
          try {
            const parsed = new URL(lead.website.startsWith('http') ? lead.website : `https://${lead.website}`);
            domain = (parsed.hostname || parsed.host || lead.website).split(':')[0].replace(/^www\./i, '').trim();
          } catch (e) {
            domain = lead.website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].split(':')[0].trim() || null;
          }
        }

        const leadId = lead.id || `hist-${lead.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        if (!seenMap[leadId]) {
          seenMap[leadId] = {
            id: leadId,
            name: lead.name,
            address: lead.address || '',
            phone: lead.phone || '',
            website: lead.website || '',
            domain: domain,
            email: lead.email || '',
            emailStatus: lead.emailStatus || 'unknown',
            foundAt: lead.foundAt || getTodayDateString(),
          };
        }
      }
    }
  }

  return seenMap;
}

export function saveSeenPlaces(seenMap, seenFile = config.SEEN_PLACES_FILE) {
  try {
    fs.writeFileSync(seenFile, JSON.stringify(seenMap, null, 2), 'utf-8');
  } catch (e) {
    console.warn(`[Storage Warning] Could not save seen places: ${e.message}`);
  }
}

export function loadMailboxHistory(mailboxFile = config.MAILBOX_HISTORY_FILE) {
  if (fs.existsSync(mailboxFile)) {
    try {
      const raw = fs.readFileSync(mailboxFile, 'utf-8');
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

export function saveMailboxHistory(messages, mailboxFile = config.MAILBOX_HISTORY_FILE) {
  try {
    const trimmed = (Array.isArray(messages) ? messages : []).slice(0, 150);
    fs.writeFileSync(mailboxFile, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (e) {
    console.warn(`[Storage Warning] Could not save mailbox history: ${e.message}`);
  }
}

export function loadOutreachHistory(outreachFile = config.OUTREACH_HISTORY_FILE) {
  if (fs.existsSync(outreachFile)) {
    try {
      const raw = fs.readFileSync(outreachFile, 'utf-8');
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

export function saveOutreachHistory(outreachList, outreachFile = config.OUTREACH_HISTORY_FILE) {
  try {
    const trimmed = (Array.isArray(outreachList) ? outreachList : []).slice(0, 200);
    fs.writeFileSync(outreachFile, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (e) {
    console.warn(`[Storage Warning] Could not save outreach history: ${e.message}`);
  }
}

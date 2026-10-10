import config from '../config/env.js';
import { LIFECYCLE_CONFIG } from '../config/mailLifecycleConfig.js';
import { loadOutreachHistory, saveOutreachHistory, loadMailboxHistory, saveMailboxHistory, loadLeadsHistory, withOutreachHistoryLock, withMailboxHistoryLock } from './storageService.js';
import { computeLeadEngagementScore } from './lifecycleScoringService.js';

/**
 * Parses timestamp string or number into Date.
 */
function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Calculates whole days elapsed between a past date and now.
 */
function daysElapsed(pastDate, now = new Date()) {
  const past = parseDate(pastDate);
  if (!past) return 0;
  const diffMs = now.getTime() - past.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Generates an intelligent B2B Spice follow-up email draft.
 */
export function generateFollowUpDraft(lead, turn = 1) {
  const company = lead.company || lead.leadName || 'your team';
  const name = lead.leadName || 'Valued Partner';
  if(config.TENANT_ID && config.TENANT_ID!=='spicecoast') return {
    id:'draft-followup-'+turn+'-'+(lead.id || lead.leadId),turn,
    subject:turn===1?(String(lead.subject || 'Business introduction').startsWith('Re:')?lead.subject:'Re: '+(lead.subject || 'Business introduction')):'Final follow-up: '+config.TENANT_NAME,
    body:'Hello '+name+',\n\n'+(turn===1?'Following up on our earlier introduction. Would you be interested in continuing the conversation?':'Checking in one final time. If the timing is not right, no problem; we will close this conversation for now.')+'\n\nRegards,\n'+config.TENANT_NAME+' Team\n'+config.SENDER_MAILBOX,generatedAt:new Date().toISOString()
  };

  if (turn === 1) {
    const originalSubject = lead.subject || 'Direct Origin Spices Partnership';
    const subject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`;
    const body = `Dear ${name},

Following up on our earlier note regarding export-grade direct origin spices from Kerala, India.

We can discuss current availability and specifications for Malabar Black Pepper (Garbled 550GL), Alleppey Green Cardamom (8mm Extra Bold), and High-Curcumin Alleppey Turmeric.

Would you like our export team to prepare product specifications and pricing for ${company}'s review?

Warm regards,
The SpiceCoast Export Team
The Spice Coast | Cochin, Kerala, India
${config.SENDER_MAILBOX}`;
    return {
      id: `draft-followup-1-${lead.id || lead.leadId}`,
      turn: 1,
      subject,
      body,
      generatedAt: new Date().toISOString()
    };
  }

  // Turn 2 (Final Follow-up before auto-close)
  const subject = `Final follow-up: Direct Origin Spices for ${company}`;
  const body = `Dear ${name},

I am checking in one final time regarding direct origin spice procurement for ${company}.

If you already have established seasonal contracts in place, no problem at all. If your import needs open up later in the season, feel free to keep our direct origin specification sheet on file.

Best regards,
The SpiceCoast Export Team
The Spice Coast | Cochin, Kerala, India
${config.SENDER_MAILBOX}`;
  return {
    id: `draft-followup-2-${lead.id || lead.leadId}`,
    turn: 2,
    subject,
    body,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Formats a Date object as YYYY-MM-DD string.
 */
function formatDateString(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Runs the lifecycle evaluation engine across all contacted leads and inbound inquiries.
 * Synchronizes lifecycle statuses, evaluates follow-up timers, scores hot leads,
 * and compiles the 4 dashboard views + analytics summary.
 */
export async function runLifecycleCheck({persist=true}={}) {
  return withMailboxHistoryLock(() => withOutreachHistoryLock(()=>runLifecycleCheckUnlocked(persist)));
}
async function runLifecycleCheckUnlocked(persist) {
  const outreachList = loadOutreachHistory();
  const mailboxMessages = loadMailboxHistory();
  const leadsHistory = loadLeadsHistory();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Index inbound messages by normalized sender email
  const inboundBySender = new Map();
  for (const msg of mailboxMessages.filter(m => m.source !== 'simulated' && !['ignored', 'suppressed'].includes(m.status))) {
    const senderKey = (msg.sender || '').trim().toLowerCase();
    if (!senderKey) continue;
    if (!inboundBySender.has(senderKey)) {
      inboundBySender.set(senderKey, []);
    }
    inboundBySender.get(senderKey).push(msg);
  }

  // Process all outreach items that have been sent or drafted
  let outreachChanged = false;
  const processedLeads = [];
  const processedEmails = new Set();
  for (const record of outreachList) {
    const recipientKey = (record.recipient || '').trim().toLowerCase();
    if (recipientKey) processedEmails.add(recipientKey);

    // Initial values for timestamps if record was marked 'sent' but lacks explicit lifecycle timestamps
    if (record.status === 'sent' || record.sentAt) {
      if (!record.first_contacted_at) {
        record.first_contacted_at = record.sentAt || record.createdAt || formatDateString(now);
        outreachChanged = true;
      }
      if (!record.last_contacted_at) {
        record.last_contacted_at = record.sentAt || record.first_contacted_at;
        outreachChanged = true;
      }
      if (typeof record.follow_up_count !== 'number') {
        record.follow_up_count = 0;
        outreachChanged = true;
      }
    }
    const inboundsForLead = recipientKey ? inboundBySender.get(recipientKey) || [] : [];
    const outboundsForLead = [{
      type: 'initial_outreach',
      subject: record.subject,
      body: record.body,
      sentAt: record.sentAt || record.first_contacted_at
    }, ...(Array.isArray(record.sent_followups) ? record.sent_followups : [])];

    // Calculate score
    const scoreResult = await computeLeadEngagementScore(record, inboundsForLead, outboundsForLead);

    // Only process lifecycle transitions if the initial cold mail was actually sent
    if (record.source !== 'simulated' && record.status !== 'pending_review' && record.first_contacted_at) {
      const daysSinceFirst = daysElapsed(record.first_contacted_at, now);
      const daysSinceLast = daysElapsed(record.last_contacted_at, now);
      let nextStatus = record.status;
      let nextFollowUpDate = null;
      if (inboundsForLead.length > 0) {
        // Lead has replied!
        if (scoreResult.isHot) {
          nextStatus = 'hot';
        } else {
          nextStatus = 'replied';
        }
      } else {
        // Zero replies: follow-up timing and auto-close logic
        if (record.status === 'closed_no_response' && !record.manually_reopened) {
          nextStatus = 'closed_no_response';
        } else if (daysSinceFirst >= LIFECYCLE_CONFIG.AUTO_CLOSE_DAYS) {
          // 14 days total elapsed since first_contacted_at with zero replies
          nextStatus = 'closed_no_response';
        } else if (record.follow_up_count === 0) {
          // Initial send, waiting for follow-up 1
          if (daysSinceFirst >= LIFECYCLE_CONFIG.FIRST_FOLLOW_UP_DAYS) {
            nextStatus = 'follow_up_due';
            if (!record.follow_up_draft || record.follow_up_draft.turn !== 1) {
              record.follow_up_draft = generateFollowUpDraft(record, 1);
              outreachChanged = true;
            }
          } else {
            nextStatus = 'sent';
            const dueTime = new Date(parseDate(record.first_contacted_at).getTime() + LIFECYCLE_CONFIG.FIRST_FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000);
            nextFollowUpDate = formatDateString(dueTime);
          }
        } else if (record.follow_up_count === 1) {
          // First follow-up sent, waiting 7 days for follow-up 2
          if (daysSinceLast >= LIFECYCLE_CONFIG.SECOND_FOLLOW_UP_DAYS) {
            nextStatus = 'follow_up_due';
            if (!record.follow_up_draft || record.follow_up_draft.turn !== 2) {
              record.follow_up_draft = generateFollowUpDraft(record, 2);
              outreachChanged = true;
            }
          } else {
            nextStatus = 'followed_up';
            const dueTime = new Date(parseDate(record.last_contacted_at).getTime() + LIFECYCLE_CONFIG.SECOND_FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000);
            nextFollowUpDate = formatDateString(dueTime);
          }
        } else {
          // 2 follow-ups sent, awaiting auto-close at 14 days total
          nextStatus = 'followed_up';
        }
      }
      if (record.status !== nextStatus) {
        record.status = nextStatus;
        outreachChanged = true;
      }
      record.days_since_first_contact = daysSinceFirst;
      record.days_since_last_contact = daysSinceLast;
      record.next_follow_up_date = nextFollowUpDate;
      record.score_result = scoreResult;
      record.inbound_messages = inboundsForLead;
      record.outbound_messages = outboundsForLead;
      processedLeads.push(record);
    }
  }

  // Also include organic inbound inquiries that did not originate from a cold outreach draft
  for (const msg of mailboxMessages.filter(m => m.source !== 'simulated' && !['ignored', 'suppressed'].includes(m.status))) {
    const senderKey = (msg.sender || '').trim().toLowerCase();
    if (!senderKey || processedEmails.has(senderKey)) continue;

    // Direct inbound inquiry lead
    const scoreResult = await computeLeadEngagementScore({
      directInbound: true,
      company: msg.metadata?.buyerCompany || msg.senderName || senderKey.split('@')[0]
    }, [msg], []);
    const syntheticStatus = scoreResult.isHot ? 'hot' : 'replied';
    const directLead = {
      id: `inbound-${msg.id}`,
      leadId: null,
      source: msg.source || 'webhook',
      leadName: msg.metadata?.buyerName || msg.senderName || senderKey.split('@')[0],
      recipient: msg.sender,
      company: msg.metadata?.buyerCompany || msg.senderName || senderKey.split('@')[0],
      location: msg.metadata?.destinationPort || 'Direct Inbound',
      subject: msg.subject,
      body: msg.body,
      status: syntheticStatus,
      first_contacted_at: msg.receivedAt,
      last_contacted_at: msg.receivedAt,
      follow_up_count: 0,
      days_since_first_contact: daysElapsed(msg.receivedAt, now),
      days_since_last_contact: daysElapsed(msg.receivedAt, now),
      next_follow_up_date: null,
      score_result: scoreResult,
      inbound_messages: [msg],
      outbound_messages: [],
      directInboundMessage: msg
    };
    processedEmails.add(senderKey);
    processedLeads.push(directLead);
  }
  if (outreachChanged && persist) {
    saveOutreachHistory(outreachList);
  }
  if(persist) saveMailboxHistory(mailboxMessages);

  // Segment leads into the four tabs
  const sentLeads = processedLeads.filter(l => l.status === 'sent' || l.status === 'followed_up');
  const repliedLeads = processedLeads.filter(l => l.status === 'replied');
  const followUpQueue = processedLeads.filter(l => l.status === 'follow_up_due');

  // Hot Leads: sorted highest-score first
  const hotLeads = processedLeads.filter(l => l.status === 'hot').sort((a, b) => (b.score_result?.score || 0) - (a.score_result?.score || 0));
  const closedLeads = processedLeads.filter(l => l.status === 'closed_no_response');

  // Compute analytics summary
  // 1. Total sent this week
  let totalSentThisWeek = 0;
  for (const lead of processedLeads.filter(l => !l.directInboundMessage)) {
    if (lead.first_contacted_at && new Date(lead.first_contacted_at) >= sevenDaysAgo) {
      totalSentThisWeek += 1;
    }
    if (Array.isArray(lead.sent_followups)) {
      for (const fu of lead.sent_followups) {
        if (fu.sentAt && new Date(fu.sentAt) >= sevenDaysAgo) {
          totalSentThisWeek += 1;
        }
      }
    }
  }

  // 2. Reply rate %
  const contacted = processedLeads.filter(l => !l.directInboundMessage);
  const totalContacted = contacted.length;
  const totalRepliedOrHot = contacted.filter(l => ['replied', 'hot'].includes(l.status)).length;
  const replyRatePercent = totalContacted > 0 ? Math.round(totalRepliedOrHot / totalContacted * 100) : 0;
  return {
    analytics: {
      totalSentThisWeek,
      replyRatePercent,
      hotLeadsCount: hotLeads.length,
      followUpDueCount: followUpQueue.length,
      closedNoResponseCount: closedLeads.length,
      totalContacted
    },
    tabs: {
      sent: sentLeads,
      replied: repliedLeads,
      followUpQueue,
      hotLeads,
      closed: closedLeads
    },
    config: LIFECYCLE_CONFIG
  };
}

/**
 * Dispatches an approved follow-up email, updates lead tracking,
 * and moves status to "followed_up".
 */
export async function dispatchFollowUpEmail(leadId, {
  actor,
  subject,
  body,
  to
}) {
  return withOutreachHistoryLock(async () => {
    const outreachList = loadOutreachHistory();
    const item = outreachList.find(o => o.id === leadId || o.leadId && `outreach-${o.leadId}` === leadId || o.leadId === leadId);
    if (!item) {
      throw new Error('Outreach record not found for follow-up.');
    }
    if (item.status !== 'follow_up_due') {
      throw new Error(`Lead is in "${item.status}" status, not "follow_up_due".`);
    }
    if (to !== undefined && (typeof to !== 'string' || to !== item.recipient)) throw new Error('Recipient does not match saved follow-up.');
    const savedLead = loadLeadsHistory().leads.find(l => l.id === item.leadId);
    if (item.source === 'simulated' || !savedLead || savedLead.source !== 'live' || savedLead.email !== item.recipient || !['deliverable', 'valid'].includes(savedLead.emailStatus)) throw new Error('A saved, verified live lead is required for follow-up.');
    const recipient = item.recipient;
    const finalSubject = subject ?? item.follow_up_draft?.subject;
    const finalBody = body ?? item.follow_up_draft?.body;
    if (!recipient) {
      throw new Error('Missing recipient email for follow-up.');
    }
    const {
      sendEmail
    } = await import('./mailService.js');
    const sendResult = await sendEmail(recipient, finalSubject, finalBody, {
      reply: true,
      actor,
      dispatchKey: 'followup:' + item.id + ':' + (item.follow_up_count + 1)
    });
    if (sendResult?.status === 'simulated') {
      throw new Error('Email transport is not configured. Message was not sent.');
    }
    const sentDate = new Date().toISOString();

    // Update timestamps and lifecycle state
    item.status = 'followed_up';
    item.last_contacted_at = sentDate;
    item.follow_up_count = (item.follow_up_count || 0) + 1;
    item.follow_up_draft = null; // Cleared once sent

    if (!Array.isArray(item.sent_followups)) {
      item.sent_followups = [];
    }
    item.sent_followups.push({
      turn: item.follow_up_count,
      subject: finalSubject,
      body: finalBody,
      sentAt: sentDate
    });
    saveOutreachHistory(outreachList);
    return {
      success: true,
      status: 'followed_up',
      leadId: item.id,
      sentAt: sentDate,
      turn: item.follow_up_count,
      result: sendResult
    };
  });
}

/**
 * Manually reopens a closed lead, resetting automated follow-up protection.
 */
export async function reopenClosedLead(leadId) {
  return withOutreachHistoryLock(async () => {
    const outreachList = loadOutreachHistory();
    const item = outreachList.find(o => o.id === leadId || o.leadId && `outreach-${o.leadId}` === leadId || o.leadId === leadId);
    if (!item) {
      throw new Error('Outreach record not found.');
    }
    const nowStr = new Date().toISOString();
    item.status = 'follow_up_due';
    item.last_contacted_at = nowStr;
    item.manually_reopened = true;
    item.follow_up_draft = generateFollowUpDraft(item, (item.follow_up_count || 0) + 1);
    saveOutreachHistory(outreachList);
    return {
      success: true,
      lead: item
    };
  });
}

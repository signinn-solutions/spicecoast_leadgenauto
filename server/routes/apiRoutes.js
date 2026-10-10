import express from 'express';
import { requirePermission } from '../middleware/dashboardAuth.js';
import { getStatus, getLeads, searchLeads, generateLeadColdMail, searchJobStatus, searchJobList, verifyLeadEmail } from '../controllers/leadController.js';
import { draftMailboxReply, getMailboxStatus, getMailboxMessages, getOutreachList, updateColdMailDraft, sendColdMail, testIncomingEmail, sendReviewedDraft, toggleAutosend, handleWebhook, getMailLifecycle, sendFollowUpDraft, updateFollowUpDraft, reopenLead } from '../controllers/mailboxController.js';
const router = express.Router();

// Lead discovery & verification endpoints
router.get('/status', getStatus);
router.get('/leads', getLeads);
router.get('/search/jobs', searchJobList);
router.get('/search/jobs/:id', searchJobStatus);
router.post('/search', requirePermission('discover'), searchLeads);
router.post('/leads/verify-email', requirePermission('draft'), verifyLeadEmail);
router.post('/mailbox/draft-reply', requirePermission('draft'), draftMailboxReply);
router.post('/leads/generate-coldmail', requirePermission('draft'), generateLeadColdMail);

// Mailbox, AI autoresponder & Cold Outreach endpoints
router.get('/mailbox/status', getMailboxStatus);
router.get('/mailbox/messages', getMailboxMessages);
router.get('/mailbox/outreach', getOutreachList);
router.get('/mailbox/lifecycle', getMailLifecycle);
router.post('/mailbox/update-draft', requirePermission('draft'), updateColdMailDraft);
router.post('/mailbox/send-coldmail', requirePermission('send'), sendColdMail);
router.post('/mailbox/test-incoming', requirePermission('draft'), testIncomingEmail);
router.post('/mailbox/send-draft', requirePermission('send'), sendReviewedDraft);
router.post('/mailbox/send-followup', requirePermission('send'), sendFollowUpDraft);
router.post('/mailbox/update-followup-draft', requirePermission('draft'), updateFollowUpDraft);
router.post('/mailbox/reopen-lead', requirePermission('draft'), reopenLead);
router.post('/mailbox/toggle-autosend', requirePermission('automation'), toggleAutosend);

// Webhook alternative path under /api/webhook
router.post('/webhook', requirePermission('draft'), handleWebhook);
export default router;

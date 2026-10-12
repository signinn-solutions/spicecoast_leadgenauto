import express from 'express';
import { requireSuperadmin } from '../middleware/dashboardAuth.js';
import {
  getStatus,
  getLeads,
  searchLeads,
  getJobStatus,
  streamJobProgress,
  generateLeadColdMail,
  toggleHunterSetting,
} from '../controllers/leadController.js';
import {
  getMailboxStatus,
  getMailboxMessages,
  getOutreachList,
  updateColdMailDraft,
  sendColdMail,
  testIncomingEmail,
  sendReviewedDraft,
  toggleAutosend,
  handleWebhook,
  getMailLifecycle,
  sendFollowUpDraft,
  updateFollowUpDraft,
  reopenLead,
} from '../controllers/mailboxController.js';

const router = express.Router();

// Lead discovery & verification endpoints
router.get('/status', getStatus);
router.get('/leads', getLeads);
router.post('/search', searchLeads);
router.get('/jobs/:jobId', getJobStatus);
router.get('/jobs/:jobId/stream', streamJobProgress);
router.post('/leads/generate-coldmail', generateLeadColdMail);
router.post('/settings/toggle-hunter', requireSuperadmin, toggleHunterSetting);
router.post('/leads/toggle-hunter', requireSuperadmin, toggleHunterSetting);

// Mailbox, AI autoresponder & Cold Outreach endpoints
router.get('/mailbox/status', getMailboxStatus);
router.get('/mailbox/messages', getMailboxMessages);
router.get('/mailbox/outreach', getOutreachList);
router.get('/mailbox/lifecycle', getMailLifecycle);
router.post('/mailbox/update-draft', updateColdMailDraft);
router.post('/mailbox/send-coldmail', sendColdMail);
router.post('/mailbox/test-incoming', testIncomingEmail);
router.post('/mailbox/send-draft', sendReviewedDraft);
router.post('/mailbox/send-followup', sendFollowUpDraft);
router.post('/mailbox/update-followup-draft', updateFollowUpDraft);
router.post('/mailbox/reopen-lead', reopenLead);
router.post('/mailbox/toggle-autosend', toggleAutosend);

// Webhook alternative path under /api/webhook
router.post('/webhook', handleWebhook);

export default router;

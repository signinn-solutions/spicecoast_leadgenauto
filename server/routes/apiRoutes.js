import express from 'express';
import { getStatus, getLeads, searchLeads, generateLeadColdMail } from '../controllers/leadController.js';
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
} from '../controllers/mailboxController.js';

const router = express.Router();

// Lead discovery & verification endpoints
router.get('/status', getStatus);
router.get('/leads', getLeads);
router.post('/search', searchLeads);
router.post('/leads/generate-coldmail', generateLeadColdMail);

// Mailbox, AI autoresponder & Cold Outreach endpoints
router.get('/mailbox/status', getMailboxStatus);
router.get('/mailbox/messages', getMailboxMessages);
router.get('/mailbox/outreach', getOutreachList);
router.post('/mailbox/update-draft', updateColdMailDraft);
router.post('/mailbox/send-coldmail', sendColdMail);
router.post('/mailbox/test-incoming', testIncomingEmail);
router.post('/mailbox/send-draft', sendReviewedDraft);
router.post('/mailbox/toggle-autosend', toggleAutosend);

// Webhook alternative path under /api/webhook
router.post('/webhook', handleWebhook);

export default router;

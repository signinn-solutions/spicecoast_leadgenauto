import express from 'express';
import { handleWebhook } from '../controllers/mailboxController.js';
const router = express.Router();
router.get('/webhook', (req, res) => res.json({ status: 'ok', method: 'POST' }));
router.post('/webhook', handleWebhook);
export default router;

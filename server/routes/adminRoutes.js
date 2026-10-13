import express from 'express';
import { requireDashboardAuth, requireSuperadmin } from '../middleware/dashboardAuth.js';
import {
  listUsersHandler,
  resetDataHandler,
  createUserHandler,
  updateUserHandler,
  deleteUserHandler,
  getSystemHealthHandler,
  resetHunterQuotaHandler,
  resetDailyUsageHandler,
  testConnectionHandler,
  toggleEngineHandler,
  getAuditLogsHandler,
} from '../controllers/adminController.js';

const router = express.Router();

// Require authenticated session and Superadmin role for all /api/admin/* endpoints
router.use(requireDashboardAuth, requireSuperadmin);

// User Access Management
router.get('/users', listUsersHandler);
router.post('/users', createUserHandler);
router.put('/users/:id', updateUserHandler);
router.delete('/users/:id', deleteUserHandler);

// System Health & Monitoring
router.get('/system/health', getSystemHealthHandler);
router.post('/system/reset-data', resetDataHandler);
router.post('/system/engine', toggleEngineHandler);
router.post('/system/reset-hunter-quota', resetHunterQuotaHandler);
router.post('/system/reset-daily-usage', resetDailyUsageHandler);
router.post('/system/test-connection', testConnectionHandler);

// Audit & Security Logs
router.get('/audit-logs', getAuditLogsHandler);

export default router;

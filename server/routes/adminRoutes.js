import express from 'express';
import {toggleAutosend,getMailboxStatus} from '../controllers/mailboxController.js';
import {tenantContext} from '../services/tenantContext.js';
import { requirePermission } from '../middleware/dashboardAuth.js';
import { listUsers, createUser, updateUser, issueSetup, findUser, audit, auditList, userUsage } from '../services/accessService.js';
import { providerSettings, saveProviderSettings, checkProvider } from '../services/integrationService.js';
import { deliveryList, reconcileDelivery, listSuppressions, suppressRecipient } from '../services/deliveryService.js';
const router = express.Router();
router.use(requirePermission('platform'));
router.use((req,res,next)=>{
 const tenantId=tenantContext()?.tenant?.id;
 if(!tenantId) return res.status(403).json({error:'Select a tenant from the platform control panel.'});
 if(req.body?.role==='super_admin' || req.body?.tenantId && req.body.tenantId!==tenantId) return res.status(403).json({error:'Tenant accounts cannot become platform administrators or change tenants.'});
 next();
});
router.param('id',(req,res,next,id)=>{
 // Only account endpoints use this parameter; delivery IDs belong to the scoped tenant database.
 if(!req.path.startsWith('/users/')) return next();
 const user=findUser(id);
 if(!user || user.tenant_id!==tenantContext()?.tenant?.id) return res.status(404).json({error:'Account not found.'});
 next();
});
router.get('/users', (req, res) => res.json({
  users: listUsers().map(u => ({
    ...u,
    usedToday: userUsage(u.id)
  }))
}));
router.post('/users', (req, res, next) => {
  try {
    res.status(201).json(createUser(req.body, req.dashboardSession.user.id));
  } catch (e) {
    next(e);
  }
});
router.patch('/users/:id', (req, res, next) => {
  try {
    res.json({
      user: updateUser(req.params.id, req.body, req.dashboardSession.user.id)
    });
  } catch (e) {
    next(e);
  }
});
router.post('/users/:id/setup', (req, res, next) => {
  try {
    if (!findUser(req.params.id)) return res.status(404).json({
      error: 'Account not found.'
    });
    res.json({
      setup: issueSetup(req.params.id, req.dashboardSession.user.id)
    });
  } catch (e) {
    next(e);
  }
});
router.post('/users/:id/revoke', (req, res, next) => {
  try {
    const user = findUser(req.params.id);
    if (!user) return res.status(404).json({
      error: 'Account not found.'
    });
    res.json({
      user: updateUser(user.id, {}, req.dashboardSession.user.id)
    });
  } catch (e) {
    next(e);
  }
});
router.get('/automation',getMailboxStatus);
router.post('/automation',toggleAutosend);
router.get('/integrations', (req, res) => res.json(providerSettings()));
router.put('/integrations', async (req, res, next) => {
  try {
    res.json(await saveProviderSettings(req.body, req.dashboardSession.user.id));
  } catch (e) {
    next(e);
  }
});
router.post('/integrations/check', async (req, res, next) => {
  try {
    const result = await checkProvider(req.body?.provider);
    audit(req.dashboardSession.user.id, 'integrations.checked', req.body?.provider, {
      ok: result.ok
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});
router.get('/audit', (req, res) => res.json({
  events: auditList()
}));
router.get('/deliveries', (req, res) => res.json({
  deliveries: deliveryList(),
  suppressions: listSuppressions()
}));
router.post('/deliveries/:id/reconcile', async (req, res, next) => {
  try {
    res.json({
      delivery: await reconcileDelivery(req.params.id, req.body?.accepted, req.dashboardSession.user.id)
    });
  } catch (e) {
    next(e);
  }
});
router.post('/suppressions', (req, res, next) => {
  try {
    const email = req.body?.email;
    if (typeof email !== 'string' || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) return res.status(400).json({
      error: 'Enter an email address.'
    });
    suppressRecipient(email);
    audit(req.dashboardSession.user.id, 'mail.suppressed', email);
    res.json({
      success: true
    });
  } catch (e) {
    next(e);
  }
});
export default router;

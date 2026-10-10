import express from 'express';
import { requirePermission } from '../middleware/dashboardAuth.js';
import { listTenants, findTenant, createTenant, updateTenant, runInTenant, tenantSummary } from '../services/tenantService.js';
import { listUsers, createUser, validateAccountInput, findUserByEmail, updateUser, issueSetup, findUser, audit, auditList, accessDatabase } from '../services/accessService.js';
import { listPlans, savePlan } from '../services/planService.js';
import { saveSubscription, subscriptionEvents } from '../services/tenantService.js';
import adminRoutes from './adminRoutes.js';
const router = express.Router();
router.use(requirePermission('platform'));
router.get('/plans', (req, res) => res.json({
  plans: listPlans()
}));
router.post('/plans', (req, res, next) => {
  try {
    const plan = savePlan(null, req.body);
    audit(req.dashboardSession.user.id, 'plan.created', plan.id, plan);
    res.status(201).json({
      plan
    });
  } catch (e) {
    next(e);
  }
});
router.patch('/plans/:planId', (req, res, next) => {
  try {
    const plan = savePlan(req.params.planId, req.body);
    audit(req.dashboardSession.user.id, 'plan.updated', plan.id, plan);
    res.json({
      plan
    });
  } catch (e) {
    next(e);
  }
});
router.get('/tenants/:tenantId/subscription', (req, res, next) => {
  try {
    const tenant = findTenant(req.params.tenantId);
    if (!tenant) return res.status(404).json({
      error: 'Tenant not found.'
    });
    res.json({
      subscription: tenantSummary(tenant.id).subscription,
      events: subscriptionEvents(tenant.id)
    });
  } catch (e) {
    next(e);
  }
});
router.put('/tenants/:tenantId/subscription', (req, res, next) => {
  try {
    const tenant = saveSubscription(req.params.tenantId, req.body, req.dashboardSession.user.id);
    audit(req.dashboardSession.user.id, 'subscription.updated', tenant.id, {
      status: tenant.subscription.status,
      plan: tenant.subscription.plan.id,
      endsAt: tenant.subscription.endsAt
    });
    res.json({
      tenant
    });
  } catch (e) {
    next(e);
  }
});
router.get('/overview', (req, res, next) => {
  try {
    const users = listUsers();
    const tenants = listTenants().map(t => ({
      ...tenantSummary(t.id),
      users: users.filter(u => u.tenantId === t.id).length
    }));
    res.json({
      tenants,
      platformAdmins: users.filter(u => u.role === 'super_admin').length,
      events: auditList()
    });
  } catch (e) {
    next(e);
  }
});
router.post('/tenants', (req, res, next) => {
  try {
    const actor = req.dashboardSession.user.id;
    req.body = req.body || {};
    validateAccountInput({
      name: req.body.ownerName,
      email: req.body.ownerEmail,
      role: 'company_admin'
    });
    if (findUserByEmail(req.body.ownerEmail.trim().toLowerCase())) return res.status(409).json({
      error: 'An account with that email already exists.'
    });
    const result = accessDatabase().transaction(() => {
      const tenant = createTenant(req.body);
      const owner = runInTenant(tenant.id, () => createUser({
        name: req.body.ownerName,
        email: req.body.ownerEmail,
        role: 'company_admin',
        dailyLeadLimit: 60
      }, actor), {
        allowSuspended: true
      });
      audit(actor, 'tenant.created', tenant.id, {
        name: tenant.name,
        slug: tenant.slug
      });
      return {
        tenant,
        owner
      };
    })();
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});
router.patch('/tenants/:tenantId', (req, res, next) => {
  try {
    const tenant = updateTenant(req.params.tenantId, req.body);
    audit(req.dashboardSession.user.id, 'tenant.updated', tenant.id, {
      name: tenant.name,
      active: tenant.active
    });
    res.json({
      tenant
    });
  } catch (e) {
    next(e);
  }
});
router.use('/tenants/:tenantId/admin', (req, res, next) => {
  try {
    return runInTenant(req.params.tenantId, () => next(), {
      allowSuspended: true
    });
  } catch (e) {
    next(e);
  }
}, adminRoutes);
router.get('/users', (req, res) => res.json({
  users: listUsers().filter(u => u.role === 'super_admin')
}));
router.post('/users', (req, res, next) => {
  try {
    res.status(201).json(createUser({
      ...req.body,
      role: 'super_admin'
    }, req.dashboardSession.user.id));
  } catch (e) {
    next(e);
  }
});
router.param('id', (req, res, next, id) => {
  if (findUser(id)?.role !== 'super_admin') return res.status(404).json({
    error: 'Platform account not found.'
  });
  next();
});
router.patch('/users/:id', (req, res, next) => {
  try {
    if (req.body?.role && req.body.role !== 'super_admin') return res.status(400).json({
      error: 'Manage tenant roles under their tenant.'
    });
    res.json({
      user: updateUser(req.params.id, {
        ...req.body,
        role: 'super_admin'
      }, req.dashboardSession.user.id)
    });
  } catch (e) {
    next(e);
  }
});
router.post('/users/:id/setup', (req, res, next) => {
  try {
    res.json({
      setup: issueSetup(req.params.id, req.dashboardSession.user.id)
    });
  } catch (e) {
    next(e);
  }
});
router.post('/users/:id/revoke', (req, res, next) => {
  try {
    res.json({
      user: updateUser(req.params.id, {}, req.dashboardSession.user.id)
    });
  } catch (e) {
    next(e);
  }
});
export default router;

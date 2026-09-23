import config from '../config/env.js';

export function verifyWebhookBearer(req, res, next) {
  if (!config.HOSTINGER_WEBHOOK_BEARER_TOKEN) {
    return next();
  }

  const authHeader = req.headers.authorization || '';
  const expected = `Bearer ${config.HOSTINGER_WEBHOOK_BEARER_TOKEN}`;

  if (authHeader === expected || authHeader === config.HOSTINGER_WEBHOOK_BEARER_TOKEN) {
    return next();
  }

  return res.status(401).json({
    status: 'rejected',
    reason: 'Invalid or missing webhook bearer token',
  });
}

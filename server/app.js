import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import config from './config/env.js';
import { getDatabase } from './services/storageService.js';
import apiRoutes from './routes/apiRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import { authRoutes, requireDashboardAuth } from './middleware/dashboardAuth.js';
import { handleWebhook } from './controllers/mailboxController.js';
import { notFoundHandler, globalErrorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distPath = path.join(rootDir, 'dist');

const app = express();

// Trust proxy for reverse proxy / hosting setups (Hostinger / Nginx / Cloudflare)
app.set('trust proxy', config.TRUST_PROXY);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

// CORS Configuration
const rawOrigins = (config.CORS_ORIGIN || '*').split(',').map((o) => o.trim());
const allowedOrigins = new Set(rawOrigins);
for (const origin of rawOrigins) {
  if (origin.startsWith('http://localhost:')) {
    allowedOrigins.add(origin.replace('http://localhost:', 'http://127.0.0.1:'));
  } else if (origin.startsWith('http://127.0.0.1:')) {
    allowedOrigins.add(origin.replace('http://127.0.0.1:', 'http://localhost:'));
  }
}

function checkOrigin(origin) {
  if (!origin || allowedOrigins.has('*') || allowedOrigins.has(origin)) {
    return true;
  }
  if (config.NODE_ENV === 'development') {
    try {
      const parsed = new URL(origin);
      if (['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
        for (const allowed of allowedOrigins) {
          try {
            const allowedUrl = new URL(allowed);
            if (
              ['localhost', '127.0.0.1', '[::1]'].includes(allowedUrl.hostname) &&
              allowedUrl.port === parsed.port
            ) {
              return true;
            }
          } catch {}
        }
      }
    } catch {}
  }
  return false;
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (checkOrigin(origin)) {
        callback(null, true);
      } else {
        const err = new Error('CORS policy: Not allowed by CORS');
        err.statusCode = 403;
        callback(err);
      }
    },
    credentials: true,
  })
);

// Request body parsing
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  try { getDatabase().prepare('SELECT 1').get(); }
  catch { return res.status(503).json({ status: 'unavailable', service: 'SpiceCoast' }); }
  res.status(200).json({
    status: 'ok',
    service: 'SpiceCoast Automation & Mailbox API',
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Mount Routes
app.use('/', webhookRoutes); // /webhook
app.post('/api/webhook', handleWebhook); // Both webhook paths use their own bearer authentication.
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', requireDashboardAuth, apiRoutes);  // /api/*

// Serve React production build (dist/) if present
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    // Avoid intercepting API/webhook 404s
    if (req.path.startsWith('/api') || req.path === '/webhook' || req.path === '/health') {
      return next();
    }
    if (req.method === 'GET' && req.accepts('html')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

// Fallback 404 & Error Handlers
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import config from './config/env.js';
import apiRoutes from './routes/apiRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import { notFoundHandler, globalErrorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distPath = path.join(rootDir, 'dist');

const app = express();

// Trust proxy for reverse proxy / hosting setups (Hostinger / Nginx / Cloudflare)
app.set('trust proxy', 1);

// CORS Configuration
if (config.CORS_ORIGIN === '*') {
  app.use(cors());
} else {
  const allowedOrigins = config.CORS_ORIGIN.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          callback(null, true);
        } else {
          callback(new Error('CORS policy: Not allowed by CORS'));
        }
      },
      credentials: true,
    })
  );
}

// Request body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
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
app.use('/api', apiRoutes);  // /api/*

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

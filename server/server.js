import app from './app.js';
import http from 'node:http';
import config from './config/env.js';
import { closeStorage, loadDailyUsage } from './services/storageService.js';
import { seedDefaultUsers } from './services/userService.js';
import { validateProductionConfig } from './config/production.js';
import { cancelPlacesSearches } from './services/placesSearchScheduler.js';
import { jobManager } from './services/jobManager.js';

const serverKey = Symbol.for('spicecoast.httpServer');
let startupPromise;

function listen(server, port) {
  const isNamedPipeOrSocket = typeof port === 'string' && isNaN(Number(port));
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(isNamedPipeOrSocket);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    if (isNamedPipeOrSocket) server.listen(port);
    else server.listen(port, config.HOST);
  });
}

function bindError(error, port) {
  if (error.code === 'EADDRINUSE') {
    return new Error(`Configured address ${config.HOST}:${port} is already in use. Stop the existing SpiceCoast server or the process that owns this port, then retry.`, { cause: error });
  }
  return error;
}

async function startServerOnce(port) {
  validateProductionConfig(config);
  // Detect inaccessible/corrupt storage before advertising a healthy server.
  loadDailyUsage();

  try {
    await seedDefaultUsers();
    console.log('👥  Users verified/seeded: admin@signinn.in (Superadmin) & admin@thespicecoast.com (Leadgen)');
  } catch (err) {
    if (config.NODE_ENV === 'production') throw err;
    console.warn('⚠️  [User Initialization Warning]:', err.message);
  }

  const server = http.createServer(app);
  let isNamedPipeOrSocket;
  try {
    isNamedPipeOrSocket = await listen(server, port);
  } catch (error) {
    closeStorage();
    throw bindError(error, port);
  }
  globalThis[serverKey] = server;

  if (isNamedPipeOrSocket) {
    console.log(`\n🌶️  SpiceCoast Express API Server running on socket/pipe: ${port}`);
    console.log('📡  Health Check: mounted on socket');
  } else {
    console.log(`\n🌶️  SpiceCoast Express API Server running on http://${config.HOST}:${port}`);
    console.log(`📡  Health Check: http://${config.HOST}:${port}/health`);
    console.log(`📧  Hostinger Webhook: http://${config.HOST}:${port}/webhook`);
  }
  console.log(`📮  Mailbox: ${config.SENDER_MAILBOX} | Auto-Send: ${config.AUTO_SEND}`);
  console.log(`🤖  AI Model: ${config.GROQ_MODEL}`);
  console.log(`🌍  Environment: ${config.NODE_ENV}\n`);

  // Graceful shutdown handling
  let stopping = false;
  const shutdown = async (signal, exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    console.log(`Closing HTTP server after ${signal}...`);
    const deadline = setTimeout(() => {
      server.closeAllConnections?.();
      console.error('HTTP server shutdown timed out.');
      process.exit(1);
    }, 30000);
    deadline.unref();
    try {
      const closed = new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeIdleConnections?.();
      });
      await Promise.all([closed, cancelPlacesSearches(), jobManager.stopSearchJobs()]);
      closeStorage();
      clearTimeout(deadline);
      delete globalThis[serverKey];
      startupPromise = undefined;
      console.log('HTTP server closed.');
      process.exit(exitCode);
    } catch (error) {
      console.error('HTTP server shutdown failed:', error);
      process.exit(1);
    }
  };
  server.on('error', (error) => {
    console.error('❌  [Server Error]:', error);
    shutdown('server error', 1);
  });
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  return server;
}

export function startServer(port = config.PORT) {
  if (globalThis[serverKey]) return Promise.resolve(globalThis[serverKey]);
  if (!startupPromise) {
    startupPromise = startServerOnce(port).catch(error => {
      startupPromise = undefined;
      throw error;
    });
  }
  return startupPromise;
}

startServer().catch(err => {
  console.error('❌ Startup failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exitCode = 1;
});

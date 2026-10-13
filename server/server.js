import app from './app.js';
import config from './config/env.js';
import { closeStorage, loadDailyUsage } from './services/storageService.js';
import { seedDefaultUsers } from './services/userService.js';
import { validateProductionConfig } from './config/production.js';

async function startServer(port) {
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

  const isNamedPipeOrSocket = typeof port === 'string' && isNaN(Number(port));
  const server = isNamedPipeOrSocket
    ? app.listen(port, () => {
        console.log(`\n🌶️  SpiceCoast Express API Server running on socket/pipe: ${port}`);
        console.log(`📡  Health Check: mounted on socket`);
        console.log(`📮  Mailbox: ${config.SENDER_MAILBOX} | Auto-Send: ${config.AUTO_SEND}`);
        console.log(`🌍  Environment: ${config.NODE_ENV}\n`);
      })
    : app.listen(port, config.HOST, () => {
        console.log(`\n🌶️  SpiceCoast Express API Server running on http://${config.HOST}:${port}`);
        console.log(`📡  Health Check: http://${config.HOST}:${port}/health`);
        console.log(`📧  Hostinger Webhook: http://${config.HOST}:${port}/webhook`);
        console.log(`📮  Mailbox: ${config.SENDER_MAILBOX} | Auto-Send: ${config.AUTO_SEND}`);
        console.log(`🤖  AI Model: ${config.GROQ_MODEL}`);
        console.log(`🌍  Environment: ${config.NODE_ENV}\n`);
      });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️  [Port Conflict] Port ${port} is occupied (e.g. by macOS AirPlay or another process).`);
      console.error(`[Port Conflict] Configured port ${port} is occupied. Set PORT to an available port.`);
      process.exit(1);
    } else {
      console.error('❌  [Server Error]:', err);
      process.exit(1);
    }
  });

  // Graceful shutdown handling
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    console.log('Closing HTTP server...');
    const deadline = setTimeout(() => process.exit(1), 30000);
    deadline.unref();
    server.close(() => {
      closeStorage();
      clearTimeout(deadline);
      console.log('HTTP server closed.');
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return server;
}

startServer(config.PORT).catch(err => {
  console.error('❌ Startup failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exitCode = 1;
});

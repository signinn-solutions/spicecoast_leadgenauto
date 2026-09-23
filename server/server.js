import app from './app.js';
import config from './config/env.js';

function startServer(port) {
  const server = app.listen(port, config.HOST, () => {
    console.log(`\n🌶️  SpiceCoast Express API Server running on http://${config.HOST}:${port}`);
    console.log(`📡  Health Check: http://${config.HOST}:${port}/health`);
    console.log(`📧  Hostinger Webhook: http://${config.HOST}:${port}/webhook`);
    console.log(`📮  Mailbox: ${config.SENDER_MAILBOX} | Auto-Send: ${config.AUTO_SEND}`);
    console.log(`🤖  AI Model: ${config.DEEPSEEK_MODEL}`);
    console.log(`🌍  Environment: ${config.NODE_ENV}\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️  [Port Conflict] Port ${port} is occupied (e.g. by macOS AirPlay or another process).`);
      const fallbackPort = port === 5000 ? 5001 : port + 1;
      console.log(`🔄  Attempting to bind on fallback port http://${config.HOST}:${fallbackPort} ...\n`);
      startServer(fallbackPort);
    } else {
      console.error('❌  [Server Error]:', err);
      process.exit(1);
    }
  });

  // Graceful shutdown handling
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server...');
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server...');
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  });

  return server;
}

startServer(config.PORT);

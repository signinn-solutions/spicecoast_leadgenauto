# Hostinger Node.js Web App

Deploy the repository root as a Node.js Web App with Node 22 or 24. Build with `npm ci && npm run build`; start with `npm start` (root `server.js` is also a valid entry point). Deploy frontend and backend together, served by Express. Follow the port supplied by Hostinger; do not hardcode a conflicting port.

Select the **Express.js** framework preset, not Vite. For this repository the application/entry directory is `./`, entry file is `server.js`, build command is `npm run build`, and start command is `npm start`. The frontend build still writes `dist/`, which Express serves; `dist/` alone does not contain the backend and must not be deployed as a frontend-only application.

A private `.env.production` was prepared for the temporary Hostinger domain. Import it into hPanel's environment variables. Do not commit it or upload it under public_html. The generated administrator login is stored in `backups/production-admin-credentials.txt`; transfer that password to a password manager. Existing development accounts in a migrated database must still be changed/suspended. The proposed `private-data` database path must be checked against the actual account home path and writable permissions before deploying. Create it outside `hbuilds` and `public_html`.

Set server environment variables in hPanel:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
TZ=Asia/Kolkata
ADMIN_EMAIL=your-admin-email
ADMIN_PASSWORD_HASH=your-generated-scrypt-hash
GROQ_API_KEY=your-groq-key
GROQ_MODEL=openai/gpt-oss-120b
GOOGLE_API_KEY=your-places-key
HOSTINGER_API_TOKEN=your-mail-token
HOSTINGER_MAILBOX_RESOURCE_ID=your-authorized-mailbox-resource-id
HOSTINGER_WEBHOOK_BEARER_TOKEN=your-webhook-secret
SENDER_MAILBOX=your-authorized-sender
AUTO_SEND=false
SPICECOAST_DB_PATH=/absolute/persistent/writable/path/spicecoast.sqlite
CORS_ORIGIN=https://your-app-domain
```

Generate the admin hash locally with `npm run auth:hash`; input is hidden. Production does not create development accounts. If migrating the existing database, first change the seeded users' passwords or suspend them through Superadmin while running the trusted local app. Startup refuses active accounts with known development passwords. Keep credentials in hPanel, not in Git or upload archives.

Set `TRUST_PROXY=1` only if one trusted proxy is in front of the process and direct access is blocked; confirm the platform topology first. HTTPS is required for production session cookies.

Before launch, confirm Hostinger preserves the database directory across redeploys and restarts, uses Node 24 (or Node 22.16+) with built-in SQLite, and runs one process/instance. A Node.js web app alone does not prove persistent disk behavior. Do not place SQLite in public assets or a directory replaced on deployment. If persistent writable storage is unavailable, this SQLite architecture requires a different hosting/storage arrangement.

Back up using `npm run backup -- /private/backup/path/spicecoast-backup.sqlite`. Download an off-host copy. Stop the app before restoring a verified backup; do not overwrite a live database or combine old WAL files with a restored database. Verify record counts after restoration. The backup contains customer data and password hashes; protect its permissions.

Configure the provider webhook to `https://your-app-domain/webhook` with the configured bearer secret. Confirm actual webhook payloads are parsed and replies match the right lead. Test one approved outbound email and an inbound reply before turning on automation.

Use `/health` for process/storage readiness. Provider authentication is checked separately in Superadmin. Search jobs and sessions are process-local; restarting interrupts jobs and signs users out. Sends now persist attempt state before the provider call. An uncertain outcome blocks automatic retry: reconcile against Hostinger Sent before resolving the record. This protects against blind duplicate sends; it is not an exactly-once delivery guarantee.

## GLIBC startup failure

The native SQLite addon was replaced with Node built-in SQLite. Set Node 24 in hPanel and redeploy the updated package/lockfile; no separately compiled SQLite binary is required. Configure the build command as `npm ci --include=dev && npm run build` so the frontend is rebuilt even when NODE_ENV is production. Keep Express, repository root, and server.js entry. PORT can be a numeric port or a platform socket path. A successful publish is not a successful runtime check: verify /health and the sign-in screen after restart.

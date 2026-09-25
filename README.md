# SpiceCoast lead operations

SpiceCoast is a single-organization app for finding business leads, enriching contact emails, reviewing outreach drafts, and handling inbound mailbox inquiries. The frontend is React/Vite; the API is Express. See [AUDIT_AND_PLAN.md](AUDIT_AND_PLAN.md) for the verified issues, remediation status, and deployment limits.

## What exists

- Search businesses with Google Places, enrich emails with Hunter.io, and track daily search usage.
- Use simulated search when testing without Places credentials. Simulated records are examples, not real prospects.
- Generate, edit, review, and send outreach drafts.
- Receive mailbox webhooks, draft replies with DeepSeek or a local fallback, review and send replies, and view outreach/mailbox history.
- Inspect lead analytics and export the current result set as CSV.

External provider behavior depends on valid credentials. A successful build or isolated test does not verify those providers.

## Layout

| Path | Purpose |
| --- | --- |
| `frontend/` | React application and Vite entry point |
| `server/` | Express API, provider integrations, storage, and tests |
| `dist/` | Generated frontend build, served by Express in production |
| `server.js` | Hosting-compatible root entry point |
| `spicecoast.sqlite` | SQLite operational storage, created on first API use and ignored by Git |
| Root JSON files | Preserved source files for first-run import and rollback |
| Root Python files | Older standalone utilities, outside the Node app runtime |

## Local setup

1. Use Node.js 20 or newer and install packages with `npm install` (on PowerShell with script execution disabled, use `npm.cmd install`).
2. Copy `.env.example` to `.env`. Leave unused provider keys blank. Set `HOST=127.0.0.1` for local use and configure secrets only in `.env` or the host's secret manager.
3. Run `npm run dev` to start the API on port 5000 and Vite on port 3000. PowerShell users can use `npm.cmd run dev`.
4. Open `http://localhost:3000`.

On first API use, SQLite imports the six existing JSON datasets in one transaction. It keeps the JSON files unchanged and does not import them again after the database has values. Set `SPICECOAST_DB_PATH` to place the database outside the repository. Back up the SQLite database and its WAL state before deployment changes; stopping the API before copying is the simplest safe backup method. To roll back to the old JSON-based version, stop the API and redeploy the prior code with the preserved JSON files. Changes made after the SQLite migration will not appear in those old files.

To build and serve through Express, run `npm run build` and then `npm start`. `PORT` selects the API port. `VITE_API_TARGET` can point the development proxy to another API URL, for example `http://127.0.0.1:5100`.

## Checks

```text
npm run build
npm test
```

The isolated Node tests redirect JSON storage to a temporary directory and block network calls. The older `server/test/test_endpoints.js` script remains for reference but is unsafe against real configuration: it mutates operational JSON files and may call external providers. Do not use it as the normal test command.

## Deployment boundaries

This is **not yet a public multi-tenant SaaS**. API routes for lead data, mailbox data, and sending are currently unprotected. SQLite persists records, but the current read-modify-write workflows require a single API process and still need concurrency hardening. Keep the app behind trusted access until identity, organization isolation, backup/restore operations, and deployment-specific secret handling are designed and implemented. Those are product capabilities outside this cleanup.

Set a nonempty `HOSTINGER_WEBHOOK_BEARER_TOKEN` for inbound webhook calls. Mail delivery needs a configured Hostinger API token or SMTP credentials. `AUTO_SEND=false` is the safer default for review-based operation. Confirm the provider endpoint, sender mailbox, and allowed CORS origin for your host before exposing the app.

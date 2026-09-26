# SpiceCoast lead operations

A **single-business, single-tenant** application for finding business leads, enriching email addresses, reviewing outreach, and handling inbound inquiries. Your dashboard, sidebar, and existing lead workflow are preserved. React/Vite and Express are separated into frontend/ and server/; SQLite owns operational data.

## Run locally

1. Use a current Node.js 22 or 24 release. Run `npm ci` (PowerShell: `npm.cmd ci`).
2. Copy `.env.example` to `.env` and configure only the providers you use. Keep `HOST=127.0.0.1` and `NODE_ENV=development` for local development.
3. Run `npm run dev` and open http://localhost:3000. The API defaults to port 5000. Set `VITE_API_TARGET` if the backend uses another port.
4. Restart the API after changing server code or environment settings. Vite updates frontend changes automatically.

Simulated leads and test inquiries are clearly marked and cannot be sent. Simulated searches still consume the application's daily discovery quota; they do not call discovery/enrichment providers. Drafting falls back to local templates when AI is unavailable.

## Dashboard access

Production requires `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH`. There is one administrator for this business, with no public registration or tenant system.

1. Run `npm run auth:hash`. Enter a unique password of at least 14 characters at the hidden prompt.
2. Put the generated hash and your administrator email in the server's environment or secret manager. Keep the plaintext password in your password manager.
3. Use HTTPS and `NODE_ENV=production`. The dashboard presents the sign-in form. Production cookies are Secure, HttpOnly, and SameSite=Strict; write actions require the session's CSRF token.

If neither admin variable is set, development access is allowed only over a loopback connection with a localhost/loopback Host. Production fails closed if credentials are missing or malformed. Sessions expire after eight hours, are revoked on logout or credential changes, and end on server restart. Session and login throttling state are held in memory: run **one API process**. Set `TRUST_PROXY=1` only behind exactly one trusted reverse proxy that preserves the public Host header and controls forwarded IP headers. Otherwise leave it at 0.

## Existing workflow

- **Overview:** lead counts, deliverability, saved drafts, and mailbox activity.
- **Prospector:** search using Google Places and Hunter, or explicit simulation.
- **Leads:** search/filter saved contacts, inspect details, export CSV, generate and edit drafts.
- **Outreach:** review drafts and send only to saved, verified, live contacts.
- **Mailbox:** review webhook inquiries and replies; the simulator never sends mail.
- **Analytics / System Health:** inspect actual records and configured integrations. A configured key is not proof that the provider is reachable.

Auto-send is off by default. Enable it only after validating your provider configuration and reviewing generated reply content. Generated drafts still require business accuracy review; the app cannot verify commercial promises.

## Structure

| Path | Purpose |
| --- | --- |
| `frontend/src/components/` | Dashboard and workflow screens |
| `frontend/src/hooks/` | Shared dialog keyboard/focus behavior |
| `frontend/src/api.js` | Session-aware API requests |
| `server/controllers/` | Request validation and workflow responses |
| `server/services/` | Provider integration, quotas, SQLite storage |
| `server/middleware/` | Dashboard sessions and safe error responses |
| `server/test/` | Isolated workflow, auth, mail, and AI regressions |
| `server/scripts/` | Administrator password hash helper |
| `dist/` | Generated frontend served by Express |
| `docs/` | Deployment, cleanup, and UI review reports |

JavaScript remains the active language. Unreferenced TypeScript declarations and tooling were removed; renaming JSX files would not provide meaningful type safety. A future conversion should introduce validated API contracts and a real type-check gate together.

## Data and deployment

SQLite is created at `SPICECOAST_DB_PATH` (default `./spicecoast.sqlite`). On initialization, missing dataset rows import the six legacy JSON files transactionally. Originals are preserved and never updated by the application. Existing database rows are not overwritten. Corrupt import JSON stops initialization.

The current database uses dataset rows containing JSON, plus settings, with WAL and shared process-level workflow locks. This is appropriate for one modest-volume business instance; it is not a horizontally scaled database architecture. Mailbox history retains 150 messages and outreach history 200 records, matching existing behavior. These views are not an unlimited archive.

Run `npm run build` then `npm start` to serve the app through Express. Docker uses Node 24 and a persistent `/var/data` volume. Images exclude operational JSON, databases, and environment secrets. See [deployment and migration](docs/DEPLOYMENT.md) for importing existing history and backing up/restoring data. Do not run multiple replicas against this database.

Webhook POSTs at `/webhook` and `/api/webhook` require `HOSTINGER_WEBHOOK_BEARER_TOKEN`, independently of dashboard sessions. Preserve the provider's event/message ID for retry deduplication. Mail transport requires Hostinger or SMTP credentials. SMTP requires encrypted transport.

## Verification

`npm test` runs temporary-database tests with provider stubs; it does not send real mail or consume provider quotas. `npm run build` verifies the production frontend bundle. `npm audit` checks current registry advisories. The compatibility command `node server/test/test_endpoints.js` also uses isolated workflow tests.

See [audit and remaining checks](AUDIT_AND_PLAN.md). Browser visual/mobile QA, an actual Docker build, live provider validation, and a deployment backup/restore exercise remain deployment checks; passing local tests does not prove those outcomes.

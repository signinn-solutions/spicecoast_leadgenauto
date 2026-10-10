# Signinn Leadgen

A **tenant-based platform with shared company workspaces** for finding business leads, enriching email addresses, reviewing outreach, and handling inbound inquiries. Your dashboard, sidebar, and existing lead workflow are preserved. React/Vite and Express are separated into frontend/ and server/; SQLite owns operational data.

## Run locally

1. Use a current Node.js 22 or 24 release. Run `npm ci` (PowerShell: `npm.cmd ci`).
2. Copy `.env.example` to `.env` and configure only the providers you use. Keep `HOST=127.0.0.1` and `NODE_ENV=development` for local development.
3. Run `npm run dev` and open http://localhost:3000. The API defaults to port 5000. Set `VITE_API_TARGET` if the backend uses another port.
4. Restart the API after changing server code or environment settings. Vite updates frontend changes automatically.

Simulated leads and test inquiries are clearly marked and cannot be sent. Simulated searches still consume the application's daily discovery quota; they do not call discovery/enrichment providers. Drafting falls back to local templates when AI is unavailable.

## Dashboard access

Production requires an activated persistent account. Signinn super admins manage the platform; customers use only company_admin and viewer. Records, mailbox, keys and quotas are shared within each company and isolated from other companies. Signinn alone manages users, provider credentials and manual subscriptions. See [access setup](docs/ACCESS_AND_OPERATIONS.md) and [subscription audit](docs/SUBSCRIPTION_AND_LOGIC_AUDIT.md).

1. Run `npm run admin:setup -- admin@signinn.in` against the intended database. Activate using its private, one-time link.
2. Sign in to the platform console; create the company administrator and configure its providers, plan and subscription. Share the customer activation link privately.
3. Use HTTPS and `NODE_ENV=production`. The dashboard presents the sign-in form. Production cookies are Secure, HttpOnly, and SameSite=Strict; write actions require the session's CSRF token.

If neither admin variable is set, development access is allowed only over a loopback connection with a localhost/loopback Host. Production fails closed if credentials are missing or malformed. Sessions expire after eight hours, are revoked on logout or credential changes, and end on server restart. Session and login throttling state are held in memory: run **one API process**. Set `TRUST_PROXY=1` only behind exactly one trusted reverse proxy that preserves the public Host header and controls forwarded IP headers. Otherwise leave it at 0.

## Existing workflow

- **Overview:** lead counts, deliverability, saved drafts, and mailbox activity.
- **Prospector:** search using Google Places and Hunter, or explicit simulation.
- **Leads:** search/filter saved contacts, inspect details, export CSV, generate and edit drafts.
- **Outreach:** review drafts and send only to saved, verified, live contacts within the outbound send limit.
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

## Signinn platform and customer tenants

Signinn Leadgen is the platform; SpiceCoast is its initial tenant. Platform super admins land on a dedicated tenant-management console, while customer users see their own CRM. Manage tenants, plans, dated activation/renewal, grace periods, suspension, users, encrypted API keys, automation, delivery recovery and audit there. Existing records and passwords are preserved; new tenants start without provider credentials.

For a complete backup, quiesce the API and run npm run backup:tenants -- .local/new-backup-directory. Retain the entire output directory and the encryption key separately. See [platform and tenant operations](docs/ACCESS_AND_OPERATIONS.md) and [migration boundaries](docs/PLATFORM_TENANCY.md).

## Data and deployment

SQLite is created at `SPICECOAST_DB_PATH` (default `./spicecoast.sqlite`). On initialization, missing dataset rows import the six legacy JSON files transactionally. Originals are preserved and never updated by the application. Existing database rows are not overwritten. Corrupt import JSON stops initialization.

The current database uses dataset rows containing JSON, plus settings, with WAL and shared process-level workflow locks. The platform registry and SpiceCoast data remain in the main database; additional tenants have separate databases under tenants/. This supports a modest-volume single-process platform, not horizontal scaling. Mailbox and outreach histories now retain all existing records. The admin delivery ledger and audit views show the latest 200 entries, while all entries remain in SQLite. CRM and inbox tables paginate locally; very large datasets will require indexed server pagination.

Run `npm run build` then `npm start` to serve the app through Express. Docker uses Node 22 and a persistent `/var/data` volume. Images exclude operational JSON, databases, and environment secrets. See [deployment and migration](docs/DEPLOYMENT.md) for importing existing history and backing up/restoring data. Do not run multiple replicas against this database.

Tenant webhook POSTs use `/webhook/{tenantSlug}` and that tenant’s configured bearer token, independently of dashboard sessions. Legacy `/webhook` and `/api/webhook` route to SpiceCoast. Subscription access also gates webhook processing. Preserve the provider's event/message ID for retry deduplication. Mail transport requires Hostinger or SMTP credentials. SMTP requires encrypted transport.

## Verification

`npm test` runs temporary-database tests with provider stubs; it does not send real mail or consume provider quotas. `npm run build` verifies the production frontend bundle. `npm audit` checks current registry advisories. The compatibility command `node server/test/test_endpoints.js` also uses isolated workflow tests.

See [current subscription and logic audit](docs/SUBSCRIPTION_AND_LOGIC_AUDIT.md). Browser visual/mobile QA, an actual Docker build, live provider validation, and a deployment backup/restore exercise remain deployment checks; passing local tests does not prove those outcomes.

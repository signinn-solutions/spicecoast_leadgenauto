# Signinn platform and tenant operations

## Initial super admin

The local database contains admin@signinn.in as a Signinn platform super admin with no tenant assignment. Its existing password and activation state are preserved. A pre-change SQLite backup and the one-time activation link are under .local/, excluded from Git and Docker. Sign in at http://localhost:5100 with the existing password. For an account that has not yet activated, use its private activation link; the original setup file may already be consumed. Set a password of 14–256 characters; the token is consumed once and expires after 24 hours. The app removes the activation fragment from browser history. No password was invented or emailed.

To issue a fresh local super admin activation token:

    npm run admin:setup -- admin@signinn.in

The command prints a private URL fragment. Append it to the local or deployed app URL. Run it against the intended database; production uses its persistent volume, not this local SQLite file. It cannot add a new super admin to an established workspace; use the existing super admin dashboard for that. Recovery can reissue a token to an existing super admin.

## Platform and tenant roles

Signinn Leadgen is the application platform. SpiceCoast is the initial customer tenant. Platform super admins land on a dedicated control panel with tenant overview, creation/suspension, usage, platform accounts and audit. They do not land in the CRM and cannot call ordinary tenant workspace APIs.

Platform → Tenants → Manage exposes that tenant's users, provider keys, quotas, automation, deliveries and audit. Create a tenant together with its company administrator; privately share the one-time activation link. Existing SpiceCoast records are preserved under the SpiceCoast tenant. SpiceCoast has one seeded company administrator, admin@thespicecoast.com, with the supplied password set through the normal hashed password setup flow.

| Role | Shared records | Discovery and drafts | Send reviewed mail | Accounts, keys, automation, audit |
| --- | --- | --- | --- | --- |
| super_admin | Platform control panel; tenant operational administration | No ordinary CRM access | No ordinary workspace dispatch | All tenants and platform accounts |
| company_admin | Read/export within own tenant | Yes | Yes | Automation only; Signinn manages users and keys |
| viewer | Read/export | No | No | No |

Create customer users from Platform → Tenants → Manage → Users. Customer pages have no Administration entry and no user/key/subscription management APIs. Share the returned activation link privately yourself. Update roles, enable/disable accounts, set discovery limits, issue password setup links or revoke sessions. Password reset, role changes and account changes revoke existing sessions. The last activated super admin cannot be disabled or demoted. There is no public registration. Users share records and keys only with users of their tenant. Every account belongs to one tenant, except platform administrators. Emails are unique across the platform. Tenant administrators cannot grant platform roles or move accounts between tenants. Tenant suspension blocks workspace APIs, new login, webhook processing and send dispatch; platform management remains available. Keep at least one active activated company administrator.

Sessions use HttpOnly, SameSite=Strict cookies; production also requires HTTPS for Secure cookies. Writes require a CSRF token. Passwords use scrypt with unique salts. In-memory sessions are lost on restart. Run one API process/replica. Existing ADMIN_EMAIL and ADMIN_PASSWORD_HASH remain a fallback only while the database has no persistent users; after creating the first user, database accounts own login.

## Provider settings

SETTINGS_ENCRYPTION_KEY is a 32-byte key represented by 64 hex characters, kept in the server environment. A local key was generated in the ignored .env. Back up this secret separately from the database; it is necessary to decrypt stored settings. Never change it without a deliberate re-encryption migration.

Platform → Tenants → Manage → Integrations manages the Google, Hunter, DeepSeek, Hostinger and SMTP credentials shared within the selected tenant. Secret fields never return their saved values. Leaving a secret blank preserves it; Clear saved key explicitly removes it. Saved overrides are AES-256-GCM encrypted in SQLite and are loaded into a request-scoped tenant configuration. Environment provider defaults belong only to the existing SpiceCoast tenant; new tenants start without keys, sender mailbox or auto-send. The server-wide encryption secret is never editable through tenant APIs. Business context and inbound keyword settings also belong to the tenant. Avoid editing .env and assuming it overrides saved dashboard settings.

Hostinger requires its mailbox resource ID, not the sender email as the path identifier. Use Check hostinger to list accessible mailboxes, then save the matching resource ID and sender. The current endpoint is https://api.mail.hostinger.com/api/v1/mailboxes/{resourceId}/send. Legacy HOSTINGER_SEND_ENDPOINT values pointing to /v1/mailboxes/{email}/messages must be removed or corrected in the environment. Hostinger is preferred over SMTP when its API token is present. Clear the token to use SMTP; SMTP uses implicit TLS or required STARTTLS. Keys being configured is not proof of connectivity.

Check hunter, deepseek and hostinger uses read-only provider requests. Google needs an actual search to verify authentication/billing, and that search can incur provider charges. The check script makes one Google result request with a minimal field mask and never sends mail:

    node server/scripts/check-providers.js

The script loads saved dashboard overrides from the selected database, just like the server.

## Manual subscriptions

Signinn manages reusable plans and each company’s subscription from the platform console. Plans own daily lead, reply draft and send quotas, plus active user seats (including accounts awaiting activation). Zero daily limits disable that operation. New companies start pending until Signinn activates access. Set a trial or paid start/end period, optional grace end, renewal note/payment reference, or cancellation. Suspension overrides all subscription states. Date inputs use Asia/Kolkata and include the selected last day. Expiry blocks new login, workspace API requests, webhooks and new search/send operations; an authenticated blocked user can still check access or sign out. Renewal preserves data and does not reset daily usage. It must extend access to a future end date.

SpiceCoast retains Standard: 60 leads/day, 30 reply drafts/day, 50 sends/day, 10 active users. No paid period was supplied, so access stays explicitly open-ended and flagged in the Signinn console. This is a manual access grant, not an invented paid term. Record actual payment externally and enter a dated period here. No payment gateway, invoice generation or automatic renewal is implemented.

## Limits and search behavior

- A batch accepts 1–60 listings. Google returns up to 20 per page; the app follows at most three nextPageTokens. 60 is a maximum request, not a guaranteed result count.
- Local and template workspace discovery defaults are 60/day. Accounts default to 60/day. Signinn manages per-account discovery limits and shared subscription plans. Plan changes apply immediately; legacy provider quota overrides are ignored in tenant workspaces. A per-user discovery limit of 0 blocks discovery. The lower remaining account/workspace limit caps the request. Duplicates do not consume discovery slots. Each attempted new lead reserves one slot before enrichment; a process crash can consume that slot without a fully saved lead.
- Daily inbound AI drafting defaults to 30. Exhausted quota retains inquiries without drafts. Prepare reply draft later or write/review an existing draft. Creating and sending a reply are separate quota concepts.
- Daily outbound sends default to 50 across cold mail, reviewed replies, auto-replies and follow-ups. Sending, accepted and uncertain attempts reserve quota; definite failures do not. Quotas use QUOTA_TIMEZONE (Asia/Kolkata by default).
- Hunter rate limiting pauses requests for one minute, then permits retry. Website emails remain unknown until Hunter verification succeeds. Unknown/risky/invalid leads cannot receive cold outreach or follow-ups. A legacy migration changes unsupported old deliverable claims to unknown and phone valid labels to listed; use Verify email on those contacts.
- Search runs as a persisted background job, saves completed leads incrementally and exposes progress. Reloaded dashboards show recent jobs and allow opening completed batches. Restarted unfinished jobs become interrupted; rerunning skips completed records. Request IDs deduplicate repeated submissions. Each account can have only one queued/running batch.
- Keyword changes make new provider queries. Tenant duplicate detection still excludes previously saved businesses. A company domain is treated as one business, so branches sharing a domain may be excluded. Results are prospects, not confirmed buyers.
- Optional automatic outreach drafting is off by default to keep discovery faster. Generate drafts later from verified leads.
- CRM and inbox have real local table pagination. The existing API still loads the shared dataset; use indexed server pagination before large-volume use. Tenant isolation is already enforced; local pagination does not provide a large-dataset scalability guarantee.

## Mail integrity and recovery

All reviewed sends bind the recipient to a saved live lead or inbox record. Simulated leads/inquiries cannot send. An editable all-messages inbox retains pending, sent, ignored, suppressed and quota-deferred mail. Follow-ups are drafts for review, due after 3 days and then 7 days after the first follow-up; no-response leads close after 14 days from initial contact. This evaluation runs on dashboard lifecycle requests, not an independent scheduler.

Inbound webhooks use /webhook/{tenantSlug} and require Authorization: Bearer with that tenant’s configured token. The legacy /webhook and /api/webhook paths route only to SpiceCoast. Tenant selection never comes from arbitrary browser query parameters or headers. Preserve a unique event/message identifier so retries deduplicate. Supported payloads contain a plain sender/receiver email, subject and text body using the aliases accepted by webhookService. providerRef with {uid,folder} enables Hostinger reply threading; SMTP can use the message identifier. The exact real Hostinger event shape still needs an end-to-end deployment check. Without an identifier, the app cannot reliably distinguish retry deliveries from genuinely repeated inquiries. Use review-first mode until that is verified.

Incoming inquiries are persisted before AI or transport work so restart/retry does not automatically send them twice. Known contacted senders are accepted even without matching lead keywords. Set comma-separated keywords per tenant. Nonmatching and automated messages are retained without replies. Opt-out language and the admin do-not-contact list block every outbound path. Classification and engagement scores assist triage; they do not establish buying intent or commercial accuracy. Dashboard scoring avoids new AI requests during polling.

The delivery ledger writes sending before transport dispatch. Timeouts, network failures and ambiguous server errors become unknown. Both sending and unknown block retry until a platform administrator checks the provider’s Sent folder and reconciles the result. Confirmed accepted records update the mailbox/outreach workflow; confirmed not sent allows retry. This is deliberately conservative: no provider idempotency guarantee is assumed, and inbox placement is not proven by a send acknowledgement.

## Backup, restore and deployment

Stop/quiesce the API, then back up the platform and every tenant database with the WAL-aware SQLite backup API:

    npm run backup:tenants -- .local/new-backup-directory

Back up SETTINGS_ENCRYPTION_KEY separately. The backup directory contains platform.sqlite, tenants/{tenantId}.sqlite and manifest.json. SpiceCoast datasets and platform access share the legacy main database; other tenant datasets use separate files. The old backup-store.js command backs up only the main database and is not a complete platform backup. The test suite restores both tenant datasets and platform accounts under a different storage root. Multiple files are not one atomic snapshot, hence the quiescence requirement. Production restore still needs an operator rehearsal: stop the API, retain the current database for rollback, restore the complete verified backup directory and point SPICECOAST_DB_PATH at its platform.sqlite, ensure node-user permissions, restore the encryption secret, then restart and verify login, settings and records. Never delete the only database or copy a live SQLite main file without accounting for WAL.

Build with npm run build and start with npm start. Docker/Render use a persistent /var/data volume and one replica; retain the tenants/ directory alongside the platform database. Create the production super admin on that database with the setup command, then activate it over HTTPS. This local account is not automatically deployed. Confirm reverse-proxy Host/Origin handling, set TRUST_PROXY=1 only for one controlled proxy, verify real provider access and your mail-domain authentication, run one controlled send/reply/threading test with a recipient you own, exercise quota limits, and complete browser/mobile QA before launch.

See [current subscription and logic audit](SUBSCRIPTION_AND_LOGIC_AUDIT.md) for the latest role model, subscription enforcement and verification.

# Signinn platform and customer tenants

## Requested model

Signinn Leadgen owns the application platform. admin@signinn.in is a platform super admin. SpiceCoast is the initial customer tenant. Shared workspace means records are shared within a tenant; it does not mean all customers share one mailbox or dataset.

## Implemented boundaries

- AuthGate chooses PlatformConsole for super_admin; customer roles choose the tenant CRM. The console has platform overview, tenant creation/suspension, usage, platform accounts and central audit.
- Platform tenant management exposes customer accounts, encrypted provider keys, quotas, business context, inbound keyword filters, automation, delivery reconciliation and suppression.
- Customer roles are only company_admin and viewer. Signinn alone manages accounts, provider keys and subscriptions; there is no customer Administration screen. Server guards forbid tenant accounts from granting platform roles, moving accounts between tenants, managing foreign users or accessing platform endpoints. Normal workspace APIs reject platform super admins.
- AsyncLocalStorage preserves tenant identity and configuration across awaits and background discovery. Records and operation locks are keyed by tenant database path. Additional tenants start with empty datasets and no inherited provider credentials, mailbox or automation. Provider secrets remain encrypted and are never returned to clients.
- Platform accounts, authentication and audit remain central. SpiceCoast retains the original dataset rows in the main database. New tenants store datasets, quotas, jobs, delivery ledger, suppression and encrypted settings in tenants/{tenantId}.sqlite. Tenant selection comes from an authenticated account or explicit platform-managed route, never arbitrary customer headers or query strings.
- Tenant-specific /webhook/{slug} verifies that tenant's bearer token; legacy webhook paths belong only to SpiceCoast. Suspension blocks customer requests, new login, webhooks and outbound dispatch. Platform management remains available during suspension.
- New tenant draft/reply/follow-up text uses its identity and approved business context. SpiceCoast retains its business templates. Tenant inbound keywords are editable. Account creation returns a private one-time password setup link; no email is automatically sent.

## Migration and rollback

The additive, idempotent migration creates the tenant registry and tenant_id ownership columns. Existing super_admin accounts become platform accounts with no tenant. Other existing roles are assigned to SpiceCoast. Passwords and activation states are preserved.

The local database was backed up to .local/pre-tenancy-1791625384580.sqlite. Dataset rows compared byte-for-byte equal before and after migration. admin@signinn.in was already activated and retains its password; SpiceCoast is registered and active. SpiceCoast now has one active, activated company administrator: admin@thespicecoast.com. The current company_admin login and workspace return 200; both customer administration and platform administration return 403. The supplied password was hashed through the normal account setup flow and was not written into setup scripts or documentation.

For rollback, stop the API, retain the full current storage directory and encryption secret, revert application code and restore the pre-migration database together. New tenants created after that backup are not in the old backup; preserve them before reverting. Do not run mixed old/new app versions against the platform database.

For ongoing backups, stop/quiesce the API and run npm run backup:tenants -- <new directory>. Restore platform.sqlite plus the adjacent tenants/ directory and set SPICECOAST_DB_PATH to that platform.sqlite. Individual SQLite backups are consistent, but multiple files are not one atomic snapshot, hence quiescence is required. The old backup-store command backs up only the main database.

## Verification and limits

The initial tenancy change passed 48 automated tests, including concurrent tenant background searches, cross-tenant access denial, role escalation prevention, webhook routing, suspension, onboarding, preserved migration data, tenant branding, and full backup restoration under another storage root. The production build passed. Static review of six changed UI files returned zero findings. Component rendering confirms the platform console has its own navigation and no customer CRM/outreach menus.

One API process/replica remains required because sessions and operation locks are in memory. Tenant datasets still use JSON storage and client pagination; indexed server pagination and a durable queue/session store are needed for larger deployments. Each account belongs to one tenant and emails are globally unique. Manual subscription plans and access management are now implemented; automatic payments, SSO and multi-workspace membership remain outside scope. Browser/mobile interaction and real provider delivery/webhooks remain unverified here.

Final local HTTP smoke: health 200, auth session 200 with login enabled, anonymous platform overview and tenant leads both 401, dashboard HTML 200 with Signinn title. Local app restarted on port 5100; in-memory sessions require signing in again. Git whitespace check passed. No deployment or real outbound mail was performed.

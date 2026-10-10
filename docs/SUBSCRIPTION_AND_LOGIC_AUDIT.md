# Signinn subscriptions and application logic audit

Verified locally on 10 October 2026. Signinn owns the platform; SpiceCoast is a customer company. Manual subscription management is implemented. Local automated evidence supports the changes below, but full production readiness is not established.

## Ownership and customer experience

| Account | Workspace actions | Management actions |
| --- | --- | --- |
| Signinn super_admin | Dedicated platform console; no ordinary customer CRM dispatch | Companies, plans, subscription periods, access, users, encrypted provider credentials, delivery reconciliation, suppression and audit |
| Customer company_admin | Read/export, discovery, email verification, drafting, reviewed sends, inbound auto-send mode and lifecycle actions in its company | No account, key, plan or subscription administration |
| Customer viewer | Read/export and lifecycle preview | No discovery, draft editing, sending, automation or administration |

Customer navigation has no Administration item. Customer status shows a read-only plan and expiry summary. Expired/suspended sessions show a blocked-access screen with retry and sign-out. API authorization enforces these boundaries independently of UI visibility. Users cannot choose another tenant through a header or query parameter.

## Manual subscription operation

Signinn records payment outside the app. In Platform → Tenants → Manage, select a plan and subscription status, enter start/end dates and an optional grace end, and record a payment reference or internal note. The console date inputs use Asia/Kolkata; the selected last active date includes that day's end. The API stores explicit UTC timestamps and rejects missing timezones, invalid calendar dates and reversed periods.

New tenants begin pending. Trial/active periods enable access after their start date. Expiry blocks access unless an explicit grace period remains. Past-due access needs a grace end. Cancellation and tenant suspension block access; suspension overrides a paid period. Renewal must extend access to a future end date. Renewal does not clear records, reset usage, replace passwords or automatically reactivate a suspended tenant. Subscription history records actor, action, before/after state and note. The console displays the latest 100 changes; all changes remain stored.

Plans own shared daily discovery, inbound reply draft and outbound send quotas, plus active user seats. Pending activation accounts count as active seats. Creation/reactivation and plan downgrades enforce seat capacity. Changing a plan affects all assigned companies immediately. Zero daily limits disable the operation. Customer-specific per-user discovery limits remain an additional cap managed by Signinn. Legacy provider quota overrides are ignored in tenant workspaces; the Integrations form no longer presents competing quota fields.

SpiceCoast remains on Standard: 60 leads/day, 30 reply drafts/day, 50 sends/day, 10 active users. No paid expiry date was provided. Its existing access is an explicit open-ended manual grant, visibly flagged for Signinn. Set the actual paid period after confirming it; no subscription duration was fabricated. Automatic charging, invoices, reminders and payment-provider webhooks are outside this manual model.

## How live discovery and mail work

A search sends the current business keyword, city and country to Google Places Text Search. Up to three pages of 20 listings produce a maximum batch of 60; fewer results can occur because of provider coverage, duplicate filtering or remaining quotas. Hunter searches company domains and verifies emails; website extraction can supply candidate emails. Unknown/risky/invalid email status never becomes a verified outreach target. Hunter cooldowns are keyed by provider credential, so requests for another tenant cannot reset an existing cooldown.

Each tenant has its own records, usage, settings, delivery ledger and background jobs. Jobs persist progress and save completed leads incrementally. Restarted unfinished jobs become interrupted. Reusing a request ID returns its original job; changed search intent should use a new ID, as the UI does. Malformed search inputs are rejected before a background job is reserved. CRM and inbox use local table pagination; the API still returns entire tenant datasets.

Cold outreach needs a saved live lead with a verified email. Reply sending binds the recipient to the saved inbox message, preserves reviewed edits and blocks duplicate dispatch. Webhooks authenticate using the routed tenant's token and persist inquiries before drafting/sending. Exhausted draft quota retains inquiries as received. Unique provider identifiers deduplicate inbound retries. Opt-outs suppress all outbound paths. Follow-ups remain reviewable drafts, due after three days and then seven days after the first follow-up; unanswered outreach closes after fourteen days from the first contact.

All outbound paths share a delivery ledger and send quota. Sending/accepted/uncertain attempts reserve capacity. Definite failures allow retry; uncertain acceptance needs Signinn to check the provider and reconcile it first. This prevents blind retries but cannot guarantee exactly-once delivery when the provider has no idempotency contract. Actor permissions and subscription access are rechecked after queued search/send work acquires its lock. An already dispatched external operation cannot be recalled by a later access change.

## Defects corrected in this pass

- Platform controls and legacy roles appeared in customer pages. Customer Administration was removed and customer roles reduced to company_admin/viewer; only Signinn manages users and credentials.
- There was no dated paid-access model. Plans, pending onboarding, periods, grace, cancellation, renewal and history now enforce access at the server.
- Viewer lifecycle polling could persist lifecycle changes. Viewer GETs now produce previews without rewriting mailbox/outreach datasets; company_admin evaluation can persist lifecycle state.
- Queued follow-up dispatch omitted its sender actor. The actor is forwarded and send permission is checked immediately before transport dispatch.
- Global Hunter cooldown state could be reset by switching credentials. Cooldowns now remain attached to each key.
- Background malformed requests could create failed jobs instead of immediate validation errors. Validation now precedes job creation.
- Zero limits could fall back to nonzero defaults or yield invalid progress values. Display logic preserves zero and guards zero denominators.

## Local migration and evidence

A WAL-aware pre-change backup is at .local/pre-subscriptions-1791627060429.sqlite, excluded from Git/Docker. Legacy tenant_admin/manager migrate to company_admin; operator migrates conservatively to viewer. Migration increments account versions once to invalidate obsolete sessions. Repeated initialization is idempotent. Password hashes and activation states are preserved.

Local verification found exactly one SpiceCoast tenant, one customer administrator admin@thespicecoast.com and platform administrator admin@signinn.in. All 190 leads and 18 mailbox records were preserved. Dataset rows and password hashes compared equal before/after migration. The existing customer password was used for a successful HTTP login and was not saved in a script or document.

58 automated tests passed. Coverage includes 60-result Google pagination, keyword changes, deduplication, quota clamps, malformed requests, multi-tenant concurrency/isolation, user revocation, one-time activation, encrypted keys, inbound retries/quotas/opt-outs, edited and duplicate sends, uncertain-delivery recovery, follow-up timing, full backup restoration, subscription boundaries/renewal/seat caps, viewer read-only lifecycle, queued cancellation/revocation and component rendering. External provider requests and transport use stubs; no real outbound mail was sent.

The production frontend build passed. Static 21st review of SubscriptionPanel, PlanManager, Sidebar, AuthGate and AdminView reported zero findings. Component rendering checks customer navigation lacks Administration, viewer discovery is hidden, removed role options are absent, zero quotas render safely and 60 leads paginate as three pages of 20. These are not browser interaction or visual/mobile checks.

Live local HTTP smoke passed: health/login/status/leads/dashboard 200, company_admin role and expected limits, customer administration/platform routes 403, logout 200. The app runs at http://localhost:5100; the ignored local .env port now matches this URL. Restart invalidates in-memory sessions: sign in again. Run npm run build then npm start for the built app, or npm run dev for Vite on port 3000 with its configured API proxy.

## Remaining production checks and constraints

Real Google billing/coverage, Hunter quotas/verification, DeepSeek generation and Hostinger/SMTP delivery were not validated in this pass. Confirm the actual inbound webhook shape, unique IDs, reply threading, sender identity, DNS authentication and one controlled exchange with a recipient you own before enabling unattended replies. A provider acceptance acknowledgement does not prove inbox delivery.

Browser keyboard/mobile/visual interaction remains unverified because no browser automation surface was available. Docker build and deployment backup/restore need the deployment environment. The previous registry vulnerability audit could not complete because of network access; it is not a clean dependency-security result.

Use one API process/replica. Sessions, login throttling, provider cooldowns and workflow locks are in memory; background jobs persist records but do not use a durable worker queue. Tenant datasets are JSON rows with client pagination, suitable for modest volume rather than horizontal scaling. A larger rollout needs indexed server pagination, durable queues/shared sessions, and load testing. Follow-up evaluation currently runs on company administrator lifecycle requests rather than an independent scheduler. Blocked webhooks return 403; provider retry/retention policy must be confirmed if inquiry capture during suspension is required.

Retain the complete platform/tenant storage directory and SETTINGS_ENCRYPTION_KEY. Quiesce the app before npm run backup:tenants -- <new directory>; individual SQLite backups are consistent, but multiple tenant files are not a single atomic snapshot. Test restore on the real persistent volume. For rollback, stop the server and restore matching application code and pre-change database together, while preserving newer data separately. No deployment was performed.

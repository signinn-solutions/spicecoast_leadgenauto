Current ownership, subscription behavior and verification are documented in [Subscription and logic audit](SUBSCRIPTION_AND_LOGIC_AUDIT.md). This report records the earlier audit stage.

# Production audit and hardening

Scope: shared SpiceCoast workspace; super admin admin@signinn.in; role-based access, provider key administration, quotas, 60-result requests, CRM pagination, search keyword changes, outbound and inbound mail, deployment.

Baseline: clean working tree; 17 isolated tests passed. These use provider stubs and do not establish live delivery.

Confirmed defects before fixes:
- Requests above 50 rejected; Google supports up to 60 across three pages.
- Unknown and scraped email addresses mislabeled deliverable.
- Phone presence mislabeled verified.
- Empty live results mislabeled simulated; partial provider errors suppressed.
- No actual CRM pagination despite select-on-page wording.
- One administrator only; no roles, users, revocation controls, key management or audit trail.
- Follow-up recipient override possible; sent follow-up content lost when draft cleared.
- Reviewed reply edits not retained; failed automatic replies cannot be retried manually.
- Inbound processing can overwrite concurrent outreach changes; lifecycle writes lack shared locks.
- Reply draft quota discards inbound inquiries when exhausted.
- Histories silently truncated at 150/200, weakening deduplication and audit.
- Website scraper has no private-network guard or response size bound.
- No durable send state for ambiguous provider acceptance after timeout or process crash.

Implementation and final evidence will be appended below.

## Findings and implemented fixes

| Severity | Finding | Change and evidence |
| --- | --- | --- |
| High | Unverified email marked deliverable | Unknown remains unknown; website extraction must pass Hunter verification; legacy claims migrate to unknown. Regression covers unknown verification and blocked draft generation. |
| High | Follow-up could target a different address | Recipient is bound to saved verified live lead; simulation blocked; sent content preserved. API/service tests confirm mismatched recipients cause zero sends. |
| High | Provider timeout could permit duplicate sending | Durable sending/sent/failed/unknown ledger with per-message dispatch key, conservative retry block and super admin reconciliation. Tests exercise uncertain retry and accepted reply recovery. |
| High | Webhook crash could resend on provider retry | Inbox record persists before AI/transport, message/event IDs deduplicate retries. Failed auto-send can be reviewed and retried after definite transport failure. |
| High | Workspace had no staff roles | Persistent users, one-time activation, scrypt hashes, server-enforced roles, CSRF-protected writes, disabled-account and version-based session revocation, last-admin protection. Role restriction tests use real HTTP requests. |
| High | Scraping arbitrary URLs could reach private services | Public-address DNS validation and connection pinning; private, loopback and link-local targets blocked; redirect revalidation, timeouts and 1 MiB HTML bound. Address/URL guard tests pass; live network behavior is not established here. |
| Medium | Inbound quota discarded messages | Deferred and ignored messages retained; all-messages inbox supports later drafting. Concurrent quota tests now assert both messages survive. |
| Medium | Concurrent mailbox/lifecycle/outreach writes could clobber state | Shared lock order: mailbox → outreach; integration updates also wait for discovery/send work. Existing concurrent-send and mailbox quota tests pass. |
| Medium | 60 requested results rejected | Valid range 1–60; three token-following pages; bounded Google maximum; workspace/account quota clamp with warnings. Test saves exactly 60 unique stubbed results. |
| Medium | Search looked streamed but was a long synchronous request | Persistent background jobs, actual processed counts, incremental saving, retry submission deduplication, recent jobs after reload, restart interruption. No provider pagination token is guessed. |
| Medium | Keyword changes/reruns and empty results misreported | New queries use the submitted keyword; structured rerun fields; duplicate records still excluded; zero results retain live mode; partial failures surface warnings. |
| Medium | No actual CRM page boundaries | Table pages of 10/20/40/60, visible-page selection and page navigation; render smoke confirms 20 visible rows from a 60-record batch. Inbox also pages 20 records. |
| Medium | Shared secrets could not be administered safely | Super admin-only encrypted provider overrides, redacted configured flags, connection checks, no plaintext keys in responses/audit. Encryption reload regression passes. |
| Medium | No outbound budget or opt-out enforcement | Workspace send cap covers every send path, including automation/follow-ups; suppression list and opt-out handling block recipients. Tests cover quota and suppression. |
| Medium | Sent reply edits and follow-up history were lost | Reviewed subject/body retained as sent content; correct original follow-up body saved before clearing draft. |
| Medium | Historic records dropped at 150/200 caps | Removed silent truncation; ledger and audit views bound their display, with persistent history retained. Tests exceed former caps. |
| Medium | Analytics mixed organic inquiries and outbound replies | Organic inquiries no longer count as sends or inflate outbound reply rate; demo messages excluded from lifecycle; negative replies cannot be classified hot. |
| Medium | Local timestamps depended on hosting timezone | New mail timestamps use ISO UTC; daily quotas use configured Asia/Kolkata timezone by default. Historic ambiguous timestamps are preserved. |
| Low | Cached provider clients did not follow key rotation | DeepSeek and SMTP clients rebuild when their credentials change; Hunter pause resets on key rotation. |

## Feature coverage

Reviewed Overview, Prospector, Leads CRM, Outreach Studio, Inbox/lifecycle/follow-ups, Analytics, System Health, authentication, storage, deployment files and the new Administration views. Existing CSV escaping guards spreadsheet formula prefixes. Role restrictions remain authoritative on the server even when UI controls are disabled. Follow-up timing was tested at first due, second due and auto-close boundaries. A WAL-aware SQLite backup was restored and checked in an isolated database.

Provider contract check: Google supports up to 60 results across pages and accepts nextPageToken for continuation ([Google Text Search documentation](https://developers.google.com/maps/documentation/places/web-service/text-search)). Hunter unknown/blocked cannot establish validity ([Hunter verification statuses](https://help.hunter.io/en/articles/6103281-what-are-the-possible-verification-statuses-for-an-email)). Hostinger uses mailbox resource IDs and its current send operation; the old default URL was incompatible ([official Hostinger specification](https://github.com/hostinger/mail-api/blob/main/openapi.json)). Real outbound delivery was deliberately not attempted to saved business contacts.

## Local account and backup

admin@signinn.in exists as super_admin in the local database, awaiting password activation. The one-time link is in .local/super-admin-activation.txt, excluded from Git/Docker. The existing database was backed up to .local/pre-admin-backup-1791623137223.sqlite before provisioning. A local encryption key was generated in ignored .env. Setup instructions: [Access and operations](ACCESS_AND_OPERATIONS.md). None of this provisions an external hosting database automatically.

## Release limitations

This is a substantially hardened candidate for one modest-volume shared business workspace. It is not yet proven production-ready:

1. Read-only Hunter, DeepSeek and Hostinger checks and a one-result Google probe all failed to establish provider connections from this execution environment. The failures do not establish whether credentials are valid or invalid. Verify reachability, credentials, billing/credits and mailbox access from the deployment host.
2. No real email was sent. Confirm the current Hostinger resource ID, actual webhook event shape, sender authentication, reply threading and delivery using a mailbox/recipient you control. Provider acknowledgement is not inbox-placement evidence. Auto-send remains off.
3. No browser surface was available for interactive desktop/mobile or screenshot verification. Component render smoke tests and 21st static review are narrower evidence.
4. Docker is unavailable, so no container build/run was performed. npm audit could not reach its registry endpoint; dependency advisory status remains unverified.
5. One process and one replica are required. Workflow locks and sessions are in memory. JSON dataset rows and client pagination suit modest volume; indexed server-side pagination and normalized data are required before very large datasets or multiple tenants/replicas.
6. Follow-ups are reviewed drafts evaluated when lifecycle is requested, not scheduled sends. Interrupted discovery requires rerunning; saved records deduplicate. Webhook retry safety depends on a stable message/event ID. The absence of provider idempotency prevents claiming exactly-once delivery.
7. Protect and back up the encryption secret separately, rehearse backup/restore on the actual host, and configure HTTPS/proxy/cookie behavior before enabling staff access.

Local test/build/static-review results and startup smoke evidence are recorded below after final verification.

## Final verification

- Automated suite: **39 passed, 0 failed** (isolated provider/transport stubs; no outreach sent). Includes access control, account activation/revocation, quotas/concurrency, changed keyword searches, 60 candidates across three pages, background jobs, delivery recovery, inbox replies, suppression, follow-up timing, encryption, backup/restore and component rendering.
- Production Vite build: passed.
- 21st static review: four changed UI files, zero findings after replacing the company-name interaction with a native button. This does not substitute for browser accessibility testing.
- HTTP smoke against the final app: health 200; auth session 200 with authentication enabled; anonymous protected API 401; dashboard HTML and built JavaScript asset 200.
- Git whitespace check: passed (only Windows line-ending notices).
- Live provider checks: connectivity failed for all four providers in this environment. Actual credentials, billing, search results, outbound delivery and inbound event shape remain unverified.
- Browser/mobile interaction, Docker execution and dependency advisory scan remain unverified for the reasons above.

The local development server uses port 5100. The initial super admin is provisioned locally only; open the private activation file and choose a password. No deployment was performed.

## Platform tenancy correction

The original shared-workspace interpretation was corrected after the user clarified that Signinn owns the platform and SpiceCoast is a tenant. See [platform migration and boundaries](PLATFORM_TENANCY.md). Platform super admins now use a dedicated console; tenant data, configuration, quotas, jobs and webhook routing are scoped. All existing local dataset bytes and passwords were preserved with a pre-migration backup. Current verification: 48 tests passed, production build passed, six-file static UI review passed. The earlier statement that tenant isolation was absent is superseded; large-scale deployment, real provider and browser checks remain open.

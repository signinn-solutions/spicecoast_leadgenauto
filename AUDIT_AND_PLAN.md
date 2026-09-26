# Audit, fixes, and remaining validation

Updated: 2026-09-26. Scope: the existing single-tenant lead-generation application. Preserve the user's latest component-based dashboard design; improve correctness and usability without adding business features. No multi-customer tenancy or public signup.

## Assessment

The dashboard/sidebar structure is a good fit for discovery ? lead review ? outreach ? inbound handling. **Architecture direction: 8/10. Release evidence: 7/10.** These are engineering judgments, not a visual approval or certification. The app has material improvements, but calling everything perfect would be wrong: browser, Docker, real-provider, and restore verification remain unperformed.

## Execution plan and evidence

1. Inspect the latest user edits and map API, storage, provider, and screen contracts. Done.
2. Run parallel Sol agents for backend/storage, controller/test review, and unused-code cleanup. Done; subsequent bounded passes reviewed keyboard usability and state consistency.
3. Fix concrete faults while preserving the visual design and legacy data. Done for the findings below.
4. Run isolated regression tests, production build, dependency audit, and deterministic UI review. See results below.
5. Document operational constraints and the exact remaining release checks. Done here and in docs/DEPLOYMENT.md.

## Findings and disposition

| Severity | Verified issue | Resolution |
| --- | --- | --- |
| Critical | Dashboard data and send routes were unauthenticated. | Single-admin login, scrypt password hashing, opaque expiring sessions, logout revocation, CSRF and Origin checks. Production fails closed without configuration. |
| High | Local unauthenticated development API could be exposed through permissive origins/hosts. | Development bypass requires loopback socket and localhost Host; foreign browser Origins are rejected. |
| High | Send endpoints could dispatch simulated, orphaned, or unverified contacts. | A matching saved live lead and verified email are required. Simulated inbound inquiries cannot be sent either. |
| High | Concurrent regeneration, edit, search, and send could overwrite outreach state. | Shared outreach history lock covers async read/modify/write operations. Sent drafts reject regeneration before AI is called. |
| High | Inbound processing and manual reply sends used unrelated locks. | Shared mailbox history lock prevents concurrent updates from losing records/status. |
| High | Refreshed leads showed stale embedded drafts after edit/send. | GET leads joins canonical outreach history by lead ID, including current body and sent status. |
| High | Provider calls could hang or report an explicit provider failure as success. | Bounded timeouts, explicit Hostinger failure checks, SMTP accepted-recipient checks, generic provider errors. |
| High | Nodemailer dependency had known high-severity advisories. | Upgraded to 10.0.10; registry audit reported zero vulnerabilities after installation. |
| High | Docker build included operational JSON records and secrets risk. | Build context excludes environment files, databases, keys, and six operational JSON files; removed seed data copy. |
| High | Webhook retries could create duplicate replies. | Explicit provider message/event IDs are deduplicated against retained history. No-ID events and long-term retention limits remain below. |
| Medium | AI metadata objects could crash text rendering; templates claimed unverified certifications. | Normalize metadata types, label template provenance, remove unsupported certification claims, instruct model against invented commitments. |
| Medium | Failed refreshes left Online status and polling requests could overlap. | HTTP failures update connectivity, show errors, use timeouts, and schedule polling after completion. |
| Medium | Demo quota copy contradicted server accounting; unknown leads counted as live. | Server-based quota calculation and accurate simulation copy; only explicit live sources count toward verified/live metrics. |
| Medium | CSV quoting did not stop spreadsheet formulas. | Formula/control-prefixed cells are neutralized in addition to normal CSV escaping. |
| Medium | Dialogs and mobile navigation lacked complete keyboard behavior. | Shared focus trap, Escape, opener restoration, scroll lock, mobile inert state, accessible controls. |
| Medium | Mode cards and dashboard cards were mouse-oriented; website URLs were trusted. | Native mode buttons / keyboard handlers and an http(s)-only website URL helper. |
| Medium | Clipboard errors and save errors looked successful. | Clipboard reports success only after copying; failed draft save keeps editor open. |
| Medium | Health view implied credentials were tested connections. | Labels say Configured; missing webhook secret is correctly shown as blocked. |
| Medium | Error responses exposed internal details and malformed JSON became HTTP 500. | Generic server errors; explicit 400 for malformed JSON and 413 for oversized bodies. |
| Low | Inactive Python stack, unused TS files, and abandoned tenant context obscured project structure. | Removed after reference checks. See docs/CLEANUP.md. Active code remains JavaScript. |

## Verification results

- Production frontend build passes, with a separate lazy analytics chunk and no Vite oversized-chunk warning.
- Isolated tests cover auth/cookies/CSRF/logout, Host/Origin denial, SQLite import/persistence, quotas, concurrent workflows, invalid and simulated sends, canonical draft state, provider response handling, and malformed AI metadata.
- Dependency audit: zero known vulnerabilities after the mail dependency upgrade. Audit results are time-sensitive, not a guarantee of security.
- 21st deterministic review: keyboard/dialog findings corrected. Remaining hardcoded-color suggestions are design-token recommendations, not verified runtime defects.
- No live provider requests or real email sends were used for testing. Existing operational data and .env were not modified.
- Browser inventory was empty; no rendered desktop/mobile or screen-reader QA was possible. Docker CLI was unavailable; image build not verified.

## Required deployment checks

1. Configure ADMIN_EMAIL and ADMIN_PASSWORD_HASH, HTTPS, provider secrets, and the persistent database path. Do not expose a development-mode instance through a reverse proxy.
2. Run one Node process/instance. Locks, sessions, and login throttling are process-local. A restart signs users out.
3. Build the Docker image in the deployment environment and confirm persistent-disk permissions for the node user.
4. Back up the database and perform a restore exercise. Stop the process before filesystem copies, or use SQLite's online backup facilities.
5. Validate desktop/mobile layouts, keyboard navigation, focus restoration, and error/empty states in a connected browser.
6. Validate Google/Hunter/AI results, the actual webhook payload, and one deliberately approved outbound destination with real provider configuration.

## Known limits and suggestions

- SQLite currently stores JSON datasets, preserving the existing interface and migration safety. Normalize records and move quota/state transitions into database transactions before larger-scale use; do not imply the current design supports replicas.
- Sending and persistence are separate operations. If a provider accepts a message but the response is lost, or the process crashes before saving status, automatic exactly-once delivery cannot be guaranteed. Check provider sent history before retrying an ambiguous send.
- Webhook deduplication requires stable provider IDs and currently covers retained mailbox history (150 records). Outreach history retains 200 records. Plan durable event IDs and archival retention if this business requires a permanent audit trail.
- Browser source data that lacks explicit live provenance is excluded from live sending and metrics. Review legacy records rather than silently marking them verified.
- The app is branded for SpiceCoast and provides one administrator. Team roles, customer tenancy, billing, campaigns, and other new capabilities were deliberately outside this pass.
- A full TypeScript conversion is deferred. Introduce typed/validated API contracts plus a mandatory type-check stage before migrating modules; unused declarations alone do not improve safety.
- Keep the user's current visual direction. Future polish should simplify technical copy and consolidate color tokens after browser QA, rather than replace the design again.

## References checked

[Nodemailer SMTP transport](https://nodemailer.com/smtp) documents TLS and transport safeguards. [Node release status](https://nodejs.org/en/about/previous-releases) lists Node 24 and 22 as LTS and Node 20 as EOL; the Docker runtime was updated to Node 24.

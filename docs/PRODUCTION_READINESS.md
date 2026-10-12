# Production readiness audit — 12 October 2026

Verdict: not ready for public production release. Suitable for supervised testing on one application instance. Readiness assessment: 6/10 (engineering judgment, not a benchmark).

## Confirmed release blockers

1. `server/services/userService.js:32`: startup seeds active accounts with fixed passwords without a production guard. Remove production default-password provisioning and rotate existing seeded credentials before exposure.
2. `render.yaml:34`: deployment still defines obsolete AI variables and omits Groq credentials/model and the Hostinger mailbox resource ID. Local `.env` is excluded from the image, so local fixes do not configure the deployed service.
3. `server/services/followUpEngine.js:49`: follow-up templates claim current container allocation and exact grades not established by the website-based brand context. Correct these before approving real follow-ups.

## Reliability and data risks

- Sending precedes database persistence. Process locks prevent simultaneous duplicates in one process, but a crash after provider acceptance and before persistence can allow a retry to send again. No durable provider reconciliation was established.
- `followUpEngine.js:380`: the stored follow-up draft is cleared before history reads its subject/body. If caller omits overrides, sent history loses the content that was dispatched.
- Sessions, login attempt limits and search jobs are process-memory maps. Restarts lose sessions/jobs; multiple replicas do not share locks or limits. Deployment must remain single-instance until this is addressed.
- Contact and follow-up dates use server-local timezone without an explicit deployment timezone. UTC hosting can differ from the expected Asia/Kolkata date.
- `/health` returns a static process response, not current storage or provider readiness.
- Repository-tracked JSON histories require a review before sharing the repository. Local storage currently includes simulated leads and historical drafts with incomplete origin metadata; migration/cleanup needs a backup.

## Verification

- Full suite: 42 passing, zero failing. Production frontend build passes.
- Groq sample drafting and Hostinger read-only mailbox authentication were previously verified live.
- Actual recipient delivery, inbound webhook/reply matching, browser/mobile QA, Docker startup, backup restoration and restart recovery remain unproven.
- Local settings are development mode with config-admin authentication unset. This is local state, not evidence about a deployed server.
- Dependency vulnerability check requires a successful registry response; record its final outcome separately.

The audit changed no application behavior and sent no emails.

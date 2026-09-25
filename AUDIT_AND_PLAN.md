# SpiceCoast app audit and remediation plan

## Scope and decision

Keep the existing lead discovery, email enrichment, outreach draft, mailbox, webhook, simulation, analytics, and CSV workflows. Improve their correctness and presentation. The follow-up request adds a proper dashboard/sidebar flow and a database. The app is currently a single-organization operations tool; calling it a production SaaS is premature because there is no user identity, organization isolation, or protected API access.

**Current readiness: 6/10 as an internal tool; 2/10 as a public SaaS.** The UI builds and isolated workflow tests pass. Provider integration remains unverified. Unprotected API routes and absent tenant isolation are public release blockers.

**TypeScript decision:** Keep JavaScript for this pass. A whole-repo conversion would touch every interface before the behavior and data boundaries are stable. Add TypeScript later with typed API contracts and a strict check once those contracts are settled.

## Verified baseline

- React 18/Vite frontend in `src/`; Express backend in `server/`; production Express serves Vite `dist/`.
- `npm.cmd run build` passes. The main bundle is about 594 kB before gzip and Vite warns about chunk size.
- The original `server/test/test_endpoints.js` reported 12 passing checks but wrote tracked JSON data and attempted DeepSeek calls. It has been replaced by a compatibility entry to the isolated workflow suite.
- `package-lock.json` had user changes before this work and must be preserved.
- Older Python scripts remain at the root; the Node/React app is the active runtime per `package.json` and README.

## Issues and recommendations

| Priority | Finding | Evidence | Action |
| --- | --- | --- | --- |
| Release blocker | API routes expose leads, mailbox records, and send actions without authentication or tenant isolation. | `server/routes/apiRoutes.js` mounts routes without an auth guard. | Define identity, sessions, organization ownership, and protected API access before public multi-user deployment. This needs a product contract and is outside this existing-feature cleanup. |
| Release blocker | Original JSON files at repo root held operational records and counters. | Original `server/config/env.js` pointed persistence to root JSON files. | SQLite now imports them and keeps them as rollback source. Multi-process write safety and operational backups remain. |
| High | Simulation and delivery states can mislead operators. | `server/services/leadFinderService.js` can fall back to simulated leads; `server/services/mailService.js` simulates without credentials. | Make mode and delivery results explicit; never label simulated mail as sent. |
| High | Tests could spend quota and change production-shaped data. | The original endpoint script posted search and inbound mail against configured files. | Done: both test entry points now use temporary data paths and block network calls. |
| High | Frontend saved lead history only in browser storage despite `/api/leads` existing. | Original `src/App.jsx` loaded local storage for leads and history. | Done: API history is the source of truth; current search results remain visible in the session. |
| High | Hard-coded quota and webhook presentation could disagree with runtime configuration. | Original UI used a 50-lead constant and a fixed Cloudflare tunnel URL. | Done: quota comes from server status, webhook copy uses the current origin, and the badge reflects API reachability. |
| Medium | Accessibility and responsive behavior were weak. | Original UI had clickable `div` controls, unlabeled inputs, and oversized tabs. | Improved: labeled fields, semantic search controls/history, focus styles, responsive shell, and dialog labeling. Full screen reader/browser QA remains. |
| Medium | The frontend was one 1,600-line component with embedded CSS. | Original `src/App.jsx`. | CSS now lives in `frontend/src/styles.css`; further component extraction is optional after UI QA. |
| Medium | Legacy Python scripts and tracked runtime data obscure the active app boundary. | Root scripts and JSON files versus `frontend/` and `server/`. | Active frontend/backend ownership is documented; legacy files remain intact. |
| Medium | Documentation claims production readiness before key controls exist. | README introduction and architecture section. | Replace with honest setup, test, and deployment limitations. |

## Execution plan

1. Map routes, data flow, provider fallbacks, and UI flows. Establish build and endpoint baseline. **Done.**
2. In parallel: improve UI and frontend data handling; fix backend validation and result truthfulness; replace unsafe test behavior with isolated verification. **Done.**
3. Align project layout and scripts with explicit frontend/backend boundaries, update docs, and preserve deployment entry points. **Done.**
4. Run clean build and isolated tests; inspect the UI at desktop and mobile widths if browser tooling is available. Review the combined diff for API and data compatibility. **Build, tests, and HTTP smoke checks done; browser UI tooling unavailable.**
5. Record remaining release blockers here. Do not claim production SaaS readiness until identity, tenant isolation, and durable data storage are addressed. **Done.**

## Remaining release work

- Add authentication and organization ownership checks to all dashboard and send endpoints. The present API must stay behind trusted access.
- Configure and rotate a webhook secret in production. An empty token now rejects webhook POSTs.
- Keep one API process until cross-process quota and history updates use database transactions. Preserve the JSON source files for rollback and add a routine database backup procedure before deployment.
- Verify Google Places, Hunter, DeepSeek, Hostinger/SMTP, and webhook payloads with live credentials in a controlled environment.
- Run desktop/mobile visual and keyboard QA when a browser is available. The production bundle still exceeds Vite's 500 kB warning threshold.

## Follow-up implementation plan

1. Redesign the frontend shell into a responsive sidebar with an overview and the existing lead workflow. Keep search, result filtering, CSV, outreach review, mailbox, and analytics reachable. **Done.**
2. Add SQLite persistence behind the existing storage interface. Import the current six JSON datasets exactly once; keep originals as rollback copies. **Done.**
3. Add isolated migration and persistence tests, rerun build/API smoke checks, and compare migrated record counts (baseline: 140 leads, 41 searches, 140 seen places, 17 mailbox messages, 35 outreach records). **Done: local SQLite import matched every baseline count and left all legacy files byte-for-byte unchanged.**

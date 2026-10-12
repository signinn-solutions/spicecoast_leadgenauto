# Page-by-page UI audit — 12 October 2026

## Hunter integration and scraper hardening follow-up

Hunter requests now use a shared client with header-based authentication, bounded timeouts, request pacing, and retries for pending verification, throttling and transient failures. Discover pagination preserves returned filters and reports partial results when another page is unavailable. Domain Search ranks candidates and verifies up to three emails instead of accepting only the first. Published phone numbers are retained; searched locations are stored separately from actual company addresses. The admin connection check tests both account authentication and Discover access without changing the selected engine.

Scraper host resolution now has a bounded timeout in addition to its crawl and MX budgets. Search results show warnings for unreadable websites and partial Hunter enrichment. Scraper mode continues to make zero Hunter calls.

Validation: all 38 tests pass, production build passes, static UI review reports zero errors/warnings, and the diff whitespace check passes. Tests mock provider responses, including pagination restrictions and pending email verification. A live account connection attempt failed at the network layer, so the configured Hunter key, plan and real-world search coverage remain unverified.

## Current discovery policy: scraper default, optional Hunter

The intended workflow is now **Google Places → protected website/contact crawler → CRM**, with no Hunter requests in scraper mode. Hunter is a separate optional discovery engine enabled manually by Superadmin. Neither engine automatically switches to the other. New storage defaults to scraper; previously saved admin selections are retained. Regular users cannot change the engine via legacy toggle routes or override it through search request fields.

Scraper improvements: capture published `tel:` and structured-data phone numbers; continue to contact pages when the homepage only provides a general mailbox; choose higher-ranked usable email candidates; retain directory phone numbers if a site blocks crawling; save contacts with either phone or email. Removed the unprotected secondary HTML fetcher. Website requests share a 20-second crawl budget and MX lookups have a three-second timeout with expiring positive/negative/unknown cache entries.

Scraped email status is `mx_valid` only when an MX record is confirmed, `unknown` when DNS is inconclusive, or `invalid` when no MX is found. This does not assert that the individual mailbox accepts delivery. MX-confirmed published contacts can be selected, drafted and sent through the existing reviewed outreach flow without Hunter. CRM labels and analytics distinguish MX-confirmed published emails from mailbox-verified results.

Validation: full suite 37/37 passed, with subsequent focused checks covering the final phone/status and MX-confirmed outreach changes. Build passes. Mocked tests cover zero Hunter calls with its key configured, new-workspace defaults, admin-only switching, website phones, contact-page procurement email selection, inconclusive MX, blocked sites with known directory phones, private-host rejection, manual engine behavior, and CRM rendering. Live website coverage remains unmeasured. JavaScript-only websites, unpublished contacts and sites blocking crawlers can still yield no usable contact; the implementation cannot promise perfect coverage.

## Demand-driven performance follow-up

Removed the four-second workspace poll, which requested six endpoints per cycle (approximately 90 requests/minute while idle). Reads now happen on navigation, explicit Refresh/Retry, or successful actions. A workspace-scoped 60-second cache deduplicates in-flight reads; expiration alone does not trigger network activity. Mutations invalidate affected resources and reload only those used on the visible page. Responses started before a mutation cannot overwrite newer state. Bulk operations refresh once after their batch rather than after each item or again when closing the result dialog.

| Page / tab | Resources fetched when missing or stale |
| --- | --- |
| Overview | Status, leads/history, mailbox quota/settings, outreach, messages |
| Prospector | Status/quota/engine |
| Leads CRM | Status, leads/history |
| Outreach | Status, leads/history, mailbox settings, outreach |
| Mailbox | Status, mailbox settings, messages, lifecycle |
| Analytics | Status, leads/history, outreach, messages |
| Superadmin | No workspace endpoint calls |
| Admin Overview | Admin health, users and recent audit events |
| Admin Users | Admin health and users |
| Admin Health & Integrations | Admin health |
| Admin Audit | Admin health and audit events |

Search progress streaming remains active only for a started job. Its fallback polling waits for each response before scheduling the next request and stops on completion/failure. Initial page data displays loading/retry rather than briefly implying an empty result set.

Pages, dialogs and analytics charts are dynamically imported. The main JS entry changed from approximately 798 KB (165 KB gzip) to 398 KB (117 KB gzip); additional page chunks load as needed. This is an artifact-size improvement, not a measured browser latency claim. The production build no longer emits the previous large-chunk warning.

Validation: production build, four request-cache regression tests, existing markup rendering test, diff whitespace check and static UI review pass. Tests cover zero workspace calls for admin, page-specific resource sets, fresh-cache reuse, idle expiration, concurrent refresh deduplication, retry after failure, invalidation without hidden-page reads, stale-response suppression and shared admin resources. Browser Network/timing verification remains unavailable. External changes such as new inbound mail now appear on Refresh or a later stale page entry; there is no continuous automatic inbox refresh.

## Superadmin screenshot follow-up

Corrected a regression in demand loading: Overview displayed recent audit activity without requesting its data. Overview now loads the audit feed once as a page dependency, sharing the cached results with Audit History. Counts use the total from system metrics rather than an unloaded or capped array. Genuine empty activity has an explicit message. No interval polling was added.

The page now uses defined card typography, shorter section/tab labels, responsive KPI layouts and one shared tab style. Removed the tab row's extra bottom margin and repeated signed-in badge. The page heading follows the active section; runtime environment comes from the server instead of a hardcoded Production label. Engine buttons expose their selected state, and user action icons include the target account in their accessible names. A section whose required data has not loaded displays loading/retry rather than fabricated zero counts.

Verification: build and eight focused admin-action, role-access, caching and markup tests pass. Static Superadmin review has zero errors/warnings (32 informational token suggestions remain). Tests exercise user create/edit/status/delete, session revocation, engine selection, daily/Hunter quota resets, missing provider configuration, audit writes and on-demand tab requests. Real browser interaction/layout and external provider connectivity remain unverified; there is no claim that live delivery or every provider account works.

Follow-up consolidation: System Health is now part of Superadmin rather than a separate sidebar destination. System metrics, engine controls and quotas remain in Overview; provider diagnostics and inbound webhook configuration are under Health & Integrations. User access and audit tabs remain available. The standalone Health component is retained as unused source. The build and static component review pass after this merge.

## Discovery and Superadmin functional follow-up

- Hunter Discover used GET with query-string filters rather than the documented POST JSON request. Its HTTP errors were swallowed as empty results. The request now follows [Hunter's API reference](https://hunter.io/api-documentation), includes the requested location in the natural-language query, and reports provider failures. Google fallback is attempted when configured, and fallback failures are also surfaced.
- New results with a published phone **or** email are persisted. Businesses with neither are counted separately. Unknown email verification remains unknown instead of being labeled deliverable. Phone-only records remain usable in CRM without qualifying for email dispatch.
- Hunter and scraper searches wrote provider names into `source`, while CRM filters and email guards expected `live`. New records use `source: live` with separate discovery-engine metadata. Reads normalize the three known historical provider source values; unknown and simulated sources remain unchanged.
- Empty live searches remain live in history. Zero-result banners distinguish duplicate contacts, missing contact details, and no new contacts; none show a successful verified-extraction message. The quoted old success text is absent from source and the rebuilt frontend.
- Search requests now use the persisted admin engine instead of overriding it with a hardcoded client default. The client refreshes its displayed engine from server status.
- Admin data loads check every response before applying a snapshot. Initial loading, retry, and stale-snapshot error states replace empty/falsely operational metrics.
- Quota resets now pass the correct storage arguments and use the same local date as usage tracking. Invalid reset types and engine values are rejected. Failed resets display errors and pending actions are disabled.
- User suspension, deletion, role changes and password resets invalidate existing database-user sessions. Server-side checks prevent changing one's own role or suspending one's own account. Dialogs remain open during pending submissions.
- Provider errors display their actual message, provider checks cannot overlap, and Hostinger configuration checks explicitly do not claim verified connectivity or delivery. Hunter account usage reads the nested search quota fields. Audit counts use the actual API key; CSV export follows current filters, escapes all fields and releases its temporary download URL.

Validation: full suite **31/31 passed**. After the final engine-wiring and label changes, the seven focused admin/auth/discovery/rendering checks also passed. Production build and diff whitespace checks pass; static review remains at zero errors/warnings. New mutation tests use temporary storage and mocked external providers. Frontend markup tests prove empty/result messages, phone/email listing and initial admin loading, but do not replace browser interaction tests. No live provider account connectivity or successful real-world search was verified. A restarted/redeployed server and refreshed browser are required to use updated runtime code.

Scope: all eight application views, sign-in, shared navigation, lead drawer, outreach review, bulk dispatch, and admin dialogs. Findings are based on component composition, styles, navigation logic, and static review. No connected browser was available, so desktop/mobile screenshots and live interactions have not been verified.

Source-level assessment before fixes: **6/10** (subjective). The application has reusable components and useful workflows, but duplicated controls, inconsistent spacing, long introductory copy, fixed-width grids, and incomplete dialog semantics reduce clarity. An after-fix visual score requires browser review.

| Page / surface | Finding | Implemented change |
| --- | --- | --- |
| Overview | Promotional hero copy competes with operational metrics; horizontal pipeline needs scrolling on phones. | Shorter task-focused introduction; mobile pipeline uses a two-column grid; shared panels use smaller mobile padding. |
| Prospector | Page title repeats header; numerous segment chips push location and submit controls downward; copy overstates verification. | Removed repeated title; buyer presets use a native expandable section; shorter search and result labels describe finding contacts rather than guaranteeing verification. Quota and result actions remain visible. |
| Leads CRM | Search and sort lack explicit accessible names; toolbar sizing is fragile at narrow widths. | Named search, clear, and sort controls; flexible toolbar, full-width mobile search, wrapping scope controls. Export and outreach selection actions retained. |
| Outreach Studio | Queue banner and toolbar both expose bulk send; local Sync duplicates workspace refresh; bulk dialog lacks focus containment. | One bulk-send entry in toolbar; one workspace refresh; bulk dialog uses shared focus management, accessible title, close label, and guarded Escape handling during dispatch. Card grids fit available width. |
| Mailbox: Sent / Replied / Follow-up / Hot leads / Closed | Summary and toolbar add margins on top of parent gaps; refresh repeats header; simulator fields have unassociated labels; hot-lead cards have a 380px floor. | Removed duplicate margins and refresh; labels connected to simulator fields; simulator close named; tabs wrap; hot-lead grids shrink below their original minimum. All lifecycle states and actions retained. |
| Analytics | Second page title repeats header; historical searches add extra top spacing; provider-specific labels are inaccurate when another discovery engine runs. | Removed redundant introduction and extra margin; changed live-contact labels to avoid claiming a specific provider. Geography and deliverability remain separate analyses. |
| System Health | Navigation guard makes page unreachable for superadmins; switch and callout button do the same thing; extra top margins accumulate. | Allowed the existing admin Health view; retained the labeled engine switch and removed duplicate switch action; removed extra margins; long integration details and webhook URL can wrap. |
| Administration: Overview | Large introduction and badges compete with useful controls; grid minimums exceed narrow available width. | Shorter introduction; removed extra header margin; responsive grid minimums are capped by available width; header workspace refresh hidden because admin has its own refresh. |
| Administration: Users | Create action repeated globally and in user panel; dialog backdrop/container click handlers produce six static interaction errors. | Global Create hidden while Users tab is active; dialogs use pointer-only backdrop dismissal, proper roles/titles, focus containment, Escape and focus return; associated field labels and named filters. |
| Administration: Integrations | Cards use fixed minimum widths and lengthy status details. | Grid tracks can shrink to container width; shared text wrapping and panel spacing applied. Provider tests, engine controls and quota reset actions preserved. |
| Administration: Audit | Grid sizing and long event values risk clipping; search lacks an explicit accessible name. | Responsive grid sizing; named audit search; existing table scrolling and export retained. |
| Sign-in | Background and shadow reference undefined tokens. | Uses existing base background and large shadow tokens; retains labeled credentials and error states. |
| Header / Sidebar | Discovery and sign-out actions repeated; header exposes mailbox details everywhere and a webhook copy action calls an undefined callback. | Sidebar uses one Prospector navigation entry and header owns sign-out; removed broken webhook action (working copy remains in Health); reply-mode control appears on Mailbox; compact header titles and responsive identity badge. |
| Lead detail drawer | Pitch editor labels are not connected to fields. | Associated subject/message labels; shared dialog controls have larger target areas. Existing copy, save, send confirmation, focus trap and Escape behavior retained. |
| Outreach review modal | Header/actions and recipient details can crowd small screens. | Shared wrapping for header/footer/actions and recipient text; reduced mobile padding. Existing save, preview and dispatch confirmation retained. |

Shared adjustments: 24px desktop / 20px mobile page gaps; 16px mobile panel padding; constrained long descriptions; flexible grid tracks; darker faint/status text; existing reduced-motion rules preserved. Functional metrics and tabs were retained because repeated values with different operational contexts are useful rather than redundant.

Verification: production build and all **28 existing tests** pass; `git diff --check` passes. The existing tests exercise server behavior, not rendered frontend interactions. The deterministic component review reports **0 errors, 0 warnings**, with **68 informational hardcoded-color suggestions** remaining. These suggestions are not an accessibility certification. The build still reports a large JavaScript chunk warning.

Outstanding visual QA: inspect all views at 375px, 768px, 1024px and 1440px, including long names/URLs, populated and empty tables, browser zoom, keyboard traversal, reduced motion and sending/loading states. Small inline controls and hardcoded admin colors need a further visual pass before claiming comprehensive accessibility compliance. The app currently implements a light theme; dark-theme compliance was not assessed.

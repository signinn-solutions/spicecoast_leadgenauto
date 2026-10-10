# Website contact discovery and optional Hunter

Reviewed on 10 October 2026. Prices below are the currency and annual billing terms displayed by the providers; taxes, conversion fees and future price changes are excluded.

## Costs beyond existing hosting

| Approach | Additional provider fee | Tradeoff |
| --- | --- | --- |
| Bounded public website crawler | Estimated $0 in new API subscriptions if existing hosting capacity is sufficient | Finds published contacts only. Some websites block bots or require JavaScript. Maintenance takes time. |
| Hunter Free | 50 credits per month | Small trial volume. |
| Hunter Starter | €408 paid annually (€34/month equivalent); 24,000 credits per year | API search fallback and verification. |
| Hunter Growth | €1,248 paid annually (€104/month equivalent); 120,000 credits per year | More capacity than the illustrative 60-business-per-day workload needs. |

Sources: [Hunter pricing](https://hunter.io/pricing), [Hunter API credit rules](https://help.hunter.io/en/articles/1970956-hunter-api).

The current All-in-one API charges one credit per block of 1–10 addresses returned by Domain Search and 0.5 credits per email verification. The application requests at most three addresses per Hunter search, staying within one block. Data Platform plans use different credit pools; check the actual account plan before budgeting.

For an illustrative workload of 60 new businesses per day for 30 days (not an app daily ceiling), the upper planning example is 1,800 businesses. If every business yields one address:

- Verification only: 1,800 × 0.5 = 900 credits.
- Hunter search and verification for all: 1,800 × 1.5 = 2,700 credits.
- Scraper first, with 40% requiring a successful Hunter fallback: 720 + 900 = 1,620 credits.

These are assumptions, not measured coverage. Without any Hunter usage the contact discovery API cost is zero. Repeating manual verification consumes more credits; verification is optional and never runs when Hunter is disabled. The 40% fallback figure is illustrative, not a prediction. Starter's 2,000-credit monthly equivalent is insufficient for the all-Hunter example sustained across a year.

Google Places business discovery, optional DeepSeek generation and mailbox sending remain separate. Their charges do not disappear when Hunter is disabled. Actual Google billing depends on the requested fields, billing region and aggregate project usage; configure provider budgets and quotas. No paid browser, proxy or CAPTCHA service is required by this implementation.

## Hostinger capacity

[Hostinger's current hosting limits](https://www.hostinger.com/support/6976044-parameters-and-limits-of-hosting-plans-in-hostinger/) list the Unlimited plan with five Node.js websites, two CPU cores and 3 GB RAM. Older plans may differ. Check the actual account in hPanel; this workspace cannot establish the purchased plan's capabilities. Unlimited bandwidth does not mean unlimited CPU or memory.

The crawler uses HTTP requests rather than a browser engine. It adds load to the existing Node process and uses SQLite for a bounded cache. The estimate assumes the existing plan can run the app, its native SQLite dependency and persistent writable storage. If that fails or resource limits are exceeded, upgraded hosting is an extra cost; no fixed upgrade price is assumed.

[Hostinger connectivity support](https://www.hostinger.com/support/which-web-standards-and-connectivity-features-are-supported-at-hostinger/) lists outbound port 25 as blocked for web/cloud hosting. This implementation does not use SMTP mailbox probing. HTTP crawling cannot replace a mailbox verifier.

## Operating the application

Signinn super admin: select the company, open **Integrations**, save a Hunter key if desired, and enable **Hunter fallback and email verification**. Hunter is disabled by default, including when a key is stored. Existing keys are preserved. Company admins and viewers cannot change provider settings.

When enabled, the application scrapes first. Hunter searches only when the crawler returns no email candidates, then verifies the selected address. HTTP 429 pauses calls for one minute; HTTP 402 pauses them for one hour. The pause is tied to the provider key. Website discovery remains available.

Published addresses are stored as **unknown** internally and displayed as **Unverified**. The CRM has a Published emails filter. Lead details show the source page and alternate candidates. CSV export includes discovery source and source-page URL. Existing verified records keep their current status.

Discovery and export work without Hunter. Cold-email draft generation, sending and follow-ups still require a verified email under the application's existing policy. There is no free automatic substitute for that proof. Enabling Hunter allows verification of saved addresses; inbound reply sending retains its existing behavior.

## Crawler limits and behavior

- Up to six page attempts per business, 15-second total budget, five-second request timeout, one MiB response limit and three redirects per resource.
- Crawl only the business host and its www variant. Reject private addresses, credentials, unusual ports, off-site redirects and HTTPS downgrades. DNS results are checked and pinned to the socket.
- Check robots.txt separately for each origin. Denial and unavailable policies fail closed; 404/410 allow crawling. Support user-agent groups, wildcard paths, longest-match precedence and Allow ties. Crawl-delay directives conservatively increase pacing even when specified for a different bot.
- Follow published contact/about/team/impressum links, plus common contact paths. Continue after homepage matches so a generic footer address does not prevent discovery of a better contact.
- Extract mailto links, HTML entities, simple [at]/[dot] obfuscation, split inline tags, structured email text and Cloudflare data-cfemail attributes. Reject placeholders, obvious asset strings and no-reply addresses. Prefer company-domain contacts and common business inboxes.
- Store up to 20 candidates with their source pages. Successful results cache for seven days; empty/error results cache for one hour. Each tenant database has its own cache, capped at 2,000 entries; raw HTML is not persisted.

This crawler does not execute JavaScript, bypass bot protections or promise a fixed success rate. Scraped publication, correct syntax and domain DNS records do not establish mailbox deliverability.

## Validation

Automated tests cover extraction, robots policies, crawl bounds, private address rejection, redirect policies, tenant cache separation, discovery without Hunter, disabled-key behavior, optional paid fallback, credit exhaustion, source evidence and unverified outbound guards. Tests use isolated databases and mocked providers; no real paid requests or outbound messages are sent.

All 75 automated tests passed and the production build succeeded. The preserved datasets still contain 190 leads and 18 mailbox records, with their dataset checksum unchanged. No real provider requests were made.

A production build and React render checks establish build compatibility, not a complete browser accessibility or Hostinger deployment audit. Real provider quotas, website coverage and hosting behavior require deployment-level validation.

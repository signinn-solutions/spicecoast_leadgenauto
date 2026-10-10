# Discovery limits

The application no longer imposes a default 60-lead daily discovery ceiling. SpiceCoast's Standard plan and company administrator now have uncapped daily discovery. Usage is still recorded, leads still deduplicate, and Google billing and quotas still apply.

Signinn can configure optional daily discovery caps on plans and accounts. In those controls, -1 means unlimited, 0 disables discovery, and a positive integer sets a cap. Both the plan and account must be unlimited to remove all daily app restrictions. New plans and accounts default to -1. Custom finite limits remain available and enforced.

The previous default 60 cap was changed to -1 for the existing Standard plan and SpiceCoast account. Other custom caps were not changed. Provider keys, passwords, roles, subscriptions, leads and mailbox records were preserved. A SQLite backup was saved in .local/before-discovery-unlimited.sqlite before applying the setting changes.

Google Text Search currently returns up to 20 results per page and 60 across all pages for one query. That provider boundary remains enforced. Run different keyword/location searches for additional businesses. The app does not automatically fan out into extra paid searches or promise complete coverage. See [Google Text Search documentation](https://developers.google.com/maps/documentation/places/web-service/text-search) and [Google Places quotas and billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing).

Necessary safeguards remain: subscription and role access, authenticated requests, deduplication, bounded scraper requests and cache, provider timeouts and cooldowns, verification requirements for cold outreach, send quotas, inbound AI draft quotas and seat limits. Scraper cache expiry bounds network load; it does not cap daily discovery count.

Validation: 75 automated tests passed and the production build succeeded. New tests prove discovery beyond 60 daily records, explicit account caps with an uncapped plan, explicit plan caps with an uncapped account, plan validation and readable unlimited UI without Infinity or NaN. These checks use isolated databases and mocked providers and do not incur provider fees.

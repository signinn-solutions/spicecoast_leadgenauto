# Google Places search

The Google search path accepts a positive whole-number target up to `MAX_LEADS_PER_SEARCH`. The daily CRM lead allowance remains a separate limit. Each round chooses one Text Search (New) page and counts a lead toward the target after geographic and relevance checks, deduplication, and contact verification. A full page can produce anywhere from zero to twenty usable contacts. A job can return fewer contacts when coverage or a budget runs out.

Country searches use an initial set of administrative regions. State and district searches start with the relevant districts, cities, or towns. Productive pages compete with untouched areas, and deeper areas are added after a productive query reaches 60 raw results. The built-in regional lists cover India, Germany, the Netherlands, and the UAE. DeepSeek can provide coverage elsewhere and fill gaps in the built-in lists. The dashboard offers Auto, Country, State or region, District, and City. The API accepts the corresponding values `country`, `state`, `district`, and `city` in `geographyLevel`. In Auto, entering `All` or the country name selects national coverage.

## Audit findings

- The previous Google loop passed the correct page token in the usual case. It had a minimum cap of ten pages, accepted repeated tokens and repeated pages, and waited one second between pages even when a full page was productive.
- Text Search fetched both national and international phone fields. Place Details already had zero calls. The Google admin probe used Text Search independently of search jobs and could be triggered repeatedly.
- Raw, deduplicated candidates filled the target before checking geography, relevance, or published contacts. Dropping candidates after enrichment could produce a short result even when another page was available.
- The checked-in path had one location and one literal phrase. It had no geographic subdivisions, alternative-keyword search, Google retries, or React effect that started searches. Job creation had no duplicate-submission control, and the existing search lock could queue identical jobs. There was no cancellation signal, shared Google budget, or durable quota breaker.

## Settings

| Setting | Default | Purpose |
| --- | ---: | --- |
| `MAX_LEADS_PER_SEARCH` | 1,000 | Maximum client target |
| `DAILY_LEAD_LIMIT` | Existing workspace value | Daily CRM lead allowance across engines |
| `GOOGLE_PLACES_PROJECT` | `default` | Stable local namespace for the Google Cloud project. Keep the same label for credentials belonging to the same project. |
| `GOOGLE_PLACES_TEXT_PER_DAY`, `GOOGLE_PLACES_TEXT_PER_MINUTE` | 60, 20 | Text Search attempt caps, including diagnostics and retries |
| `GOOGLE_PLACES_OTHER_PER_DAY`, `GOOGLE_PLACES_OTHER_PER_MINUTE` | 10, 5 | Attempt caps per other Places method |
| `GOOGLE_PLACES_CONCURRENCY` | 1 | Shared in-flight limit. Discovery requests one page at a time under the existing search lock. |
| `GOOGLE_PLACES_REQUESTS_PER_SEARCH` | 60 | Attempt cap across all runs of the same checkpoint |
| `GOOGLE_PLACES_TEXT_COST_MICROS` | 35,000 | Estimated cost of a Text Search discovery page in millionths of a US dollar |
| `GOOGLE_PLACES_SEARCH_COST_MICROS`, `GOOGLE_PLACES_DAILY_COST_MICROS` | 2,100,000 each | Estimated per-search and per-project daily spend caps |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_SEARCH_MODEL` | Empty, `deepseek-flash` | Optional primary phrase, alternative phrases, and geographic planning |
| `GOOGLE_PLACES_CRM_LICENSED` | `false` | Enable only with terms that specifically permit this CRM to persist and use Google listing fields |

The admin health endpoint reports locally reserved attempts, estimated remaining capacity, and circuit state. The daily counter follows Pacific time. Configure the limits against the project's actual Cloud quota and billing plan. Google Cloud is authoritative for other workloads, actual usage, and charges. A Text Search job estimates its ideal minimum at one request per 20 contacts and uses up to 200 recent discovery attempts to estimate practical yield. That estimate informs scheduling without imposing an extra cap. [Google Cloud quotas](https://docs.cloud.google.com/docs/quotas/overview)

## Data and pricing

The default discovery mask includes the Place ID, the minimum fields for business and geographic screening, the business website, and the pagination token. The app persists the Place ID, user-supplied search parameters, counts, request fingerprints, and independently published website contact data. It reads Google listing fields for screening in memory. Google response bodies and page tokens stay out of SQLite. A contract permitting CRM storage can also enable the single international-phone field. Existing CRM records predate these provenance controls. [Google Maps Platform terms, section 3.2.3](https://cloud.google.com/maps-platform/terms) and [Places data policies](https://developers.google.com/maps/documentation/places/web-service/policies)

At the first published paid tier, Text Search Pro, Text Search Enterprise, and Place Details Enterprise are USD 32, 35, and 20 per 1,000 events globally. The corresponding India prices are USD 9.60, 10.50, and 6.00. If at least one accepted business per page needs a website or phone, a single Enterprise Text Search page costs less than a Pro Text Search plus even one Enterprise Place Details request at those tiers. The app uses the single page request and excludes Place Details. Actual cost depends on billing region, SKU, free usage, and volume. [Global pricing](https://developers.google.com/maps/billing-and-pricing/pricing) and [India pricing](https://developers.google.com/maps/billing-and-pricing/pricing-india)

## Pausing and recovery

Google daily-quota responses pause all affected Text Search jobs for the configured project until the next Pacific quota day. Explicit temporary rate limits use the shared cooldown, `Retry-After` or structured retry delay, and up to two budgeted retries. HTTP failures with no available contacts surface as errors. Local caps and cancellation preserve saved contacts and stop further dispatch. Submit the same search after capacity returns to resume a paused or interrupted job. Short-lived pagination cursors are held in memory. After a restart or cursor expiry, the next run continues from untouched tasks, with saved contacts and past attempts carried forward. `GET /api/jobs/:id` can recover the search summary for the submitting user after a restart. `POST /api/jobs/:id/cancel` cancels a running Google discovery job.

Request logs and summaries are printed to the server terminal. SQLite records each reservation before dispatch and checkpoints accepted contacts and per-page counts transactionally. An attempt whose process ended before receiving an outcome still counts against the local budget.

## Reproducing the benchmark

Run `node server/scripts/benchmark-places.js` at the repository root. The script intercepts every outbound request and uses temporary SQLite databases. Use the same script with baseline revision `18aabe2` for the comparison. The dense mock supplies 20 phone-eligible IDs per page and three pages per phrase and region. The repeated mock returns the first page's results and token on every page of a region. The mock uses licensed mode to isolate the scheduler from website crawling and gives both versions the same inputs.

| Mock | Target | Before calls | Before leads | Before time | After calls | After leads | After time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Dense | 20 | 1 | 20 | 35 ms | 1 | 20 | 47 ms |
| Dense | 60 | 3 | 60 | 2,029 ms | 3 | 60 | 20 ms |
| Dense | 120 | 3 | 60 | 2,039 ms | 6 | 120 | 26 ms |
| Dense | 500 | 0 | Rejected | <1 ms | 25 | 500 | 103 ms |
| Dense | 1,000 | 0 | Rejected | <1 ms | 50 | 1,000 | 240 ms |
| Repeated pages | 60 | 10 | 20 | 10,080 ms | 5 | 60 | 20 ms |

Both versions made zero Place Details requests. The repeated-page run used 50% fewer Text Search requests and went from 2 to 12 usable leads per call. In the dense runs the new scheduler reached the theoretical minimum, including at targets the baseline rejected. The wall times are from the local Node.js mock, with no provider latency, website crawling, or minute-budget waits.

## Implementation files

- The Google client and SQLite quota ledger are in `server/services/googlePlacesClient.js`. The geographic and phrase planner is in `server/services/placesSearchPlan.js`. The scheduler and search checkpoints are in `server/services/placesSearchScheduler.js`.
- The existing search and contact workflow is integrated in `server/services/leadFinderService.js` and `server/services/emailScraper.js`. Job submission, cancellation, shutdown, diagnostic calls, and reset handling are in `server/controllers/leadController.js`, `server/controllers/adminController.js`, `server/routes/apiRoutes.js`, `server/services/jobManager.js`, `server/server.js`, and `server/services/resetData.js`.
- The form and job feedback are in `frontend/src/App.jsx` and `frontend/src/components/DiscoveryView.jsx`. The rebuilt `dist/` assets serve these changes through Express.
- Configuration is in `server/config/env.js`, `.env.example`, and `docker-compose.yml`. The benchmark is in `server/scripts/benchmark-places.js`. Coverage was added to `server/test/googlePlaces.test.js` and updated in `server/test/discoveryContacts.test.js`, `server/test/scraperDefault.test.js`, and `server/test/workflows.test.js`.

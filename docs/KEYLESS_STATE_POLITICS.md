# Keyless state political control and legislative records

## NCSL: published state-government control, not an API

- Source: https://www.ncsl.org/about-state-legislatures/state-partisan-composition
- Publication update: **October 6, 2026**.
- `assets/js/ncsl-control.js` contains a carefully attributed snapshot of all 50 states: governor party, lower/upper chamber seat counts, reported legislative and overall state control.
- Nebraska is **unicameral and nonpartisan**, so we do not invent conventional party control. Washington, DC does not have a state governor or a bicameral state legislature, so it is not assigned state-control data.
- Displayed in the existing state AND county panel; on a county view the text explicitly states it is STATE-level control, not county control.
- This is a fixed snapshot, **not automatically refreshed**. Update after NCSL publishes subsequent data; never treat as election-night results or official proof of policy effects. NCSL notes that numerical control can differ from coalition governance.

## Bill Commons: keyless supplementary legislative indexing

- Documentation: https://billcommons.org/docs/api
- Upstream fixed endpoint: `GET https://api.billcommons.org/api/v1/bills?jurisdiction=CA&page=1&per_page=12`
- No provider key is required for public reads. Bill Commons is **not a government agency**; its jurisdiction/session coverage, timing and accuracy vary. It also sources some data from Open States.
- The existing `crimson-mud-d254` Worker collects at most **one state/DC jurisdiction per half-hour slot** in otherwise unused slots 11–47 of the current cron. It rotates across 51 jurisdictions over approximately two days. No new cron, database or API key required.
- D1 storage: existing `COUNTY_DB`, one row per jurisdiction, under `billcommons_<state>`. Invalid responses, empty results and HTTP errors (including 429) never overwrite previously cached records.
- Reader Worker: `GET /api/bills-snapshot?state=CA` reads D1 only; no upstream calls during state/county selection.
- Browser cache requests each chosen state's D1 record at most once during each page session. The same map/card displays up to 12 indexed bill titles/identifiers/statuses linking to the source API's details, with explicit `retrievedAt`, limitations, and pending messages for uncollected jurisdictions.
- **The current source-list endpoint's live response could not be independently reached during implementation.** Mock tests prove the requested URL, schema validation, D1 writes and pending/429 behavior; they do **not** prove that live Bill Commons has returned usable records. Wait for successful collector/D1 rows before marking provider live.

## Verification and deployment

- Code-only Worker updates deployed on November 1, 2026 to both `crimson-mud-d254` and `politics-daily-snapshot`, with original Worker bindings and original cron `*/30 * * * *` confirmed preserved after deployment.
- Browser/Render deployment and individual live source data require separate independent verification. GitHub changes to `index.html`, map and cache still depend on the site's deployment pipeline.
- **Do not modify geographic fill colors or selection effects for political classifications.** State political control is shown as text in the card, never encoded by changing the existing geography-first palette.

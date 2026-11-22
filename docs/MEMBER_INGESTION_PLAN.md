# Congressional member data: operational checklist

The public Congressional Records page is `records.html`. It is a separate product from the County Atlas and Congressional Atlas.

## Architecture

- `crimson-mud-d254`: county/state collector, existing `*/30 * * * *` schedule; no additional member requests on that cron.
- `politics-records-refresh`: separate `*/5 * * * *` schedule. Non-quarter-hour ticks process deterministic six-member FEC finance batches; the 96 finance slots in each 12-hour window provide capacity for a complete congressional roster pass. Quarter-hour ticks remain reserved for secondary source families (committee-network ingestion and Congress.gov sponsorship) so one Worker invocation does not exceed free-tier external-request limits.
- `politics-daily-snapshot`: keyless read-only D1 endpoints `/api/member-legislation?bioguide=...`, `/api/member-finance-detail?bioguide=...` and `/api/member-lobby-network?bioguide=...`.
- Website: never sends provider keys to browsers and never makes upstream provider requests on profile selection. The data is joined by verified Bioguide/FEC IDs and explicitly attributed.

## Data and known limits

1. Congress.gov: up to 30 sponsored/cosponsored measures per member, filtered to the 119th Congress. The older configured `CONGRESS_API_KEY` was 39 characters and returned HTTP 403; the valid existing 40-character `FEC_API_KEY` can also access Congress.gov through api.data.gov cross-agency access. This is a fallback, not a new credential.
2. FEC: campaign summary is sourced from existing official bulk-file crosswalk; detailed cached collector uses Schedule A donation-size and state aggregates, Schedule E independent expenditure totals and optionally reported employer totals for a unique principal committee. *Self-reported employer does not mean employer made a corporate donation*. Categories have limited/partial scope.
4. Senate LDA: the configured official LDA connection responds, but filing search matches do not establish lobbying of a legislator without exact bill, issue and filer links. Do not infer relationships from names.

## Live verification

After a scheduled event, check the `politics-county-snapshots` D1 `county_snapshots` table for the following source prefixes and last-good data:

- `member_legislation_` and `member_legislation_collection_health`
- `member_finance_detail_` and `member_finance_collection_health`

Query `SELECT source,record_count,refreshed_at FROM county_snapshots WHERE source LIKE 'member_%' ORDER BY refreshed_at DESC LIMIT 50;`. Operational health stores sanitized error descriptions but never credential contents. Never confuse deployment or a configured binding with a successful data collection.

On the frontend, validated finance totals may exist even when additional FEC detail is still pending. All unavailable snapshots must be labeled as unavailable, not zero. The list of 160 individual votes stays in the opt-in archive.

## Testing and deployment

`npm test` runs the full Node suite. The focused Congressional Records workflow runs `node --test tests/congressional-records*.test.mjs`, full JS tests (informational due to known unrelated legacy failures), and Python roll-call tests. GitHub merge triggers Render auto-deploy on `main`. **Cloudflare Workers are deployed separately** with existing credential/D1 bindings preserved. Deploy the `politics-records-refresh` Worker with its source module and `politics-gateway.mjs` dependency in the same Worker bundle, preserving its six bindings and existing cron.

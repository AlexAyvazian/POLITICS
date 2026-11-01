# POLITICS — scheduled national collection, local county reads

## Why no Neon database
Cloudflare D1 stores the collected source results in the same Cloudflare account. No separate managed Postgres service or Render API variables are required.

## What happens on a click
**No upstream provider request.** The Render static site downloads one normalized nationwide snapshot from Cloudflare Worker `politics-daily-snapshot` when the map loads. Individual county selections look up five-digit FIPS codes in that in-memory object, not the source APIs.

## What happens daily
The already-keyed gateway Worker `crimson-mud-d254` retains all 24 dashboard variables and gains D1 binding `COUNTY_DB`. A daily Cron Trigger runs Census's *nationwide county query once*, normalizes its estimated data, and stores a last-good snapshot in D1. The public snapshot reader has only D1 read access, no Census or other provider keys.

**First source only:** U.S. Census ACS 2024 five-year: county population, median household income, poverty rate, and median gross monthly rent, with original survey years 2020–2024 displayed. The dataset's collection time does not mean Census refreshed these estimates on that date. Until first successful collection the map shows pending, not fabricated values. Incomplete nationwide datasets do not overwrite previous good snapshots.

The other 26 source adapters remain available in the keyed gateway but are **not** bulk-normalized or invoked on county clicks. Each requires its own scheduled and quota-aware county join (or non-county presentation when no meaningful geographic relationship exists). Never issue 27 × ~3,143 county API calls.

## Cloudflare
D1: `politics-county-snapshots`. Table schema: `sql/county_snapshots.sql`.
Writer gateway Worker: `crimson-mud-d254` with 24 existing bindings + `COUNTY_DB`. Cron `15 7 * * *` UTC (07:15 UTC daily). Gateway's `wrangler.jsonc` includes that schedule and D1 binding.
Read-only Worker: `politics-daily-snapshot` with **only** the `COUNTY_DB` binding and no cron. `wrangler.daily.jsonc` configures it.
Render static site: `https://politics-e5yt.onrender.com`. No Render variables.

Only the map is intended as a public page. The previously generated standalone Research Sources page was not requested and is removed.

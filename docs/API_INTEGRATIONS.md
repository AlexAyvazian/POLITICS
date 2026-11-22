# POLITICS — Live Source Gateway

Cloudflare Worker: `crimson-mud-d254` (the **second** connected Cloudflare account).

## Coverage
27 allowlisted source adapters across credential-backed, keyless-public, and authenticated-provider routes. The environment/infrastructure set includes AirNow, NOAA NCEI, USGS Water, EPA AQS, and FCC National Broadband Map. These are **distinct data sources** and not universal county-wide databases. The existing map and its geometry are unchanged.

Runtime bindings are managed by Cloudflare and referenced by their exact configured names, including the literal `CENSUS-API-KEY` (bracket lookup). AirNow no longer depends on a credential: the live ZIP lookup uses AirNow's official public file products. No key values are committed to GitHub.

## Routes
`GET /api/catalog`: list sources and whether their runtime bindings exist.
`GET /api/{provider}`: call an allowlisted provider on demand using a fixed upstream endpoint (never a caller-supplied URL).

Examples:
- `/api/census?county=06019` — county ACS income and poverty.
- `/api/bea?county=06019` — regional income.
- `/api/bls?county=06019` — county labor series; no county uses national CPI series.
- `/api/airnow?zip=93720` — current AirNow reporting-area AQI resolved through public ZIP/reporting-area files; preliminary, not regulatory AQS data.
- `/api/noaa?county=06019&days=30` — recent GHCN-Daily station observations associated with the county; not a countywide weather average.
- `/api/usgs?county=06019` — latest continuous streamflow observations at monitoring sites associated with the county; not a countywide water-condition score.
- `/api/fcc_broadband` — National Broadband Map release metadata. County coverage is refreshed daily from the FCC Area Comparison feed into `assets/data/county/fcc-broadband-availability.json` so county clicks never depend on the FCC map backend.
- `/api/eia?state=CA` — state residential electricity price.
- `/api/fec?q=Smith` — federal candidate search.
- `/api/maptiler?q=Fresno` — geocoding.

Source-health and adapter diagnostics are internal infrastructure rather than a public-facing page. The County Atlas also exposes stored policy datasets through voter-question tabs; it never sends provider credentials to the browser. The browser calls the Cloudflare Worker. The Worker holds upstream keys and caches successful responses in Cloudflare's edge cache when available.


## Operational and research integrity
- Cloudflare variables remain dashboard-managed; `wrangler.jsonc` uses `keep_vars: true`.
- The gateway supports fixed routes, whitelisted parameter formats, bounded response sizes and HTTP error signaling.
- Response `retrievedAt` reflects request time, not the underlying release date.
- API catalogs are not themselves comparable county measurements. Do not infer unsupported company-donation relationships, county veterinary prices, disaster property damage, or countywide air quality from them.
- FEC candidate, PAC/committee, itemized individual-contributor, employer/occupation, and committee-transaction views are already represented in Congressional Records; the simple gateway candidate search is only one adapter and is not the full campaign-finance surface.
- APIs can return empty data, 429s, or reject binding credentials; a configured key is not proof of a live connection.
- Worker deployment must be verified separately from a GitHub commit.

## Testing
Run `npm test` with Node 18+. Gateway tests verify allowlisting, request construction, and source classification with mocked upstream responses. Live deployment checks are still required. NOAA, USGS and AirNow were verified against the deployed Worker. FCC release metadata is verified through the gateway; the nationwide county availability snapshot is refreshed by GitHub Actions from the FCC Area Comparison feed and validates at least 3,100 county-equivalent rows before replacing the saved file.

# POLITICS — Live Source Gateway

Cloudflare Worker: `crimson-mud-d254` (the **second** connected Cloudflare account).

## Coverage
19 allowlisted source adapters: AirNow, BEA, BLS, Census, Congress.gov, Data.gov, EIA, openFDA, FDIC, FEC, FRED, GovInfo, Senate LDA, LobbyView, MapTiler, NOAA NCEI, Open States, Regulations.gov, and USGS Water. These are **distinct data sources** and not universal county-wide databases. The existing map and its geometry are unchanged.

All 21 runtime bindings are managed by Cloudflare and referenced by their exact configured names, including the literal `CENSUS-API-KEY` (bracket lookup), `AIRNOW_AQS_API_KEY` and `LOBBYVIEW_API_KEY` / `LOBBYVIEW_API_KEY_2` / `LOBBYVIEW_API_KEY_3`. No key values are committed to GitHub.

## Routes
`GET /api/catalog`: list sources and whether their runtime bindings exist.
`GET /api/{provider}`: call an allowlisted provider on demand using a fixed upstream endpoint (never a caller-supplied URL).

Examples:
- `/api/census?county=06019` — county ACS income and poverty.
- `/api/bea?county=06019` — regional income.
- `/api/bls?county=06019` — county labor series; no county uses national CPI series.
- `/api/airnow?zip=93720` — air quality reporting area, not a county economic loss.
- `/api/eia?state=CA` — state residential electricity price.
- `/api/fec?q=Smith` — federal candidate search.
- `/api/maptiler?q=Fresno` — geocoding.

`sources.html` is the standalone research-source explorer; the county map remains unchanged aside from a link to this page. The browser calls the Cloudflare Worker. The Worker holds upstream keys and caches successful responses in Cloudflare's edge cache when available.

## LobbyView rotation
**Three separate accounts**, represented by `LOBBYVIEW_API_KEY`, `_2`, and `_3`. Calls rotate between the three credentials; HTTP 429/401/403 triggers fallback to the next one. LobbyView publicly documents **100 requests per user per 24 hours**. If these are three separate eligible users, 300/day could be available in aggregate, subject to provider terms and actual enforcement. Do not assume three accounts operated by a single person automatically change a per-user limit. This basic Worker rotation **does not enforce a distributed daily quota** and caching is therefore important.

## Operational and research integrity
- Cloudflare variables remain dashboard-managed; `wrangler.jsonc` uses `keep_vars: true`.
- The gateway supports fixed routes, whitelisted parameter formats, bounded response sizes and HTTP error signaling.
- Response `retrievedAt` reflects request time, not the underlying release date.
- API catalogs are not themselves comparable county measurements. Do not infer unsupported company-donation relationships, county veterinary prices, disaster property damage, or countywide air quality from them.
- FEC contributor records are a separate endpoint and are **not yet represented** by the initial candidate search.
- APIs can return empty data, 429s, or reject binding credentials; a configured key is not proof of a live connection.
- Worker deployment must be verified separately from a GitHub commit.

## Testing
Run `npm test` with Node 18+. Gateway tests verify allowlisting, 19 providers, configured-name mapping, request construction, and 3-key LobbyView rotation with mocked upstream responses. Provider live authentication is a separate deployment check.

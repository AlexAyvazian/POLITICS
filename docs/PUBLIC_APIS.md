# Public API integrations — POLITICS
The established gateway now contains **27 source adapters**: 19 previously configured source integrations, **six credential-free public data adapters**, plus two authenticated interfaces ready when their provider credentials are configured. The existing U.S. county map remains intact.

## No key needed — six working adapter routes
| Source | Gateway route | Required input | Data and limitation |
|---|---|---|---|
| CFPB | /api/cfpb | optional state, q, zip | Published consumer complaints, not verified wrongdoing; narratives may be unavailable |
| CMS | /api/cms | state (defaults CA) | Public Medicare Fee-for-Service provider enrollment, not medical pricing |
| FFIEC HMDA | /api/hmda | county FIPS, year 2018–2025 | Mortgage application aggregates, not all mortgage lending |
| Federal Register | /api/federalregister | optional q | Public notices/rules; verify legal text with official publication |
| SEC | /api/sec | numeric company CIK | Public EDGAR filing history, not company political donations |
| USAspending | /api/usaspending | county FIPS | Federal award obligations grouped geographically; not community economic impact |

Data retrieved on-demand. All requests go to fixed, documented government API endpoints. Results include retrieval time and source context; the original filing/publication date remains distinct.

## Authenticated exceptions in your uploaded PDF collection
- **EPA AQS**, /api/epa_aqs?county=06019&year=2025: requires the EPA account's \`EPA_AQS_KEY\` and \`EPA_AQS_EMAIL\`. The upload includes an AQS Data Mart credential. Neither value is stored in the repository. Historical validated daily PM2.5 monitor summaries; data can lag observations by many months.
- **FCC National Broadband Map**, /api/fcc_broadband: requires \`FCC_BDC_TOKEN\` and \`FCC_BDC_USERNAME\`. The June 8, 2026 FCC document explicitly requires an FCC account and access token. This basic endpoint discovers data release dates; it is **not** a full county broadband impact dataset.

These two adapters return HTTP 503 when the required Cloudflare bindings are missing, rather than falsely claiming keyless access. They must not be confused with the separately configured AirNow connection.

## Validation and deploy
\`npm test\` includes mock-provider tests for all eight newly added adapters. A test passing does not prove that each external provider accepts the live request. Cloudflare Workers can cache responses. Browser source explorer at \`sources.html\` is linked from the county map. The Worker is \`crimson-mud-d254\` under the designated **second Cloudflare account**, and Wrangler must retain existing bindings.

Source documentation:
- https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/
- https://data.cms.gov/api-docs
- https://ffiec.cfpb.gov/documentation/api
- https://www.federalregister.gov/developers/documentation/api/v1
- https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- https://api.usaspending.gov/docs/endpoints
- https://aqs.epa.gov/aqsweb/documents/data_api.html
- https://www.fcc.gov/sites/default/files/bdc-public-data-api-spec.pdf

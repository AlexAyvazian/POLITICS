# First keyless political and well-being sources

## What was added (GitHub source integration)

The unchanged one-map state/county experience now has two additional optional, D1-backed sections in the *existing* state/county side card. There are no per-click upstream calls.

- **CDC PLACES 2025 GIS-friendly county release**: `https://data.cdc.gov/resource/i46a-9kgh.json`; 8 model-based county percentages: frequent mental distress, frequent physical distress, diagnosed depression, loneliness, food insecurity, housing insecurity, routine checkups and uninsured adults. The site always labels these as modeled estimates and does not claim a scientifically established happiness score or policy causation. State panels use equal-weight *county averages*, explicitly not statewide estimates. Stored in existing healthcare D1 as `cdc_places_2025`.
- **Current federal delegation**: `https://unitedstates.github.io/congress-legislators/legislators-current.json`, a maintained, freely published *community dataset*, not a federal government API. Served as state senators and House members, with party, term and district. Does not assert which specific House member represents each county; counties and House district lines can intersect. Stored in existing baseline D1 as `congress_members_current`.
- Existing reader routes: `/api/places-snapshot` and `/api/congress-snapshot`.
- Existing browser cache requests both routes once per page load and renders stored results when present.
- Scheduled upstream jobs use available slots 09 and 10 of the *existing* half-hour UTC schedule, corresponding to 04:30 and 05:00 UTC each day. No additional cron trigger or D1 database is required.

## Deployment and first collection

GitHub commits do not deploy Cloudflare automatically unless the specific worker build/publish workflow is configured. Confirm **both** existing Workers (`crimson-mud-d254` for collection and `politics-daily-snapshot` for read-only output) are on the new code, with their existing D1 bindings preserved. A newly deployed reader can return a legitimate `pending` payload until an upstream collection succeeds. Check the source-specific dataset count and sample FIPS before marking it live.

CDC 2025 is an annual, modeled source, not a live well-being estimate. Avoid ranking counties from PLACES estimates or using it for causal comparisons across years. The elected-official feed identifies currently *serving* federal members; the state legislature, governor, county commissioners and historical control still need dedicated curated sources.

## API keys / signup pages for expansion

| Provider | Required? | Signup / documentation |
| --- | --- | --- |
| CDC PLACES | **No** | https://data.cdc.gov/d/i46a-9kgh |
| unitedstates/congress-legislators | **No** | https://github.com/unitedstates/congress-legislators |
| Census ACS, BEA, Congress.gov, Open States, FEC | **Existing gateway connectors** | Check whether their existing Cloudflare binding is valid before obtaining a new key |
| Congress.gov | API key for official federal legislative activities / votes (existing binding: `CONGRESS_API_KEY`) | https://api.congress.gov/sign-up/ |
| Open States | State legislature API key (existing binding: `OPENSTATES_API_KEY`) | https://openstates.org/accounts/signup/ |
| FEC | Candidate / financial records API key (existing binding: `FEC_API_KEY`) | https://api.open.fec.gov/developers/ |
| LegiScan | New key for additional state bill/roll-call coverage | https://legiscan.com/legiscan |
| EPA AQS | API key and registered email (adapter exists but credential status not verified) | https://aqs.epa.gov/aqsweb/documents/data_api.html |
| FCC National Broadband Map | Account, token and username (adapter exists but credential status not verified) | https://www.fcc.gov/BroadbandData |
| America's Health Rankings | Registration alone does not confer permission to republish | https://developers.americashealthrankings.org/ |

Source/schema verification, mocked tests, successful D1 storage, Cloudflare deployment and browser rendering are separate verification steps.

# POLITICS — County impact intelligence

Live map: https://politics-e5yt.onrender.com

**Public county clicks never contact government provider APIs.** Render serves the map, which downloads one cached nationwide county snapshot from the Cloudflare D1-backed snapshot reader and filters it locally by five-digit FIPS code.

- `crimson-mud-d254` Cloudflare Worker: existing 27 provider adapters, preserved credentials, plus a scheduled nationwide Census collector and D1 write access.
- `politics-daily-snapshot` Cloudflare Worker: only serves saved D1 data to the browser. No upstream provider API calls, no API keys, no scheduled job.
- `politics-county-snapshots` Cloudflare D1: stores last-good countrywide snapshots.
- Render static hosting: no API variables or backend service required.

Initial dataset: Census ACS 2024 five-year county population, household income, poverty and rent. Other sources require per-provider bulk collection and legitimate geographic normalization; merely having 27 adapters does not create 27 county datasets.

See [the architecture and data integrity notes](docs/COUNTY_SNAPSHOTS.md).

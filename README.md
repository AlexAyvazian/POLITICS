# POLITICS — civic transparency atlas

Live: https://politics-e5yt.onrender.com

POLITICS is a static public-facing civic data application backed by scheduled GitHub Actions plus Cloudflare Workers/D1 snapshots. Render publishes the repository root directly from `main`; provider credentials remain server-side in Cloudflare.

## Public surfaces

- **County Atlas** — state/county conditions organized into voter-question tabs: Overview, Housing, Jobs & Economy, Health & Well-Being, Education & Families, Infrastructure, and Representation.
- **Congressional Atlas** — U.S. House, U.S. Senate, state legislative, governor, and presidential geography/results.
- **Congressional Records** — member Overview, Voting Record, Legislation, Campaign Money, PAC & Political Networks, Lobbying, and Travel & Ethics.
- **Foreign Influence** — DOJ FARA foreign-principal/registrant directory and verified filing totals.
- **Data Sources & Health** — public status of connected sources, stored datasets, refresh times, coverage, and sanitized collector failures.

## Data architecture

1. **GitHub Actions** refresh static datasets such as roll calls, FEC PAC/sector files, travel, elections, FARA, and geography.
2. **Cloudflare collectors** refresh API-backed snapshots into D1 without exposing provider credentials to the browser.
3. **politics-daily-snapshot** serves read-only stored data to the public site.
4. **Render** serves the static HTML/CSS/JS and auto-deploys commits to `main`.

County/state clicks never call Census or EIA directly. The County Atlas reads POLITICS-owned D1 snapshots. State legislative lists are loaded from stored Open States/Bill Commons snapshots only after a state is selected.

Source coverage and current collection health are visible at `sources.html`.

# POLITICS — Unified civic intelligence map

Live: https://politics-e5yt.onrender.com

**One map**. State selection opens a PI-style moving glow along the state's actual boundary and a state summary built from unweighted arithmetic averages of county data, alongside separately labelled state-only measures. County selection displays county-specific data in the **same** card and map.

Cloudflare D1 databases cache national county indicators for seven categories plus original baseline Census. Scheduled collectors call source APIs in bulk only. The website does not call Census, EIA, or any other source API on a public click.

Source details, data limitations, and architecture: [docs/COUNTY_SNAPSHOTS.md](docs/COUNTY_SNAPSHOTS.md).

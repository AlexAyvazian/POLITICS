# POLITICS: one map, multiple data resolutions

## Approved interaction
- **Same map throughout.** Clicking a state zooms to its county outlines, outlines the real irregular state boundary with a moving PI BorderGlow-style perimeter trace, and opens state statistics.
- **State panel:** arithmetic, equal-weight averages of available county values per indicator, never population-weighted and never mislabeled official state medians; a distinct "State-only data" section holds measurements such as EIA electricity price that do not exist at county level.
- **County click:** replaces that card with county-specific statistics. Closing a county card returns to the state panel. No separate state/county maps.
- The seven categories (housing, jobs, income, healthcare, education, families, infrastructure) are expandable sections of the SAME panel.
- Empty or uncollected category snapshots are labeled as pending; no fabricated numbers.

## Free architecture
Render: static map. No Render environment variables required.
Cloudflare gateway \`crimson-mud-d254\`: all original provider credentials and D1 bindings preserved; one Cron Trigger \`*/30 * * * *\`. The scheduled handler selects one batch per UTC 30-minute slot (7 Census categories, state-only EIA and the baseline Census). The remaining slots are reserved for future integration tasks; no further Cron Trigger is needed.
Cloudflare reader \`politics-daily-snapshot\`: **only D1 bindings**, never provider API calls. Read-only routes:
- \`/api/county-snapshot\` (original nationwide Census baseline)
- \`/api/category-snapshot?category=housing|jobs|income|healthcare|education|families|infrastructure\`
- \`/api/state-snapshot\` (EIA state-level electricity price)
The browser prefetches these snapshots on page load; state and county clicks filter those in memory without provider network requests.
D1: seven isolated databases by category plus original baseline D1. State-only EIA snapshot shares infrastructure D1 as a separate record. D1 schemas are defined in \`sql/county_snapshots.sql\`.

## Data sources and accuracy
Census: 2024 ACS five-year Data Profiles DP02, DP03, DP04, DP05 plus detailed B19083. Original Census survey period 2020–2024 is displayed separately from refresh time. Indicator field definitions are preserved with their ACS variable codes, formats, and source metadata.
Electricity: EIA monthly state residential prices in **cents per kWh**, retrieved in one nationwide scheduled bulk request; no fake county price.
Arithmetic averages use non-null county figures for each metric. They do not represent official statewide medians and must not be presented as such.
Other API adapters in the existing 27-provider gateway are not automatically geographical datasets. Build each separately based on official geography and published quota, rather than issuing one request per visitor or per county.

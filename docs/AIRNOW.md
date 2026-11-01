# AirNow — POLITICS API integration

**Status:** GitHub-side code; the existing Cloudflare Worker needs the new source deployed to handle requests. This repository change does not modify Cloudflare.

## Correct Cloudflare variable

The Worker `crimson-mud-d254` has a normal runtime variable named exactly **`AIRNOW_AQS_API_KEY`**. Both the Worker and the optional Pages Function read `env.AIRNOW_AQS_API_KEY`. No requirement to change its type to Secret; no actual key value belongs in the repository.

## Standalone Cloudflare Worker

- Source entrypoint: `workers/airnow-worker.mjs`.
- Deployment configuration: `wrangler.jsonc` with `name: crimson-mud-d254` and **`keep_vars: true`**, preserving your Cloudflare-dashboard variables if deployed with Wrangler.
- Run `npx wrangler deploy` only when you choose to update this Worker, authenticated to the correct Cloudflare account.
- Once deployed, use `https://<your-workers-hostname>/api/airnow/observations?zip=93720`. The browser can call this read-only endpoint across origins.
- The existing Worker currently starts from Cloudflare Hello World. GitHub commits do not change that deployment by themselves.

## Optional Pages Function

`functions/api/airnow/observations.js` also reads `AIRNOW_AQS_API_KEY` but a Pages project has independent bindings; the Worker variable is not shared automatically.

## Data and limitations

Uses official AirNow current observations API `https://www.airnowapi.org/aq/observation/current/ziplatlong/` via `zipcode`, `distance`, `format`, and `API_KEY` parameters. Returns pollutant, AQI, reporting area, and observation time. Values are preliminary air-quality readings, **not** county-level economic losses, proof of wildfires, or dollar cost estimates. Retrieval of live upstream data remains unverified until deployment and testing.

Run `npm test` for local test coverage.

Official documentation: https://docs.airnowapi.org/webservices
Cloudflare keep_vars: https://developers.cloudflare.com/workers/wrangler/configuration/

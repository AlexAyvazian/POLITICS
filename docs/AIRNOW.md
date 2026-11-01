# AirNow integration — contextual air-quality evidence

Status: code staged; **not live** until the issued AirNow API key is added as a Cloudflare Pages secret and an actual deployment is tested.

HTTP route: GET /api/airnow/observations?zip=93720

Uses the June 2026 replacement endpoint: https://www.airnowapi.org/aq/observation/current/ziplatlong/ . The older zipCode/current endpoint was retired September 30, 2026.

Setup: (1) Activate the AirNow account using the confirmation code on its confirmation page. (2) Log in and retrieve the distinct API key from the upper-right corner of https://docs.airnowapi.org/webservices . (3) Add AIRNOW_API_KEY under Cloudflare Pages project Settings > Variables and Secrets, as a secret. (4) Deploy using Cloudflare Pages (a Render Static Site or GitHub Pages cannot execute Pages Functions). (5) Test the HTTP route with a valid ZIP.

The endpoint returns normalized pollutant, AQI, reporting area, observations timestamps, and an original source attribution. It does not publish or reveal the API key and does not store bulk dataset copies. Observations are typically refreshed hourly and are cached using CDN headers.

**Crucial methodology:** AirNow's readings are preliminary AQI observations for reporting areas, not county-wide exposure, wildfire attribution, property damage, or economic loss figures. It should be used only as a contextual air-quality signal alongside separately sourced disaster and economic data, not as a standalone cost estimate.

Sources: https://docs.airnowapi.org/webservices , https://docs.airnowapi.org/faq , https://www.airnow.gov/about-the-data/

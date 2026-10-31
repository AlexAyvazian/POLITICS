# POLITICS — Geographic Map Shell

Standalone state-to-county map transplanted from the map view of [Directory](https://github.com/AlexAyvazian/Directory).

- Original D3/TopoJSON map geometry, source map styling, ambient backgrounds, glass controls, and state zoom animation.
- U.S. -> state -> county selection, hover tooltips, search, back button, breadcrumbs, responsive layout and URL hash links (#map/CA/06019).
- No Directory view, employee or facility records, contact data, Neon, GovDir, or API server. Only geographic boundaries and state/FIPS labels are carried over.
- Ready for future political, economic and research layers keyed by FIPS.

## Usage

Serve the repository as a static site (for example with python3 -m http.server 8000) or deploy through Cloudflare Pages or GitHub Pages. A sleeping Render service is not needed.

## Verification

Run npm test with Node 18+ to validate county geometry, geographical search, deep links, and map-only dependencies.

## Attribution

Uses the original visual styles and interaction patterns from Directory. Boundary geometries from Mike Bostock's us-atlas, under the ISC license in assets/vendor/us-atlas.LICENSE. D3 and topojson-client retain their source headers.

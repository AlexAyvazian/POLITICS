import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Congressional Atlas uses independent existing Leaflet map, not previous SVG map',()=>{
 const html=read('congressional.html');
 assert.match(html,/id="legislativeMap"/);
 assert.match(html,/leaflet@1\.9\.4/);
 assert.match(html,/esri-leaflet@3\.0\.8/);
 assert.match(html,/assets\/js\/congressional-existing-map\.js/);
 for(const forbidden of ['id="districtMap"','assets/js/congressional.js','assets/js/congressional-model.js','assets/vendor/us-atlas-counties','assets/js/geo-colors.js','assets/js/map.js','assets/vendor/d3.min.js'])
  assert.ok(!html.includes(forbidden),'former atlas dependency '+forbidden+' must not be used');
});
test('live Census MapServer supplies pre-rendered federal and separate state legislative lines',()=>{
 const js=read('assets/js/congressional-existing-map.js');
 assert.match(js,/TIGERweb\/Legislative\/MapServer/);
 assert.match(js,/L\.map\(/);
 assert.match(js,/L\.esri\.dynamicMapLayer\(/);
 assert.match(js,/L\.tileLayer\(/);
 assert.match(js,/house:.*8/);
 assert.match(js,/stateSenate:.*9/);
 assert.match(js,/stateHouse:.*10/);
 assert.match(js,/layerDefs/);
 assert.match(js,/STATE=/);
});
test('new atlas uses provider-rendered districts and not home-built SVG polygon projections',()=>{
 const js=read('assets/js/congressional-existing-map.js');
 for(const forbidden of ['d3.geoIdentity','d3.geoMercator','topojson.feature','colors.county','fitExtent','SVGPathElement'])
  assert.ok(!js.includes(forbidden),'should not reuse old map drawing '+forbidden);
 assert.match(js,/returnExtentOnly/);
 assert.match(js,/L\.latLngBounds/);
 assert.match(js,/districtCode/);
});
test('political representation has federal and state office views with dated attribution',()=>{
 const js=read('assets/js/congressional-existing-map.js');
 for(const indicator of ['GOVERNORS_2026','POLITICS_NCSL','119th Congress','2024 state legislative district boundaries','Open States','U.S. senators'])
  assert.ok(js.includes(indicator),indicator+' should be present');
 assert.match(js,/statePeople/);
 assert.match(js,/federalPeople/);
});
test('no County Atlas geographic rendering and color files are edited',()=>{
 const index=read('index.html');
 assert.match(index,/href="congressional.html"/);
 assert.match(index,/assets\/js\/map\.js/);
});

test('district highlighting uses the GeoJSON feature callback supplied by Esri Leaflet',()=>{
 const js=read('assets/js/congressional-existing-map.js');
 assert.match(js,/featureLayer\.setStyle\(feature\s*=>/);
 assert.match(js,/feature\?\.properties\?\.GEOID===code/);
 assert.doesNotMatch(js,/featureLayer\.setStyle\(layer\s*=>/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Infrastructure & Environment loads official EPA 2025 county monitoring statistics',()=>{
 const map=read('assets/js/map.js'),cache=read('assets/js/county-cache.js'),sources=read('assets/js/sources.js');
 assert.match(map,/Infrastructure & Environment/);
 assert.match(cache,/assets\/data\/county\/epa-air-quality-2025\.json/);
 assert.match(cache,/epaAirQuality/);
 assert.match(map,/function renderEpaCountyAirQuality/);
 for(const label of ['Ozone · 8-hour','PM2.5 · weighted annual mean','PM2.5 · 24-hour','PM10 · 24-hour','NO₂ · 1-hour'])
  assert.ok(map.includes(label),label);
 assert.match(map,/tab==='infrastructure'[\s\S]*renderEpaCountyAirQuality/);
 assert.match(sources,/epa_air_quality_county_2025/);
});

test('EPA panel preserves monitoring limits instead of converting missing counties or ND values to zero',()=>{
 const map=read('assets/js/map.js');
 assert.match(map,/no 2025 EPA county monitoring row/i);
 assert.match(map,/not a zero pollution value/i);
 assert.match(map,/highest values among monitoring sites/i);
 assert.match(map,/not intended to numerically rank counties/i);
 assert.match(map,/may not represent county-wide air quality/i);
});

test('EPA source health is based on the stored official county workbook snapshot',()=>{
 const sources=read('assets/js/sources.js');
 assert.match(sources,/epa-air-quality-2025\.json/);
 assert.match(sources,/epa_air_quality_county_2025/);
 assert.match(sources,/County Atlas · Infrastructure & Environment/);
});

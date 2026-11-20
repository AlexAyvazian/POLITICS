import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Infrastructure & Environment loads and renders stored EPA annual county AQI',()=>{
 const map=read('assets/js/map.js'),cache=read('assets/js/county-cache.js'),sources=read('assets/js/sources.js');
 assert.match(map,/Infrastructure & Environment/);
 assert.match(cache,/assets\/data\/county\/epa-aqi-2025\.json/);
 assert.match(cache,/epaAqi/);
 assert.match(map,/function renderEpaCountyAqi/);
 assert.match(map,/Days with AQI/);
 assert.match(map,/Unhealthy or worse days/);
 assert.match(map,/Median AQI/);
 assert.match(map,/tab==='infrastructure'[\s\S]*renderEpaCountyAqi/);
 assert.match(sources,/epa_aqi_county_2025/);
});

test('EPA AQI panel never treats missing monitoring coverage as a zero',()=>{
 const map=read('assets/js/map.js');
 assert.match(map,/annual county AQI row/i);
 assert.match(map,/not a zero/i);
 assert.match(map,/monitoring/i);
 assert.match(map,/highest daily monitor AQI/i);
});

test('EPA source health is based on the stored annual snapshot',()=>{
 const sources=read('assets/js/sources.js');
 assert.match(sources,/epa-aqi-2025\.json/);
 assert.match(sources,/epa_aqi_county_2025/);
 assert.match(sources,/County Atlas · Infrastructure & Environment/);
});

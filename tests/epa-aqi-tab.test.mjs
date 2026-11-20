import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Infrastructure loads and renders stored EPA annual county AQI data',()=>{
 const map=read('assets/js/map.js'),cache=read('assets/js/county-cache.js'),sources=read('assets/js/sources.js');
 assert.match(cache,/assets\/data\/county\/epa-aqi-2025\.json/);
 assert.match(cache,/epaAqi/);
 assert.match(map,/function renderEpaAqi/);
 assert.match(map,/AQI >100 days/);
 assert.match(map,/tab==='infrastructure'[\s\S]*renderEpaAqi/);
 assert.match(sources,/epa_airdata_county_aqi_2025/);
});

test('EPA AQI panel treats monitoring gaps as missing, never clean air',()=>{
 const map=read('assets/js/map.js');
 assert.match(map,/no annual AQI record/i);
 assert.match(map,/not zero pollution/i);
 assert.match(map,/some, but not all/i);
 assert.match(map,/county-days/i);
});

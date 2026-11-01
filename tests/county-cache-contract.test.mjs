import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('one map uses saved county snapshots and no provider API on state or county clicks',()=>{
 const map=read('assets/js/map.js'),cache=read('assets/js/county-cache.js');
 assert.match(map,/renderCard/);
 assert.match(map,/stateLightTrace/);
 assert.match(map,/getStateAverages/);
 assert.ok(!/\bfetch\s*\(/.test(map));
 assert.match(cache,/\/api\/county-snapshot/);
 assert.match(cache,/\/api\/category-snapshot/);
 assert.match(cache,/\/api\/state-snapshot/);
 assert.ok(!cache.includes('/api/eia')&&!cache.includes('/api/census'));
});
test('same page contains state, county interaction, and seven Census categories',()=>{
 const map=read('assets/js/map.js');
 for(const word of ['Housing & affordability','Jobs & wages','Income & inequality','Healthcare access','Education','Families & demographics','Infrastructure'])assert.ok(map.includes(word),word);
 assert.match(map,/selectState/);assert.match(map,/selectCounty/);
 assert.match(map,/stateMode\?goHome/);
 assert.match(map,/stateSelectedBoundary/);
});
test('research sources page is not navigable from the main UI',()=>{
 assert.doesNotMatch(read('index.html'),/sources.html/i);
});
test('one scheduled trigger coordinates category refreshes instead of 27 crons',()=>{
 const config=JSON.parse(read('wrangler.jsonc'));
 assert.deepEqual(config.triggers.crons,['*/30 * * * *']);
});

test('keyless health and political data render in the same county/state card without on-click API calls',()=>{
 const map=read('assets/js/map.js'),cache=read('assets/js/county-cache.js');
 assert.match(cache,/\/api\/places-snapshot/);
 assert.match(cache,/\/api\/congress-snapshot/);
 assert.match(map,/renderCdcPlaces/);
 assert.match(map,/renderCongressionalDelegation/);
 assert.match(map,/Loneliness/);
 assert.match(map,/Congressional delegation/);
 assert.match(map,/may cross county borders/);
 assert.ok(!/\\bfetch\\s*\\(/.test(map),'Map selection must use stored data only');
});

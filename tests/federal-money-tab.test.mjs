import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('County Atlas has a Federal Money tab backed by a stored USAspending snapshot',()=>{
 const map=read('assets/js/map.js'),cache=read('assets/js/county-cache.js');
 assert.match(map,/\['federal','Federal Money'\]/);
 assert.match(map,/function renderFederalMoney/);
 assert.match(map,/USAspending\.gov/);
 assert.match(cache,/assets\/data\/county\/usaspending\.json/);
 assert.match(cache,/federalMoney/);
});

test('Federal Money renderer labels obligations as federal award activity, not resident income',()=>{
 const map=read('assets/js/map.js');
 assert.match(map,/federal prime award obligations/i);
 assert.match(map,/not household income|not a household benefit/i);
});

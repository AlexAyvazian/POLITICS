import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Housing tab loads and renders stored statewide HMDA and CFPB context',()=>{
 const map=read('assets/js/map.js'),cache=read('assets/js/county-cache.js');
 assert.match(cache,/assets\/data\/state\/housing-finance\.json/);
 assert.match(cache,/housingFinance/);
 assert.match(map,/function renderHousingFinance/);
 assert.match(map,/HMDA/);
 assert.match(map,/CFPB/);
 assert.match(map,/tab==='housing'[\s\S]*renderHousingFinance/);
});

test('Housing finance context is explicitly statewide in county view and caveats complaint interpretation',()=>{
 const map=read('assets/js/map.js');
 assert.match(map,/statewide context/i);
 assert.match(map,/not a county estimate/i);
 assert.match(map,/complaints are not a statistical sample|not representative/i);
 assert.match(map,/not a full approval rate/i);
});

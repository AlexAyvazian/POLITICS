import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Jobs & Economy loads a stored BLS LAUS county labor-market snapshot',()=>{
 const cache=read('assets/js/county-cache.js'),map=read('assets/js/map.js');
 assert.match(cache,/\/api\/bls-snapshot/);
 assert.match(cache,/bls/);
 assert.match(map,/function renderBlsLaborMarket/);
 assert.match(map,/Unemployment rate/);
 assert.match(map,/Labor force/);
 assert.match(map,/Not seasonally adjusted/);
 assert.match(map,/tab==='economy'[\s\S]*renderBlsLaborMarket/);
});

test('BLS county snapshot is clearly distinguished from Census five-year estimates',()=>{
 const map=read('assets/js/map.js');
 assert.match(map,/Bureau of Labor Statistics|BLS LAUS/);
 assert.match(map,/monthly/i);
 assert.match(map,/place of residence/i);
 assert.match(map,/different.*Census|Census.*different/i);
});

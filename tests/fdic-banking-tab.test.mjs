import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Housing tab loads stored FDIC county banking access',()=>{
 const map=read('assets/js/map.js'),cache=read('assets/js/county-cache.js'),sources=read('assets/js/sources.js');
 assert.match(cache,/assets\/data\/county\/fdic-banking-access\.json/);
 assert.match(cache,/fdicBanking/);
 assert.match(map,/function renderFdicBankingAccess/);
 assert.match(map,/FDIC-insured banking offices/);
 assert.match(map,/Distinct insured institutions with a local office/);
 assert.match(map,/Full-service brick-and-mortar offices/);
 assert.match(map,/Offices per 100k residents/);
 assert.match(map,/tab==='housing'[\s\S]*renderFdicBankingAccess/);
 assert.match(sources,/fdic_county_offices/);
});

test('FDIC banking panel states what physical office presence does not measure',()=>{
 const map=read('assets/js/map.js');
 assert.match(map,/excludes credit unions/i);
 assert.match(map,/does not measure.*affordability|does not measure.*lending/i);
 assert.match(map,/physical.*presence/i);
});

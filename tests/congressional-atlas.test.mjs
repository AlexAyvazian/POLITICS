import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('Congressional Atlas uses an independent pre-existing interactive map, not homegrown county SVG',()=>{
 const html=read('congressional.html'),home=read('index.html'),code=read('assets/js/congressional-existing-map.js');
 assert.match(html,/id="legislativeMap"/);
 assert.match(html,/assets\/js\/congressional-existing-map\.js/);
 assert.doesNotMatch(html,/assets\/js\/congressional\.js/);
 assert.doesNotMatch(html,/assets\/js\/geo-colors\.js/);
 assert.match(html,/id="districtLayer"/);
 assert.match(home,/href="congressional\.html"/);
 assert.match(code,/L\.esri\.featureLayer\(/);
 assert.match(code,/L\.esri\.dynamicMapLayer\(/);
 assert.match(code,/119th Congress/);
 assert.match(code,/2024 state legislative district boundaries/);
 assert.doesNotMatch(code,/POLITICS_COUNTY_CACHE/);
});
test('state executive roster is dated and covers every state with official source',()=>{
 const ctx={window:{}};
 vm.runInNewContext(read('assets/js/governors.js'),ctx);
 const roster=ctx.window.GOVERNORS_2026;
 assert.equal(Object.keys(roster.states).length,50);
 assert.equal(roster.states.CA,'Gavin Newsom');
 assert.equal(roster.states.VA,'Abigail Spanberger');
 assert.equal(roster.asOf,'2026-11-01');
 assert.match(read('congressional.html'),/assets\/js\/governors\.js/);
 assert.match(read('assets/js/congressional-existing-map.js'),/GOVERNORS_2026/);
});
test('County Atlas source and county selection effects remain intact',()=>{
 const html=read('index.html'),css=read('assets/css/politics.css');
 assert.match(html,/assets\/js\/map\.js/);
 assert.match(html,/assets\/js\/geo-colors\.js/);
 assert.match(css,/statePerimeterOrbit 7\.4s/);
 assert.match(css,/countyInteriorPulse 3\.2s/);
});

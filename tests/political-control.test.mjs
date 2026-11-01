import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
function ncsl(){const ctx={window:{}};vm.runInNewContext(read('assets/js/ncsl-control.js'),ctx);return ctx.window.POLITICS_NCSL;}
test('NCSL snapshot carries as-of date, official link and exactly 50 states',()=>{
 const d=ncsl();
 assert.equal(d.asOf,'2026-10-06');
 assert.equal(d.sourceUrl,'https://www.ncsl.org/about-state-legislatures/state-partisan-composition');
 assert.equal(Object.keys(d.states).length,50);
});
test('NCSL preserves split control, nonpartisan Nebraska and both chamber seat breakdowns',()=>{
 const d=ncsl();
 assert.equal(d.states.CA.stateControl,'D');
 assert.equal(d.states.CA.house.dem,60);
 assert.equal(d.states.CA.house.rep,19);
 assert.equal(d.states.CA.house.vacant,1);
 assert.equal(d.states.KY.legislature,'R');
 assert.equal(d.states.KY.governor,'D');
 assert.equal(d.states.KY.stateControl,'S');
 assert.equal(d.states.NE.legislature,'Nonpartisan');
 assert.equal(d.states.NE.stateControl,'N/A');
 assert.equal(d.states.PA.house.dem,102);
 assert.equal(d.states.PA.senate.rep,27);
});
test('NCSL dataset never invents DC a governor or elected bicameral control',()=>{
 const d=ncsl();
 assert.equal(d.states.DC,undefined);
});
test('the unchanged map shows source-labeled political control in state and county panels',()=>{
 const js=read('assets/js/map.js'),html=read('index.html');
 assert.match(html,/assets\/js\/ncsl-control\.js/);
 assert.match(js,/renderStatePoliticalControl/);
 assert.match(js,/2026-10-06|asOf/);
 assert.match(js,/State-level control; does not determine which party governs this county/);
 assert.ok(!/\bfetch\s*\(/.test(js));
});

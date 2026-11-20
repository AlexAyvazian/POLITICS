import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('the map sidebar never displays six empty political/health source sections',()=>{
 const js=read('assets/js/map.js');
 // No source without a usable snapshot should produce a titled pending section.
 for(const marker of ['renderOpenStates','renderHouseVotes','renderBillCommons','renderCongressionalDelegation','renderCdcPlaces']){
  const start=js.indexOf('function '+marker+'(');
  const end=js.indexOf('\nfunction ',start+1);
  assert.ok(start>=0,marker);
  const body=js.slice(start,end<0?undefined:end);
  assert.match(body,/if\s*\([^\n]+\)\s*return\s*'';/,marker+' must omit unavailable content');
 }
 assert.match(js,/function renderDataCollectionStatus\(/);
 assert.match(js,/Data still collecting:/);
});
test('selected place changes reset the sidebar scroll, but snapshots preserve current reading position',()=>{
 const js=read('assets/js/map.js');
 assert.match(js,/let lastCardSelection=null/);
 assert.match(js,/card\.scrollTop=selectionChanged\?0:priorScroll/);
});
test('the map sidebar exposes stored policy datasets only when voters choose the relevant tab',()=>{
 const js=read('assets/js/map.js');
 const start=js.indexOf('function renderCard()');
 const end=js.indexOf('\nfunction selectState(',start);
 const body=js.slice(start,end);
 assert.match(js,/function countyTabBody/);
 assert.match(js,/renderStatePoliticalControl\(state,stateMode\)/);
 for(const name of ['renderOpenStates','renderHouseVotes','renderBillCommons',
    'renderCongressionalDelegation','renderCdcPlaces','renderDataCollectionStatus'])
  assert.ok(js.includes(name+'('),name+' is available to a voter-facing tab');
 assert.match(body,/loadBills\?\./);
 assert.match(body,/loadOpenStates\?\./);
 assert.ok(!body.includes('fetch('),'selection still reads stored POLITICS snapshots only');
});
test('legislative and health collectors are wired into the County Atlas representation and health tabs',()=>{
 const js=read('assets/js/map.js');
 const worker=read('workers/politics-gateway.mjs');
 const cache=read('assets/js/county-cache.js');
 for(const name of ['renderOpenStates','renderHouseVotes','renderBillCommons','renderCongressionalDelegation','renderCdcPlaces'])
  assert.ok(js.split(name+'(').length-1>=2,name+' must be defined and rendered');
 for(const name of ['refreshOpenStatesState','refreshFederalHouseVotes','refreshBillCommonsState'])
  assert.ok(worker.includes('function '+name+'('));
 assert.match(cache,/loadOpenStates\(abbr\)/);
 assert.match(cache,/loadBills\(abbr\)/);
});

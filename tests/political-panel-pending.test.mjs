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
test('statewide Census averages remain visible before optional political collection notes',()=>{
 const js=read('assets/js/map.js');
 const start=js.indexOf('function renderCard()');
 const end=js.indexOf('\nfunction selectState(',start);
 const body=js.slice(start,end);
 assert.ok(body.indexOf('renderStatePoliticalControl(')<body.indexOf('metricGrid(vals)'),'political control must lead overview');
 assert.match(body,/metricGrid\(vals\)[\s\S]+collectionStatus;/,'actual averages must be rendered ahead of the single collection note');
 assert.ok(!/\bfetch\s*\(/.test(body));
});

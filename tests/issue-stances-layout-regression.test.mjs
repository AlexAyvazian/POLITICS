import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyParty,arrangeCorridor} from '../assets/js/issue-stances-layout.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Democratic and Republican politicians occupy separate walls, including party aliases',()=>{
 for(const party of ['Democratic','DEM','Democrat','Democratic Party','DEMOCRATIC-FARMER-LABOR','DEM/PROG','Democrat, Working Families']){
  assert.equal(classifyParty(party),'democratic',party);
 }
 for(const party of ['Republican','REP','GOP','REPUBLICAN PARTY']){
  assert.equal(classifyParty(party),'republican',party);
 }
 for(const party of ['Independent','Nonpartisan','Green','Libertarian','No Party Preference','']){
  assert.equal(classifyParty(party),'other',party);
 }
 const result=arrangeCorridor([
  {slug:'d1',party:'DEM'},{slug:'r1',party:'REP'},{slug:'d2',party:'Democratic'},
  {slug:'r2',party:'Republican'},{slug:'ind',party:'Independent'}
 ]);
 assert.equal(result[0].side,-1);
 assert.equal(result[1].side,1);
 assert.equal(result[0].bay,result[1].bay,'parties should face each other at the same depth');
 assert.equal(result[2].bay,result[3].bay);
 assert.ok(result.find(p=>p.slug==='ind').bay>result.find(p=>p.slug==='r2').bay);
});

test('all 477 candidates fit in the existing 3D corridor without truncation or duplicates',()=>{
 const people=Array.from({length:477},(_,i)=>({slug:'candidate-'+i,party:i%3===0?'DEM':i%3===1?'REP':'Independent'}));
 const slots=arrangeCorridor(people);
 assert.equal(slots.length,477);
 assert.equal(new Set(slots.map(x=>x.slug)).size,477);
 assert.ok(slots.every(x=>Number.isInteger(x.bay)&&x.bay>=0&&[-1,1].includes(x.side)));
 assert.ok(slots.every(x=>x.wing==='democratic'?x.side===-1:true));
 assert.ok(slots.every(x=>x.wing==='republican'?x.side===1:true));
 const js=read('assets/js/issue-stances.js');
 assert.doesNotMatch(js,/MAX_CORRIDOR\s*=\s*56/);
 assert.doesNotMatch(js,/people\.slice\(0,\s*MAX_CORRIDOR\)/);
 assert.match(js,/arrangeCorridor\(people\)/);
});

test('portrait spacing and architecture are driven by bays, with overhead arches only',()=>{
 const gallery=read('galiyaara/js/gallery.js');
 assert.match(gallery,/const SEG = (?:2\.\d|3\.0)/);
 assert.match(gallery,/photo\.bay/);
 assert.match(gallery,/photo\.side/);
 assert.doesNotMatch(gallery,/const pillars = new THREE\.InstancedMesh/);
 assert.doesNotMatch(gallery,/scene\.add\(arch, pillars\)/);
 assert.match(gallery,/archSpacing/);
 assert.match(gallery,/options\.wallpapers/);
 assert.match(gallery,/wallpaperLoader/);
 assert.match(gallery,/group\.visible/,'distant frames should be culled for long corridors');
 assert.match(gallery,/map: tex, color: 0xaabfca, transparent: false/,'opaque wallpaper must not visually cover the portrait frames');
});

test('Voterist issue sheet remains sourced and the shared POLITICS navigation is untouched',()=>{
 const js=read('assets/js/issue-stances.js'),html=read('issues.html');
 assert.match(js,/normalizeIssueSheet/);
 assert.match(js,/getJson|voterist\(/);
 assert.match(html,/class="unifiedTopNav"/);
 assert.match(html,/href="issues\.html" aria-current="page"/);
 assert.doesNotMatch(html,/Quick Record|Top donor|\bPAC\b/i);
});

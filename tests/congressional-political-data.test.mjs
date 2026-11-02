import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
function models(){
 const win={};
 for(const name of ['congressional-political-model.js','ncsl-control.js','governors.js'])
  vm.runInNewContext(read('assets/js/'+name),{window:win});
 return win;
}
test('political data is in an independent panel while atlas geometry, styles and county map are preserved',()=>{
 const h=read('congressional.html'),js=read('assets/js/congressional-map.js');
 for(const path of ['assets/js/ncsl-control.js','assets/js/governors.js','assets/js/congressional-political-model.js','assets/js/congressional-political.js'])
  assert.ok(h.includes(path),path);
 assert.match(h,/id="politicalDetails"/);
 assert.match(js,/display\(meta\(null,byCode\[state\]\.fips\)\)/);
 assert.doesNotMatch(js,/POLITICS_NCSL|GOVERNORS_2026|fill.*party/i);
 const county=read('index.html');
 assert.doesNotMatch(county,/congressional-political\.js/);
});
test('current federal snapshot selects exact U.S. House district including at-large D.C. delegate',()=>{
 const m=models().CONGRESSIONAL_POLITICAL_MODEL;
 const snapshot={asOf:'2026-11-02',states:{
  CA:{house:[{name:'Example CA 1',party:'Republican',district:1,bioguide:'G000001'},{name:'Example CA 5',party:'Democrat',district:5,bioguide:'D000001'}],senators:[{name:'Senator A',party:'Democrat'}]},
  DC:{house:[{name:'DC Delegate',party:'Democrat',district:0}],senators:[]}
 }};
 assert.deepEqual(Array.from(m.house(snapshot,'CA','05')).map(x=>x.name),['Example CA 5']);
 assert.deepEqual(Array.from(m.house(snapshot,'DC','98')).map(x=>x.name),['DC Delegate']);
 assert.equal(m.house(snapshot,'CA','09').length,0);
 assert.deepEqual(Array.from(m.senators(snapshot,'CA')).map(x=>x.name),['Senator A']);
});
test('partial Open States people are matched by correct chamber and district, never inferred vacant',()=>{
 const m=models().CONGRESSIONAL_POLITICAL_MODEL;
 const source={state:'CA',totalPeople:122,people:[
  {name:'Example Senator',role:'Senator',district:'39',party:'Democratic'},
  {name:'Example Assemblymember',role:'Assemblymember',district:'39',party:'Republican'},
  {name:'Example Assembly 5',role:'Assemblymember',district:'5',party:'Democratic'}
 ]};
 assert.deepEqual(Array.from(m.stateMembers(source,'stateSenate','039')).map(x=>x.name),['Example Senator']);
 assert.deepEqual(Array.from(m.stateMembers(source,'stateHouse','039')).map(x=>x.name),['Example Assemblymember']);
 assert.equal(m.stateMembers(source,'stateSenate','005').length,0);
 assert.equal(m.stateCompleteness(source),'partial');
});
test('dated governor and NCSL statewide data are accessible without recoloring any district',()=>{
 const w=models(),n=w.POLITICS_NCSL,g=w.GOVERNORS_2026;
 assert.equal(n.asOf,'2026-10-06');
 assert.equal(g.asOf,'2026-11-01');
 assert.equal(g.states.CA,'Gavin Newsom');
 assert.equal(n.states.CA.house.dem,60);
 assert.equal(n.states.NE.legislature,'Nonpartisan');
});
test('browser consumes existing read-only Cloudflare snapshots only, once per session/state',()=>{
 const s=read('assets/js/congressional-political.js');
 assert.match(s,/politics-daily-snapshot\.alxayvazian\.workers\.dev/);
 assert.match(s,/\/api\/congress-snapshot/);
 assert.match(s,/\/api\/openstates-snapshot/);
 assert.match(s,/new Map\(\)/);
 assert.match(s,/congressional-atlas:selection/);
 assert.doesNotMatch(s,/api\.open\.fec\.gov|v3\.openstates\.org|api\.congress\.gov|api_key|OPENSTATES_API_KEY/);
 assert.match(s,/Partial roster|partial roster|partial sample/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const wait=()=>new Promise(done=>setImmediate(done));
function mount(){
 const listeners={};
 let partyResolver=null;
 const box={innerHTML:''};
 const names={politicalDetails:box};
 const window={
  addEventListener(name,fn){listeners[name]=fn},
  POLITICS_CONGRESSIONAL_ATLAS:{getSelection(){return null},setPartyResolver(fn){partyResolver=fn;}}
 };
 for(const path of ['assets/js/ncsl-control.js','assets/js/governors.js','assets/js/congressional-political-model.js']){
  vm.runInNewContext(read(path),{window});
 }
 const requests=[];
 const federal={source:'unitedstates/congress-legislators community data',asOf:'2026-11-02',count:534,states:{
  CA:{house:[{name:'Example District Five',party:'Republican',bioguide:'E000001',district:5}],
   senators:[{name:'Example Senator',party:'Democrat',bioguide:'E000002'}]}
 }};
 const sample={state:'CA',totalPeople:122,retrievedAt:'2026-11-01T20:44:29.109Z',people:[
  {name:'Example State Senator',role:'Senator',party:'Democratic',district:'39',url:'https://openstates.org/person/safe/'}
 ]};
 const fetch=async url=>{
  requests.push(url);
  const data=url.includes('congress-snapshot')?federal:sample;
  return {ok:true,json:async()=>data};
 };
 vm.runInNewContext(read('assets/js/congressional-political.js'),{
  window,document:{getElementById:id=>names[id]},fetch,AbortSignal:{timeout:()=>({})},
  console,encodeURIComponent
 });
 const choose=selection=>listeners['congressional-atlas:selection']({detail:selection});
 return {choose,requests,box,party:value=>partyResolver?.(value)};
}
test('clicking a real House GEOID reveals only the verified matching representative',async()=>{
 const app=mount();
 app.choose({state:'CA',scope:'district',layer:'house',district:'05',geoid:'0605'});
 await wait();await wait();
 assert.match(app.box.innerHTML,/Example District Five/);
 assert.match(app.box.innerHTML,/Republican/);
 assert.match(app.box.innerHTML,/Current U\.S\. representative/);
 assert.match(app.box.innerHTML,/NCSL seat counts/);
 assert.match(app.box.innerHTML,/2026-11-02/);
 assert.equal(app.requests.filter(x=>x.includes('congress-snapshot')).length,1);
 assert.equal(app.party({layer:'house',state:'CA',scope:'district',district:'05'}),'republican');
 assert.equal(app.party({layer:'house',state:'CA',scope:'district',district:'06'}),'unknown');
 assert.equal(app.requests.filter(x=>x.includes('openstates-snapshot')).length,0);
});
test('state legislative panel displays validated matching names and warns about partial coverage',async()=>{
 const app=mount();
 app.choose({state:'CA',scope:'district',layer:'stateSenate',district:'039',geoid:'06039'});
 await wait();await wait();
 assert.match(app.box.innerHTML,/Example State Senator/);
 assert.match(app.box.innerHTML,/Partial roster: 1 of 122/);
 assert.equal(app.party({layer:'stateSenate',state:'CA',scope:'district',district:'039'}),'democratic');
 assert.equal(app.party({layer:'stateSenate',state:'CA',scope:'district',district:'038'}),'unknown');
 assert.equal(app.requests.filter(x=>x.includes('assets/data/legislators/ca.json')).length,1);
 assert.equal(app.requests.filter(x=>x.includes('openstates-snapshot')).length,0);
 app.choose({state:'CA',scope:'district',layer:'stateSenate',district:'038',geoid:'06038'});
 await wait();
 assert.match(app.box.innerHTML,/not evidence that the seat is vacant/);
 assert.equal(app.requests.filter(x=>x.includes('assets/data/legislators/ca.json')).length,1);
 assert.equal(app.requests.filter(x=>x.includes('openstates-snapshot')).length,0);
});
test('state overview renders dated governor, statewide legislative breakdown and both senators',async()=>{
 const app=mount();
 app.choose({state:'CA',scope:'state',layer:'house',district:null,geoid:'06'});
 await wait();await wait();
 assert.match(app.box.innerHTML,/Gavin Newsom/);
 assert.match(app.box.innerHTML,/Example Senator/);
 assert.match(app.box.innerHTML,/2026-11-01/);
 assert.match(app.box.innerHTML,/State political control/);
});

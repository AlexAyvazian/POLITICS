import test from 'node:test';
import assert from 'node:assert/strict';
import {serve} from '../workers/county-snapshot.mjs';
function req(path,origin='https://politics-e5yt.onrender.com'){
 return new Request('https://reader.example'+path,{headers:{Origin:origin}});
}
function fakeDb(data){
 return {prepare:sql=>({bind:source=>({first:async()=>data[source]?{snapshot_json:JSON.stringify(data[source])}:null})})};
}
test('seven category routes only read D1, never external providers',async()=>{
 const categories=['housing','jobs','income','healthcare','education','families','infrastructure'];
 const env={};
 for(const cat of categories)env['CATEGORY_DB_'+cat.toUpperCase()]=fakeDb({['census_'+cat]:{category:cat,count:3222,counties:{'06019':{value:2}}}});
 for(const cat of categories){
  const res=await serve(req('/api/category-snapshot?category='+cat),env);
  assert.equal(res.status,200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'),'https://politics-e5yt.onrender.com');
  assert.equal((await res.json()).category,cat);
 }
});
test('state-only snapshot remains separate from arithmetic county category averages',async()=>{
 const db=fakeDb({eia_state_electricity:{states:{CA:{residentialElectricityCentsKwh:29.75,period:'2026-08'}}}});
 const res=await serve(req('/api/state-snapshot'),{CATEGORY_DB_INFRASTRUCTURE:db});
 assert.equal((await res.json()).states.CA.residentialElectricityCentsKwh,29.75);
});
test('no category D1 data returns pending instead of fabricated values',async()=>{
 const res=await serve(req('/api/category-snapshot?category=education'),{CATEGORY_DB_EDUCATION:fakeDb({})});
 assert.equal((await res.json()).status,'pending');
});
test('invalid category is rejected without any fetch',async()=>{
 const res=await serve(req('/api/category-snapshot?category=everything'),{});
 assert.equal(res.status,404);
});

test('keyless CDC health and congressional representation read from existing D1 databases',async()=>{
 const health={source:'CDC PLACES',count:3100,fields:{lonelinessPct:{label:'Loneliness',unit:'percent'}},counties:{'06019':{lonelinessPct:29.1}}};
 const congress={count:540,states:{CA:{senators:[{name:'Sample Senator',party:'Democrat'}],house:[]}}};
 const env={CATEGORY_DB_HEALTHCARE:fakeDb({cdc_places_2025:health}),COUNTY_DB:fakeDb({congress_members_current:congress})};
 const h=await serve(req('/api/places-snapshot'),env),c=await serve(req('/api/congress-snapshot'),env);
 assert.equal(h.status,200);
 assert.equal(c.status,200);
 assert.equal((await h.json()).counties['06019'].lonelinessPct,29.1);
 assert.equal((await c.json()).states.CA.senators[0].party,'Democrat');
});
test('missing keyless datasets stay pending with no invented scores or representatives',async()=>{
 const env={CATEGORY_DB_HEALTHCARE:fakeDb({}),COUNTY_DB:fakeDb({})};
 for(const url of ['/api/places-snapshot','/api/congress-snapshot']){
  const resp=await serve(req(url),env);
  assert.equal(resp.status,200);
  const obj=await resp.json();
  assert.equal(obj.status,'pending');
  assert.equal(obj.count,0);
 }
});

test('political reader returns Open States by state and Congress.gov House vote snapshots from D1 only',async()=>{
 const states={openstates_CA:{state:'CA',bills:[{identifier:'AB 1'}],people:[{name:'State Legislator'}]}};
 const votes={congress_house_votes_recent:{chamber:'House',votes:[{voteNumber:100,stateVotes:{CA:[{cast:'Aye'}]}}]}};
 const env={COUNTY_DB:fakeDb({...states,...votes})};
 const open=await serve(req('/api/openstates-snapshot?state=CA'),env);
 assert.equal(open.status,200);
 assert.equal((await open.json()).people[0].name,'State Legislator');
 const house=await serve(req('/api/house-votes-snapshot'),env);
 assert.equal(house.status,200);
 assert.equal((await house.json()).votes[0].stateVotes.CA[0].cast,'Aye');
 const pending=await serve(req('/api/openstates-snapshot?state=TX'),env);
 assert.equal((await pending.json()).status,'pending');
 const invalid=await serve(req('/api/openstates-snapshot?state=NOTASTATE'),env);
 assert.equal(invalid.status,400);
});

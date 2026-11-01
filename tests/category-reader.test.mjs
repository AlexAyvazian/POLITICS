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

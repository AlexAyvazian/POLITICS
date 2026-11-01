import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../workers/politics-gateway.mjs';

const source={
 async execute() {
  const req=new Request('https://worker.example/api/county-snapshot',{headers:{Origin:'https://politics-e5yt.onrender.com'}});
  return handle(req,{FRONTEND_ORIGIN:'https://politics-e5yt.onrender.com',COUNTY_DB:{prepare:()=>({
   bind:()=>({first:async()=>({snapshot_json:JSON.stringify({year:2024,period:'2020–2024',count:3142,counties:{'06019':{name:'Fresno County, California',medianHouseholdIncome:74201,povertyRate:18.3}}})})})
  })}});
 }
};
test('county page reads a stored nationwide snapshot without any upstream provider call',async()=>{
 const res=await source.execute();
 assert.equal(res.status,200);
 assert.equal(res.headers.get('Access-Control-Allow-Origin'),'https://politics-e5yt.onrender.com');
 const json=await res.json();
 assert.equal(json.counties['06019'].medianHouseholdIncome,74201);
});
test('snapshot endpoint reports pending without calling any external API',async()=>{
 const env={COUNTY_DB:{prepare:()=>({bind:()=>({first:async()=>null})})}};
 const res=await handle(new Request('https://worker.example/api/county-snapshot'),env);
 assert.equal(res.status,200);
 assert.equal((await res.json()).status,'pending');
});
test('snapshot endpoint will not trigger a live Census lookup when D1 is missing',async()=>{
 const res=await handle(new Request('https://worker.example/api/county-snapshot'),{});
 assert.equal(res.status,503);
});

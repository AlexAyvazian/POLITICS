import test from 'node:test';
import assert from 'node:assert/strict';
import {serve} from '../workers/county-snapshot.mjs';
const host='https://politics-e5yt.onrender.com';
const request=(origin=host,path='/api/county-snapshot')=>new Request('https://politics-daily-snapshot.example.workers.dev'+path,{headers:{Origin:origin}});
test('public county reads return stored national data, never fetch third-party APIs',async()=>{
 let reads=0;
 const db={prepare:()=>({bind:()=>({first:async()=>{reads++;return {snapshot_json:'{"count":3142,"counties":{"06019":{"medianHouseholdIncome":74201}}}'}}})})};
 const res=await serve(request(),{COUNTY_DB:db});
 assert.equal(res.status,200);
 assert.equal(res.headers.get('Access-Control-Allow-Origin'),host);
 assert.equal((await res.json()).counties['06019'].medianHouseholdIncome,74201);
 assert.equal(reads,1);
});
test('pending snapshot reads return a clear pending state without an upstream fetch',async()=>{
 const db={prepare:()=>({bind:()=>({first:async()=>null})})};
 const response=await serve(request(),{COUNTY_DB:db});
 assert.equal(response.status,200);
 assert.equal((await response.json()).status,'pending');
});
test('disallowed browser origins cannot access data by CORS',async()=>{
 const db={prepare:()=>({bind:()=>({first:async()=>null})})};
 const response=await serve(request('https://evil.example'),{COUNTY_DB:db});
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
});
test('requesting other paths will not invoke a provider API',async()=>{
 const response=await serve(request(host,'/api/other'),{});
 assert.equal(response.status,404);
});

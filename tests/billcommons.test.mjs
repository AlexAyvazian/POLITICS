import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshBillCommonsState } from '../workers/politics-gateway.mjs';
import { serve } from '../workers/county-snapshot.mjs';
const today=new Date('2026-11-01T18:00:00Z');
function db(){const writes=[];return {writes,prepare:()=>({bind:(...params)=>({run:async()=>{writes.push(params)}})})};}
test('keyless Bill Commons state list reads bounded official endpoint and caches a D1 snapshot',async()=>{
 const store=db(),seen=[];
 const fetcher=async (raw)=>{
  const url=new URL(raw);seen.push(url);
  return new Response(JSON.stringify({data:[
   {id:'abc-123',identifier:'HB 920',title:'A bill regarding schools',status:'In committee',updated_at:'2026-10-27T00:00:00Z'},
   {id:'def-456',identifier:'SB 101',title:'Other measure',status:'Passed'}
  ],pagination:{page:1,per_page:12,total:200,total_pages:17},meta:{source_freshness:null,api_version:'v1'}}),{status:200});
 };
 const res=await refreshBillCommonsState({COUNTY_DB:store},'NC',fetcher,today);
 assert.equal(res.count,2);
 assert.equal(seen.length,1);
 assert.equal(seen[0].origin,'https://api.billcommons.org');
 assert.equal(seen[0].pathname,'/api/v1/bills');
 assert.equal(seen[0].searchParams.get('jurisdiction'),'NC');
 assert.equal(seen[0].searchParams.get('per_page'),'12');
 assert.equal(store.writes[0][0],'billcommons_NC');
 const data=JSON.parse(store.writes[0][1]);
 assert.equal(data.items[0].identifier,'HB 920');
 assert.equal(data.items[0].title,'A bill regarding schools');
 assert.equal(data.meta.source_freshness,null);
 assert.equal(data.count,2);
 assert.equal(data.total,200);
 assert.equal(data.source,'Bill Commons');
});
test('Bill Commons rejects invalid state codes and preserves prior records on upstream errors',async()=>{
 const store=db();
 await assert.rejects(refreshBillCommonsState({COUNTY_DB:store},'XY',async()=>{throw Error('unexpected');},today));
 await assert.rejects(refreshBillCommonsState({COUNTY_DB:store},'NC',async()=>new Response('rate limited',{status:429}),today));
 await assert.rejects(refreshBillCommonsState({COUNTY_DB:store},'NC',async()=>new Response(JSON.stringify({data:[],pagination:{total:0}})),today));
 assert.equal(store.writes.length,0);
});
function request(path){return new Request('https://reader.test'+path,{headers:{Origin:'https://politics-e5yt.onrender.com'}})}
function fakeDb(records){return {prepare:()=>({bind:source=>({first:async()=>records[source]?{snapshot_json:JSON.stringify(records[source])}:null})})};}
test('Bill Commons reader serves only cached state data, returns pending for not collected, and validates state',async()=>{
 const snap={state:'CA',source:'Bill Commons',count:1,items:[{identifier:'AB 1',title:'Example'}]};
 const env={COUNTY_DB:fakeDb({billcommons_CA:snap})};
 const res=await serve(request('/api/bills-snapshot?state=CA'),env);
 assert.equal(res.status,200);
 assert.equal((await res.json()).items[0].identifier,'AB 1');
 const pending=await serve(request('/api/bills-snapshot?state=TX'),env);
 assert.equal(pending.status,200);
 assert.equal((await pending.json()).status,'pending');
 const bad=await serve(request('/api/bills-snapshot?state=BOGUS'),env);
 assert.equal(bad.status,400);
});

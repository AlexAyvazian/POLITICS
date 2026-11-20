import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {serve} from '../workers/county-snapshot.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const req=path=>new Request('https://reader.example'+path,{headers:{Origin:'https://politics-e5yt.onrender.com'}});
function db(rows){
 return {prepare(sql){return {
  bind(...args){return {
   first:async()=>null,
   all:async()=>({results:rows.filter(r=>!args.length||args.includes(r.source))})
  }},
  all:async()=>({results:rows})
 }}};
}

test('public data health endpoint reports stored datasets without exposing credentials',async()=>{
 const env={
  COUNTY_DB:db([
   {source:'congress_members_current',refreshed_at:'2026-11-20T05:00:00Z',record_count:532},
   {source:'member_finance_collection_health',refreshed_at:'2026-11-20T07:30:00Z',record_count:5},
   {source:'member_lobby_collection_health',refreshed_at:'2026-11-20T07:45:00Z',record_count:0}
  ]),
  CATEGORY_DB_HOUSING:db([{source:'census_housing',refreshed_at:'2026-11-20T00:00:00Z',record_count:3222}]),
  CATEGORY_DB_HEALTHCARE:db([{source:'cdc_places_2025',refreshed_at:'2026-11-20T04:30:00Z',record_count:3143}])
 };
 const res=await serve(req('/api/data-health'),env);
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.status,'operational');
 assert.equal(body.datasets.find(x=>x.source==='census_housing').records,3222);
 assert.equal(body.datasets.find(x=>x.source==='cdc_places_2025').records,3143);
 assert.equal(body.datasets.find(x=>x.source==='member_lobby_collection_health').records,0);
 assert.ok(!JSON.stringify(body).match(/API_KEY|TOKEN|credential/i));
});

test('sources page is a real public transparency surface instead of a redirect',()=>{
 const html=read('sources.html'),js=read('assets/js/sources.js'),css=read('assets/css/sources.css');
 assert.doesNotMatch(html,/http-equiv="refresh"/i);
 assert.match(html,/Data Sources &amp; Health/);
 assert.match(html,/id="sourceGrid"/);
 assert.match(js,/\/api\/data-health/);
 assert.match(js,/\/api\/catalog/);
 assert.match(css,/sourceHealthCard/);
});

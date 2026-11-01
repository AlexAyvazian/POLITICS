import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAirNowObservations,normalizeAirNowRows} from '../src/server/airnow.mjs';
const req=zip=>new Request('https://example.org/api/airnow/observations?zip='+encodeURIComponent(zip));
test('rejects invalid ZIP before upstream request',async()=>{
 let called=false;
 const response=await handleAirNowObservations(req('garbage'),{AIRNOW_AQS_API_KEY:'mock-key'},{fetchImpl:async()=>{called=true;}});
 assert.equal(response.status,400);assert.equal(called,false);
});
test('returns explicit unconfigured response when variable missing',async()=>{
 const response=await handleAirNowObservations(req('93720'),{});
 assert.equal(response.status,503);
 assert.match((await response.json()).error,/not configured/);
});
test('uses 2026 AirNow replacement endpoint and normalizes sample JSON',async()=>{
 let requested;
 const fetchImpl=async url=>{
  requested=new URL(url);
  return new Response(JSON.stringify([{parameterName:'PM2.5',nowcastAQI:77,category:{name:'Moderate'},reportingArea:'Fresno',stateCode:'CA',dateObserved:'2026-10-31',hourObserved:10}]),{status:200});
 };
 const response=await handleAirNowObservations(req('93720'),{AIRNOW_AQS_API_KEY:'mock-key'},{fetchImpl,clock:()=>new Date('2026-10-31T18:00:00Z')});
 assert.equal(response.status,200);
 assert.equal(requested.pathname,'/aq/observation/current/ziplatlong/');
 assert.equal(requested.searchParams.get('zipcode'),'93720');
 assert.equal(requested.searchParams.get('API_KEY'),'mock-key');
 const body=await response.json();
 assert.equal(body.observations[0].aqi,77);
 assert.equal(body.observations[0].category,'Moderate');
 assert.equal(body.zip,'93720');
 assert.ok(!JSON.stringify(body).includes('mock-key'));
});
test('normalizes older capitalized output and zero AQI',()=>{
 const rows=normalizeAirNowRows([{ParameterName:'O3',AQI:0,Category:{Name:'Good'},ReportingArea:'Central Valley'}]);
 assert.deepEqual(rows.map(r=>[r.pollutant,r.aqi,r.category]),[['O3',0,'Good']]);
});
test('redacts upstream error text and does not cache errors',async()=>{
 const response=await handleAirNowObservations(req('93720'),{AIRNOW_AQS_API_KEY:'mock-key'},{fetchImpl:async()=>new Response('private upstream response',{status:401})});
 assert.equal(response.status,502);
 assert.ok(!JSON.stringify(await response.json()).includes('private'));
 assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('rejects malformed upstream JSON',async()=>{
 const response=await handleAirNowObservations(req('93720'),{AIRNOW_AQS_API_KEY:'mock-key'},{fetchImpl:async()=>new Response('not-json',{status:200})});
 assert.equal(response.status,502);
});

test('rejects a different variable name rather than silently using it',async()=>{
 const response=await handleAirNowObservations(req('93720'),{AIRNOW_API_KEY:'other-binding'});
 assert.equal(response.status,503);
});

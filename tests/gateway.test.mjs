import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../workers/politics-gateway.mjs';
const vars=['BEA_API_KEY','BLS_API_KEY','CENSUS-API-KEY','CONGRESS_API_KEY','DATA_GOV_API_KEY','EIA_API_KEY','FDA_API_KEY','FDIC_API_KEY','FEC_API_KEY','FEDERAL_RESERVE_API_KEY','GOVINFO_API_KEY','LDA_API_KEY','MAPTILER_API_KEY','NOAA_API_KEY','OPENSTATES_API_KEY','REGULATIONS_API_KEY','USGS_API_KEY'];
const env=Object.fromEntries(vars.map(v=>[v,'test-'+v]));
const req=(p)=>new Request('https://example.workers.dev'+p);
test('catalog lists exactly 26 supported sources',async()=>{
 const r=await handle(req('/api/catalog'),env);
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.providers.length,26);
 assert.equal(data.providers.find(x=>x.id==='census').configured,true);
});
test('unknown provider gets 404 and cannot SSRF arbitrary URLs',async()=>{
 const r=await handle(req('/api/https://example.com'),env);
 assert.equal(r.status,404);
});
test('validates county, zip, candidate q without upstream calls',async()=>{
 for(const p of ['/api/census','/api/bea','/api/airnow','/api/fec']){
  const r=await handle(req(p),env);
  assert.equal(r.status,400,p);
 }
});
test('adapters use fixed origins, correct bindings and no keys in response',async()=>{
 const cases={
  bea:'/api/bea?county=06019',bls:'/api/bls?county=06019',
  census:'/api/census?county=06019',congress:'/api/congress',
  datagov:'/api/datagov?q=housing',eia:'/api/eia?state=CA',
  fda:'/api/fda',fdic:'/api/fdic?state=CA',fec:'/api/fec?q=Smith',
  fred:'/api/fred?series=UNRATE',govinfo:'/api/govinfo?q=Medicare',lda:'/api/lda?q=Medicare',
  maptiler:'/api/maptiler?q=Fresno',
  noaa:'/api/noaa',openstates:'/api/openstates?jurisdiction=ca',
  regulations:'/api/regulations',usgs:'/api/usgs'
 };
 const urls={};
 for(const [provider,path] of Object.entries(cases)){
  const calls=[];
  const fake=async (url,opts)=>{calls.push({url,opts});return new Response(JSON.stringify({items:[{id:provider}]}),{status:200,headers:{'Content-Type':'application/json'}});};
  const result=await handle(req(path),env,{},fake);
  assert.equal(result.status,200,provider);
  const body=await result.json();
  assert.equal(body.provider,provider);
  assert.equal(calls.length,1);
  assert.ok(calls[0].url.startsWith('https://'),provider);
  assert.ok(!JSON.stringify(body).includes('test-'),provider);
  urls[provider]=new URL(calls[0].url).hostname;
 }
 assert.equal(Object.keys(urls).length,18);
 assert.equal(urls.census,'api.census.gov');
});

test('AirNow gateway is keyless and resolves ZIP through official public files',async()=>{
 const calls=[];
 const fake=async url=>{
  calls.push(new URL(url));
  if(String(url).endsWith('/cityzipcodes.csv'))return new Response('City|State|Zipcode|Latitude|Longitude\nFresno|CA|93720|36.8486|-119.7814\n',{status:200});
  return new Response('11/20/26|11/20/26|23:00|PST|0|O|Y|Fresno|CA|36.7806|-119.7929|PM2.5|83|Moderate|No||San Joaquin Valley Unified APCD\n',{status:200});
 };
 const result=await handle(req('/api/airnow?zip=93720'),{}, {},fake);
 assert.equal(result.status,200);
 assert.equal(calls.length,2);
 assert.equal(calls[0].hostname,'files.airnowtech.org');
 assert.equal(calls[1].hostname,'files.airnowtech.org');
 const body=await result.json();
 assert.equal(body.data[0].ReportingArea,'Fresno');
 assert.equal(body.data[0].AQI,83);
});

test('worker does not depend on dashboard-variable renaming or a private database',async()=>{
 const r=await handle(req('/api/census?county=06019'),{'CENSUS_API_KEY':'not-the-actual-binding'});
 assert.equal(r.status,503);
});

test('Open States gateway can request state people with the existing key and keep the bills default',async()=>{
 const seen=[];
 const fetcher=async (url,options)=>{
  seen.push({url,options});
  return new Response(JSON.stringify({results:[{id:'ocd-person/test',name:'Example Person'}]}),{status:200});
 };
 const state=new Request('https://example.workers.dev/api/openstates?jurisdiction=ca&record=people&limit=4');
 const res=await handle(state,env,{},fetcher);
 assert.equal(res.status,200);
 assert.match(new URL(seen[0].url).pathname,/\/people$/);
 assert.equal(seen[0].options.headers['X-API-KEY'],'test-OPENSTATES_API_KEY');
});

test('Congress.gov uses validated existing cross-agency 40-character key when Congress binding is malformed',async()=>{
 const valid='Z'.repeat(40),seen=[];
 const fetcher=async url=>{
  const u=new URL(url);seen.push(u);
  return new Response(JSON.stringify({bills:[{number:'123',title:'Test bill'}]}),{status:200});
 };
 const res=await handle(new Request('https://example.workers.dev/api/congress?limit=1'),
  {CONGRESS_API_KEY:'invalid-39-character-old-key',FEC_API_KEY:valid}, {},fetcher);
 assert.equal(res.status,200);
 assert.equal(seen.length,1);
 assert.equal(seen[0].searchParams.get('api_key'),valid);
 assert.equal((await res.json()).provider,'congress');
});


test('GovInfo topical search uses POST search service without leaking the API key into output',async()=>{
 const seen=[];
 const fetcher=async(url,options)=>{
  seen.push({url:new URL(url),options});
  return new Response(JSON.stringify({count:1,results:[{title:'Official publication',packageId:'TEST-1'}]}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const res=await handle(req('/api/govinfo?q=Medicare&limit=7'),env,{},fetcher);
 assert.equal(res.status,200);
 assert.equal(seen.length,1);
 assert.equal(seen[0].url.hostname,'api.govinfo.gov');
 assert.equal(seen[0].url.pathname,'/search');
 assert.equal(seen[0].options.method,'POST');
 const requestBody=JSON.parse(seen[0].options.body);
 assert.equal(requestBody.query,'Medicare');
 assert.equal(requestBody.pageSize,'7');
 assert.equal(requestBody.offsetMark,'*');
 assert.equal(requestBody.sorts[0].field,'publishdate');
 const body=await res.json();
 assert.equal(body.provider,'govinfo');
 assert.equal(JSON.stringify(body).includes('test-GOVINFO_API_KEY'),false);
});

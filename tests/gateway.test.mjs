import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../workers/politics-gateway.mjs';
const vars=['AIRNOW_AQS_API_KEY','BEA_API_KEY','BLS_API_KEY','CENSUS-API-KEY','CONGRESS_API_KEY','DATA_GOV_API_KEY','EIA_API_KEY','FDA_API_KEY','FDIC_API_KEY','FEC_API_KEY','FEDERAL_RESERVE_API_KEY','GOVINFO_API_KEY','LDA_API_KEY','LOBBYVIEW_API_KEY','LOBBYVIEW_API_KEY_2','LOBBYVIEW_API_KEY_3','MAPTILER_API_KEY','NOAA_API_KEY','OPENSTATES_API_KEY','REGULATIONS_API_KEY','USGS_API_KEY'];
const env=Object.fromEntries(vars.map(v=>[v,'test-'+v]));
const req=(p)=>new Request('https://example.workers.dev'+p);
test('catalog lists exactly 27 supported sources and 3 LobbyView accounts',async()=>{
 const r=await handle(req('/api/catalog'),env);
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.providers.length,27);
 assert.equal(data.providers.find(x=>x.id==='lobbyview').configured,3);
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
  airnow:'/api/airnow?zip=93720',bea:'/api/bea?county=06019',bls:'/api/bls?county=06019',
  census:'/api/census?county=06019',congress:'/api/congress',
  datagov:'/api/datagov?q=housing',eia:'/api/eia?state=CA',
  fda:'/api/fda',fdic:'/api/fdic?state=CA',fec:'/api/fec?q=Smith',
  fred:'/api/fred?series=UNRATE',govinfo:'/api/govinfo',lda:'/api/lda',
  lobbyview:'/api/lobbyview',maptiler:'/api/maptiler?q=Fresno',
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
 assert.equal(Object.keys(urls).length,19);
 assert.equal(urls.census,'api.census.gov');
 assert.equal(urls.lobbyview,'rest-api.lobbyview.org');
});
test('three distinct LobbyView account variables rotate across consecutive requests',async()=>{
 const tokens=[];
 for(let i=0;i<3;i++){
  const r=await handle(req('/api/lobbyview'),env,{},async (_,opts)=>{
   tokens.push(opts.headers.token);
   return new Response('{"data":[]}',{status:200});
  });
  assert.equal(r.status,200);
 }
 assert.equal(new Set(tokens).size,3);
});
test('LobbyView retries a different configured account after a 429',async()=>{
 const seen=[];
 const r=await handle(req('/api/lobbyview'),env,{},async (_,opts)=>{
  seen.push(opts.headers.token);
  return new Response('{"data":[]}',{status:seen.length===1?429:200});
 });
 assert.equal(r.status,200);
 assert.equal(seen.length,2);
 assert.notEqual(seen[0],seen[1]);
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

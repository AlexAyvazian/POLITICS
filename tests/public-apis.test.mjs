import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../workers/politics-gateway.mjs';
const request=path=>new Request('https://example.workers.dev'+path);
const cases={
 cfpb:['/api/cfpb?state=CA&q=mortgage','www.consumerfinance.gov'],
 cms:['/api/cms?state=CA','data.cms.gov'],
 hmda:['/api/hmda?county=06019&year=2025','ffiec.cfpb.gov'],
 federalregister:['/api/federalregister?q=housing','www.federalregister.gov'],
 sec:['/api/sec?cik=320193','data.sec.gov'],
 usaspending:['/api/usaspending?county=06019','api.usaspending.gov']
};
test('six keyless sources are shown as public with empty binding environment',async()=>{
 const r=await handle(request('/api/catalog'),{});
 const body=await r.json();
 assert.equal(body.providers.length,27);
 assert.equal(body.providers.filter(x=>x.access==='keyless-public').length,6);
 for(const id of Object.keys(cases))assert.equal(body.providers.find(x=>x.id===id).configured,true);
 for(const id of ['epa_aqs','fcc_broadband'])assert.equal(body.providers.find(x=>x.id===id).configured,false);
});
for(const [id,[path,host]] of Object.entries(cases)){
 test(id+' builds a fixed public endpoint and returns parsed JSON with no key',async()=>{
  let called;
  const fake=async (url,opts)=>{called={url:new URL(url),opts};return new Response('{"ok_from_origin":true}',{status:200});};
  const r=await handle(request(path),{}, {},fake);
  assert.equal(r.status,200);
  assert.equal((await r.json()).provider,id);
  assert.equal(called.url.hostname,host);
  assert.ok(!called.url.searchParams.has('api_key'));
  assert.ok(!called.url.searchParams.has('key'));
  if(id==='usaspending'){
   assert.equal(called.opts.method,'POST');
   const body=JSON.parse(called.opts.body);
   assert.equal(body.geo_layer,'county');
   assert.deepEqual(body.geo_layer_filters,['06019']);
  }
  if(id==='sec')assert.equal(called.url.pathname,'/submissions/CIK0000320193.json');
 });
}
test('EPA AQS and FCC are explicitly held pending credentials, not called anonymously',async()=>{
 let calls=0;
 for(const id of ['epa_aqs','fcc_broadband']){
  const r=await handle(request('/api/'+id+'?county=06019'),{}, {},async()=>{calls++;return new Response('{}');});
  assert.equal(r.status,503);
 }
 assert.equal(calls,0);
});
test('EPA AQS and FCC build authenticated fixed routes with configured bindings',async()=>{
 const epa={EPA_AQS_KEY:'test-aqs',EPA_AQS_EMAIL:'registered@example.test'};
 const fcc={FCC_BDC_TOKEN:'test-token',FCC_BDC_USERNAME:'account@example.test'};
 let urls=[];
 for(const [path,env] of [['/api/epa_aqs?county=06019&year=2025',epa],['/api/fcc_broadband',fcc]]){
  const r=await handle(request(path),env,{},async (u,opts)=>{urls.push({u,opts});return new Response('{"data":[]}');});
  assert.equal(r.status,200);
  const body=JSON.stringify(await r.json());
  assert.ok(!body.includes('test-aqs')&&!body.includes('test-token'));
 }
 assert.equal(new URL(urls[0].u).hostname,'aqs.epa.gov');
 assert.equal(urls[1].opts.headers.hash_value,'test-token');
});
test('input validation blocks bogus company IDs, years, and counties',async()=>{
 for(const path of ['/api/sec?cik=abc','/api/hmda?county=bad','/api/usaspending?county=bad','/api/epa_aqs?county=abc']){
  const r=await handle(request(path),{EPA_AQS_KEY:'mock',EPA_AQS_EMAIL:'contact@example.test'});
  assert.equal(r.status,400,path);
 }
});

test('EPA response request URLs never reproduce account credentials',async()=>{
 const env={EPA_AQS_KEY:'secret-epa-value',EPA_AQS_EMAIL:'email@example.test'};
 const input='/api/epa_aqs?county=06019&year=2025';
 const r=await handle(request(input),env,{},async u=>new Response(JSON.stringify({Header:[{url:u}],Data:[]})));
 assert.equal(r.status,200);
 const body=JSON.stringify(await r.json());
 assert.ok(!body.includes('secret-epa-value'));
 assert.ok(!body.includes('email@example.test'));
});

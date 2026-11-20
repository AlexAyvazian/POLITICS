import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../workers/politics-gateway.mjs';
const req=path=>new Request('https://example.workers.dev'+path);

test('LDA adapter maps voter search modes to documented filings filters',async()=>{
 let called;
 const fake=async (url,opts)=>{called={url:new URL(url),opts};return new Response(JSON.stringify({count:1,results:[]}),{status:200});};
 const r=await handle(req('/api/lda?mode=issue&q=Charlotte%20Woodward&year=2026&limit=5'),{LDA_API_KEY:'test-key'},{},fake);
 assert.equal(r.status,200);
 assert.equal(called.url.hostname,'lda.gov');
 assert.equal(called.url.pathname,'/api/v1/filings/');
 assert.equal(called.url.searchParams.get('filing_year'),'2026');
 assert.equal(called.url.searchParams.get('filing_specific_lobbying_issues'),'Charlotte Woodward');
 assert.equal(called.url.searchParams.get('page_size'),'5');
 assert.equal(called.url.searchParams.get('ordering'),'-dt_posted');
 assert.equal(called.url.searchParams.has('search'),false);
 assert.equal(called.opts.headers.Authorization,'Token test-key');
});
for(const [mode,param] of [['client','client_name'],['registrant','registrant_name']]){
 test('LDA '+mode+' search uses '+param,async()=>{
  let url;
  const fake=async u=>{url=new URL(u);return new Response('{"count":0,"results":[]}');};
  const r=await handle(req('/api/lda?mode='+mode+'&q=Example&year=2026'),{LDA_API_KEY:'key'},{},fake);
  assert.equal(r.status,200);
  assert.equal(url.searchParams.get(param),'Example');
 });
}
test('LDA search validates mode, year, and query before upstream fetch',async()=>{
 let calls=0;
 for(const path of ['/api/lda?mode=bad&q=x','/api/lda?mode=issue&q=&year=2026','/api/lda?mode=issue&q=test&year=1998']){
  const r=await handle(req(path),{LDA_API_KEY:'key'},{},async()=>{calls++;return new Response('{}');});
  assert.equal(r.status,400,path);
 }
 assert.equal(calls,0);
});

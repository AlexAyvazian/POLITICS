import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handle} from '../workers/politics-gateway.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const req=p=>new Request('https://example.workers.dev'+p);

test('SEC supports voter-facing company lookup without requiring a CIK first',async()=>{
 const calls=[];
 const origin={
  0:{cik_str:320193,ticker:'AAPL',title:'Apple Inc.'},
  1:{cik_str:789019,ticker:'MSFT',title:'MICROSOFT CORP'}
 };
 const res=await handle(req('/api/sec?q=apple'),{}, {},async(url,options)=>{
  calls.push({url:new URL(url),options});
  return new Response(JSON.stringify(origin),{status:200});
 });
 assert.equal(res.status,200);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url.hostname,'www.sec.gov');
 assert.equal(calls[0].url.pathname,'/files/company_tickers.json');
 assert.match(calls[0].options.headers['User-Agent'],/POLITICS/);
 const body=await res.json();
 assert.equal(body.data.results.length,1);
 assert.equal(body.data.results[0].ticker,'AAPL');
 assert.equal(body.data.results[0].cik,'0000320193');
});

test('SEC exact CIK still returns the official submissions record',async()=>{
 let called;
 const res=await handle(req('/api/sec?cik=320193'),{}, {},async(url,options)=>{
  called={url:new URL(url),options};
  return new Response(JSON.stringify({name:'Apple Inc.',cik:'0000320193',filings:{recent:{form:['10-Q'],accessionNumber:['0001'],filingDate:['2026-11-01'],primaryDocument:['a10q.htm']}}}),{status:200});
 });
 assert.equal(res.status,200);
 assert.equal(called.url.hostname,'data.sec.gov');
 assert.equal(called.url.pathname,'/submissions/CIK0000320193.json');
});

test('Data Sources exposes live FRED and SEC research tools',()=>{
 const html=read('sources.html'),js=read('assets/js/sources.js'),css=read('assets/css/sources.css');
 assert.match(html,/id="researchTools"/);
 assert.match(html,/data-fred-tool/);
 assert.match(html,/data-sec-tool/);
 assert.match(js,/function wireFredTool/);
 assert.match(js,/function wireSecTool/);
 assert.match(js,/\/api\/fred\?series=/);
 assert.match(js,/\/api\/sec\?q=/);
 assert.match(js,/\/api\/sec\?cik=/);
 assert.match(js,/fred:\{[^}]*onDemandLive:true/s);
 assert.match(js,/sec:\{[^}]*onDemandLive:true/s);
 assert.match(css,/\.researchTools/);
 assert.match(css,/\.researchResult/);
});

test('FCC result links directly to selected county Area Summary rather than implying metadata is county coverage',()=>{
 const map=read('assets/js/map.js');
 assert.match(map,/broadbandmap\.fcc\.gov\/area-summary\/fixed/);
 assert.match(map,/geoid=/);
 assert.match(map,/type=county/);
 assert.match(map,/release metadata/i);
});

test('Jobs & Economy exposes national FRED context without relabeling it as county data',()=>{
 const map=read('assets/js/map.js');
 assert.match(map,/function renderFredEconomicContext/);
 assert.match(map,/function wireFredEconomicContext/);
 assert.match(map,/\/api\/fred\?series=/);
 assert.match(map,/national economic context/i);
 assert.match(map,/not a county/i);
 assert.match(map,/tab==='economy'[\s\S]*renderFredEconomicContext/);
});

test('Data Sources exposes Data.gov discovery and openFDA animal-safety research tools',()=>{
 const html=read('sources.html'),js=read('assets/js/sources.js');
 assert.match(html,/data-datagov-tool/);
 assert.match(html,/data-fda-tool/);
 assert.match(js,/function wireDataGovTool/);
 assert.match(js,/function wireFdaTool/);
 assert.match(js,/\/api\/datagov\?q=/);
 assert.match(js,/\/api\/fda\?q=/);
 const datagov=js.match(/datagov:\{[^}]+\}/s)?.[0]||'';
 const fda=js.match(/fda:\{[^}]+\}/s)?.[0]||'';
 assert.match(datagov,/onDemandLive:true/);
 assert.match(fda,/onDemandLive:true/);
 assert.match(fda,/adverse-event/i);
});

test('openFDA veterinary route supports bounded active-ingredient search',async()=>{
 const calls=[];
 const env={FDA_API_KEY:'test-fda'};
 const res=await handle(req('/api/fda?q=carprofen&limit=5'),env,{},async(url)=>{
  const u=new URL(url);calls.push(u);
  return new Response(JSON.stringify({meta:{last_updated:'2026-07-02'},results:[{animal:{species:'Dog'},drug:[{brand_name:'Example',active_ingredients:[{name:'Carprofen'}]}],serious_ae:'No'}]}),{status:200});
 });
 assert.equal(res.status,200);
 assert.equal(calls.length,1);
 assert.equal(calls[0].hostname,'api.fda.gov');
 assert.equal(calls[0].pathname,'/animalandveterinary/event.json');
 assert.match(calls[0].searchParams.get('search')||'',/drug\.active_ingredients\.name/);
 assert.match(calls[0].searchParams.get('search')||'',/carprofen/i);
 assert.equal(calls[0].searchParams.get('sort'),'original_receive_date:desc');
 assert.equal(calls[0].searchParams.get('limit'),'5');
});

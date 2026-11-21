import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handle} from '../workers/politics-gateway.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const req=p=>new Request('https://example.workers.dev'+p);

test('NOAA live route requests recent county climate observations instead of only the dataset catalog',async()=>{
 const calls=[];
 const env={NOAA_API_KEY:'test-noaa'};
 const res=await handle(req('/api/noaa?county=06019&days=30&limit=12'),env,{},async(url,options)=>{
  calls.push({url:new URL(url),options});
  return new Response(JSON.stringify({results:[{date:'2026-11-20T00:00:00',datatype:'TMAX',station:'GHCND:TEST',value:72}]}),{status:200});
 });
 assert.equal(res.status,200);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url.hostname,'www.ncei.noaa.gov');
 assert.equal(calls[0].url.pathname,'/cdo-web/api/v2/data');
 assert.equal(calls[0].url.searchParams.get('datasetid'),'GHCND');
 assert.equal(calls[0].url.searchParams.get('locationid'),'FIPS:06019');
 assert.equal(calls[0].url.searchParams.get('units'),'standard');
 assert.match(calls[0].url.searchParams.get('datatypeid')||'',/TMAX/);
 assert.match(calls[0].url.searchParams.get('datatypeid')||'',/TMIN/);
 assert.match(calls[0].url.searchParams.get('datatypeid')||'',/PRCP/);
 assert.equal(calls[0].options.headers.token,'test-noaa');
 assert.equal(JSON.stringify(await res.json()).includes('test-noaa'),false);
});

test('USGS live route filters recent daily mean streamflow to the selected county',async()=>{
 const calls=[];
 const env={USGS_API_KEY:'test-usgs'};
 const res=await handle(req('/api/usgs?county=06019&limit=12'),env,{},async(url,options)=>{
  calls.push({url:new URL(url),options});
  return new Response(JSON.stringify({type:'FeatureCollection',features:[]}),{status:200});
 });
 assert.equal(res.status,200);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url.hostname,'api.waterdata.usgs.gov');
 assert.equal(calls[0].url.pathname,'/ogcapi/v1/collections/latest-continuous/items');
 assert.equal(calls[0].url.searchParams.get('state_code'),'06');
 assert.equal(calls[0].url.searchParams.get('county_code'),'019');
 assert.equal(calls[0].url.searchParams.get('parameter_code'),'00060');
 assert.equal(calls[0].url.searchParams.get('api_key'),'test-usgs');
});


test('AirNow live route resolves ZIPs through official keyless file products',async()=>{
 const calls=[];
 const res=await handle(req('/api/airnow?zip=93720'),{}, {},async(url)=>{
  calls.push(new URL(url));
  if(String(url).endsWith('/cityzipcodes.csv'))
   return new Response('City|State|Zipcode|Latitude|Longitude\nFresno|CA|93720|36.8486|-119.7814\n',{status:200});
  return new Response('11/20/26|11/20/26|23:00|PST|0|O|Y|Fresno|CA|36.7806|-119.7929|PM2.5|83|Moderate|No||San Joaquin Valley Unified APCD\n',{status:200});
 });
 assert.equal(res.status,200);
 assert.equal(calls.length,2);
 assert.equal(calls[0].hostname,'files.airnowtech.org');
 assert.equal(calls[0].pathname,'/airnow/today/cityzipcodes.csv');
 assert.equal(calls[1].pathname,'/airnow/today/reportingarea.dat');
 const body=await res.json();
 assert.equal(body.data[0].ReportingArea,'Fresno');
 assert.equal(body.data[0].AQI,83);
 assert.equal(body.data[0].ParameterName,'PM2.5');
});

test('FCC live route uses the current National Broadband Map public API host',async()=>{
 const calls=[];
 const env={FCC_BDC_TOKEN:'test-fcc',FCC_BDC_USERNAME:'user@example.com'};
 const res=await handle(req('/api/fcc_broadband'),env,{},async(url,options)=>{
  calls.push({url:new URL(url),options});
  return new Response(JSON.stringify({data:[{data_type:'availability',as_of_date:'2026-06-30'}]}),{status:200});
 });
 assert.equal(res.status,200);
 assert.equal(calls[0].url.hostname,'broadbandmap.fcc.gov');
 assert.equal(calls[0].url.pathname,'/api/public/map/listAsOfDates');
 assert.equal(calls[0].options.headers.username,'user@example.com');
 assert.equal(calls[0].options.headers.hash_value,'test-fcc');
});

test('Infrastructure & Environment exposes explicit live NOAA, USGS, AirNow and FCC actions',()=>{
 const map=read('assets/js/map.js');
 const css=read('assets/css/map.css');
 const sources=read('assets/js/sources.js');
 for(const text of ['NOAA','USGS','AirNow','FCC'])assert.match(map,new RegExp(text));
 assert.match(map,/function renderLiveEnvironmentTools/);
 assert.match(map,/function wireLiveEnvironment/);
 assert.match(map,/\/api\/noaa\?county=/);
 assert.match(map,/\/api\/usgs\?county=/);
 assert.match(map,/\/api\/airnow\?zip=/);
 assert.match(map,/\/api\/fcc_broadband/);
 assert.match(map,/tab==='infrastructure'[\s\S]*renderLiveEnvironmentTools/);
 assert.match(css,/liveEnvironmentSection/);
 assert.match(css,/liveDataActions/);
 for(const id of ['airnow','noaa','usgs','fcc_broadband']){
  const block=sources.match(new RegExp(id+':\\{[^}]+\\}','s'))?.[0]||'';
  assert.match(block,/onDemandLive:true/,id+' should be shown as live on demand once configured');
  assert.match(block,/County Atlas · Infrastructure/,id+' should point to the voter-facing Infrastructure surface');
 }
});

test('live environment copy preserves geographic and interpretive limits',()=>{
 const map=read('assets/js/map.js');
 assert.match(map,/station-level|monitoring-site/i);
 assert.match(map,/not a countywide|not countywide/i);
 assert.match(map,/reporting area/i);
 assert.match(map,/release metadata/i);
 assert.match(map,/does not measure.*performance|availability.*not.*performance/i);
});

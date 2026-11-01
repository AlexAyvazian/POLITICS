/* POLITICS: 19 allowlisted research API adapters; Cloudflare dashboard bindings only. */
/* PUBLIC KEYLESS DATA: These six provider endpoints require no API keys. */
const KEYLESS_SOURCES={
 cfpb:['finance','CFPB published consumer complaints (not adjudicated wrongdoing)',3600],
 cms:['health','CMS public Medicare provider enrollment',86400],
 hmda:['housing','FFIEC / HMDA county mortgage application aggregations',86400],
 federalregister:['policy','Federal Register official notices and rules (informational XML edition)',3600],
 sec:['influence','SEC EDGAR public company submissions, not political donations',21600],
 usaspending:['public-spending','USAspending geographic award obligations',21600]
};
function publicRoute(id,p){
 const num=(k,def,max)=>{const val=Number(p.get(k)||def);return Number.isInteger(val)&&val>=1&&val<=max?val:def;};
 const query=k=>{const v=p.get(k)||'';if(v.length>70||! /^[\p{L}\p{N} .,()'&\-]*$/u.test(v))throw Error('Invalid search');return v;};
 const state=p.get('state')||'CA';if(!/^[A-Za-z]{2}$/.test(state))throw Error('State must be two letters');
 const county=p.get('county')||'';if(county&&!/^\d{5}$/.test(county))throw Error('County FIPS must be five digits');
 const limit=num('limit',10,25);
 const make=(base,params)=>{const u=new URL(base);for(const [k,v] of Object.entries(params||{}))if(v!==''&&v!==undefined)u.searchParams.set(k,String(v));return u.toString();};
 let u,options={headers:{Accept:'application/json'}};
 switch(id){
 case 'cfpb':{
  const zip=p.get('zip')||'';if(zip&&!/^\d{5}$/.test(zip))throw Error('ZIP must be five digits');
  u=make('https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/',{size:limit,sort:'created_date_desc',no_highlight:'true',state:state.toUpperCase(),...(zip?{zip_code:zip}:{}),...(query('q')?{search_term:query('q')}:{})});break;}
 case 'cms':u=make('https://data.cms.gov/data-api/v1/dataset/2457ea29-fc82-48b0-86ec-3b0755de7515/data',{size:limit,offset:0,'filter[STATE_CD]':state.toUpperCase()});break;
 case 'hmda':{
  if(!county)throw Error('County FIPS required for mortgage data');
  const year=Number(p.get('year')||2025);if(!Number.isInteger(year)||year<2018||year>2025)throw Error('HMDA year must be 2018–2025');
  u=make('https://ffiec.cfpb.gov/v2/data-browser-api/view/aggregations',{years:year,counties:county,actions_taken:'1,2,3'});break;}
 case 'federalregister':u=make('https://www.federalregister.gov/api/v1/documents.json',{per_page:limit,order:'newest',...(query('q')?{'conditions[term]':query('q')}:{})});break;
 case 'sec':{
  const cik=p.get('cik')||'';if(!/^\d{1,10}$/.test(cik))throw Error('SEC requires a numeric CIK (1–10 digits)');
  u='https://data.sec.gov/submissions/CIK'+cik.padStart(10,'0')+'.json';
  options.headers['User-Agent']='POLITICS research website contact alex.ayvazian@outlook.com';
  break;}
 case 'usaspending':{
  if(!county)throw Error('Five-digit county FIPS required for spending geography');
  u='https://api.usaspending.gov/api/v2/search/spending_by_geography/';
  const to=new Date().toISOString().slice(0,10),from=String(Number(to.slice(0,4))-2)+to.slice(4);
  options={method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({filter:{time_period:[{start_date:from,end_date:to}]},geo_layer:'county',geo_layer_filters:[county],scope:'place_of_performance',spending_type:'obligation'})};
  break;}
 default:throw Error('Unknown keyless provider');
 }
 return {u,options};
}

/* Two documented provider APIs require credentials and cannot run keyless. */
const ACCESS_REQUIRED={
 epa_aqs:['environment','EPA validated county air-monitor summaries (historical)','EPA_AQS_KEY','EPA_AQS_EMAIL',86400],
 fcc_broadband:['infrastructure','FCC broadband availability-release metadata','FCC_BDC_TOKEN','FCC_BDC_USERNAME',86400]
};
function authenticatedPublicRoute(id,p,env){
 const b=ACCESS_REQUIRED[id],apiKey=key(env,b[2]),account=key(env,b[3]);
 if(!apiKey||!account)throw Error('Missing '+b[2]+' and/or '+b[3]);
 let u,options={headers:{Accept:'application/json'}};
 if(id==='epa_aqs'){
  const county=p.get('county')||'';
  if(!/^\d{5}$/.test(county))throw Error('EPA AQS needs a five-digit county FIPS');
  const year=Number(p.get('year')||2025);
  if(!Number.isInteger(year)||year<2000||year>2025)throw Error('Historical AQS year must be 2000–2025');
  const d=String(year);
  u=new URL('https://aqs.epa.gov/data/api/dailyData/byCounty');
  for(const [k,v] of Object.entries({email:account,key:apiKey,param:'88101',bdate:d+'0101',edate:d+'0107',state:county.slice(0,2),county:county.slice(2)}))u.searchParams.set(k,v);
  u=u.toString();
 }else{
  u='https://bdc.fcc.gov/api/public/map/listAsOfDates';
  options.headers.username=account;options.headers.hash_value=apiKey;
 }
 return {u,options};
}

const CATALOG={
 airnow:['AIRNOW_AQS_API_KEY','environment','Preliminary reporting-area air quality'],
 bea:['BEA_API_KEY','economy','County personal income'],
 bls:['BLS_API_KEY','economy','County unemployment or national CPI'],
 census:['CENSUS-API-KEY','economy','County income and poverty'],
 congress:['CONGRESS_API_KEY','policy','Federal legislation'],
 datagov:['DATA_GOV_API_KEY','research','Federal datasets catalog'],
 eia:['EIA_API_KEY','economy','State residential electricity prices'],
 fda:['FDA_API_KEY','health','Veterinary adverse-event reports (not prices)'],
 fdic:['FDIC_API_KEY','finance','Bank institutions'],
 fec:['FEC_API_KEY','influence','Federal candidate records'],
 fred:['FEDERAL_RESERVE_API_KEY','economy','Economic indicators'],
 govinfo:['GOVINFO_API_KEY','policy','Federal publications'],
 lda:['LDA_API_KEY','influence','Federal lobbying filings'],
 lobbyview:['LOBBYVIEW_API_KEY','influence','Lobbying research and legislator data'],
 maptiler:['MAPTILER_API_KEY','geography','Geocoding'],
 noaa:['NOAA_API_KEY','environment','Climate-data catalog (not disaster costs)'],
 openstates:['OPENSTATES_API_KEY','policy','State legislation'],
 regulations:['REGULATIONS_API_KEY','policy','Federal rulemaking'],
 usgs:['USGS_API_KEY','environment','Water observations (not disaster costs)']
};
const TTL={airnow:900,lobbyview:43200,bea:86400,bls:21600,census:86400,congress:3600,datagov:21600,eia:86400,fda:86400,fdic:86400,fec:3600,fred:21600,govinfo:21600,lda:3600,maptiler:86400,noaa:86400,openstates:3600,regulations:3600,usgs:10800};
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET, OPTIONS'};
const json=(data,status=200,ttl=0)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...CORS,'Cache-Control':ttl?'public, max-age=60, s-maxage='+ttl:'no-store'}});
const key=(env,name)=>typeof env[name]==='string'&&env[name].trim()?env[name].trim():null;
const qs=(url,query)=>{const u=new URL(url);for(const [k,v] of Object.entries(query||{}))if(v!==null&&v!==undefined&&v!=='')u.searchParams.set(k,String(v));return u.toString();};
const limited=(v,regexp,max)=>typeof v==='string'&&v.length<=max&&regexp.test(v)?v:null;
const maxRows=(p,n=10)=>{const v=Number(p.get('limit'));return Number.isInteger(v)&&v>0&&v<=25?v:n;};
function target(id,p,env){
 const k=key(env,CATALOG[id][0]),f=limited(p.get('county'),/^\d{5}$/,5);
 const s=limited(p.get('state'),/^[A-Za-z]{2}$/,2)?.toUpperCase()||'CA';
 const q=limited(p.get('q')||'',/^[\p{L}\p{N}\s,.'()\-]{0,70}$/u,70)||'';
 const n=maxRows(p);let u,options={headers:{Accept:'application/json'}};
 if(!k&&!['fdic','datagov','lobbyview'].includes(id))throw Error('Missing '+CATALOG[id][0]);
 switch(id){
 case 'airnow':{const z=limited(p.get('zip'),/^\d{5}$/,5);if(!z)throw Error('Five-digit zip required');u=qs('https://www.airnowapi.org/aq/observation/current/ziplatlong/',{format:'application/json',zipcode:z,distance:25,API_KEY:k});break;}
 case 'bea':if(!f)throw Error('Five-digit county FIPS required');u=qs('https://apps.bea.gov/api/data/',{UserID:k,method:'GetData',DataSetName:'Regional',TableName:'SAINC1',LineCode:'1',GeoFIPS:f,Year:'LAST5',ResultFormat:'JSON'});break;
 case 'bls':u='https://api.bls.gov/publicAPI/v2/timeseries/data/';options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({seriesid:[f?'LAUCN'+f+'0000000003':'CUUR0000SA0'],registrationkey:k})};break;
 case 'census':if(!f)throw Error('Five-digit county FIPS required');u=qs('https://api.census.gov/data/2024/acs/acs5',{get:'NAME,B19013_001E,B17001_001E,B17001_002E',for:'county:'+f.slice(2),in:'state:'+f.slice(0,2),key:k});break;
 case 'congress':u=qs('https://api.congress.gov/v3/bill',{api_key:k,format:'json',limit:n});break;
 case 'datagov':u=qs('https://catalog.data.gov/api/3/action/package_search',{q:q||'housing affordability',rows:n});break;
 case 'eia':u=qs('https://api.eia.gov/v2/electricity/retail-sales/data/',{api_key:k,frequency:'monthly','data[0]':'price','facets[stateid][]':s,'facets[sectorid][]':'RES','sort[0][column]':'period','sort[0][direction]':'desc',length:n});break;
 case 'fda':u=qs('https://api.fda.gov/animalandveterinary/event.json',{api_key:k,limit:n});break;
 case 'fdic':u=qs('https://banks.data.fdic.gov/api/institutions',{filters:'STALP:'+s,limit:n,format:'json'});break;
 case 'fec':if(!q)throw Error('Candidate q required');u=qs('https://api.open.fec.gov/v1/candidates/search/',{api_key:k,q,per_page:n});break;
 case 'fred':{const series=limited(p.get('series')||'UNRATE',/^[A-Z0-9._-]{2,30}$/,30);if(!series)throw Error('Invalid series');u=qs('https://api.stlouisfed.org/fred/series/observations',{series_id:series,api_key:k,file_type:'json',limit:n,sort_order:'desc'});break;}
 case 'govinfo':u=qs('https://api.govinfo.gov/collections',{api_key:k});break;
 case 'lda':u=qs('https://lda.gov/api/v1/filings/',{page_size:n,...(q?{search:q}:{})});options.headers.Authorization='Token '+k;break;
 case 'lobbyview':u=qs('https://rest-api.lobbyview.org/api/legislators',{page:1});break;
 case 'maptiler':if(!q)throw Error('Location q required');u=qs('https://api.maptiler.com/geocoding/'+encodeURIComponent(q)+'.json',{key:k,limit:Math.min(n,5)});break;
 case 'noaa':u=qs('https://www.ncei.noaa.gov/cdo-web/api/v2/datasets',{limit:n});options.headers.token=k;break;
 case 'openstates':u=qs('https://v3.openstates.org/bills',{jurisdiction:limited(p.get('jurisdiction')||'ca',/^[a-z]{2,20}$/i,20),per_page:n,...(q?{q}:{})});options.headers['X-API-KEY']=k;break;
 case 'regulations':u=qs('https://api.regulations.gov/v4/documents',{'page[size]':n,sort:'-postedDate',...(q?{'filter[searchTerm]':q}:{})});options.headers['X-Api-Key']=k;break;
 case 'usgs':u=qs('https://api.waterdata.usgs.gov/ogcapi/v1/collections/daily/items',{limit:n});options.headers['X-Api-Key']=k;break;
 }
 return {u,options};
}
let lobbyCounter=0;
async function getUpstream(id,route,env,fetcher){
 if(id!=='lobbyview')return fetcher(route.u,route.options);
 // Separate accounts; rotate among each independently configured token.
 const keys=['LOBBYVIEW_API_KEY','LOBBYVIEW_API_KEY_2','LOBBYVIEW_API_KEY_3'].map(x=>key(env,x)).filter(Boolean);
 if(!keys.length)throw Error('No LobbyView key');
 const index=lobbyCounter++%keys.length;
 let answer;
 for(let i=0;i<keys.length;i++){
  const token=keys[(index+i)%keys.length];
  answer=await fetcher(route.u,{...route.options,headers:{...route.options.headers,token}});
  if(![401,403,429].includes(answer.status))return answer;
 }
 return answer;
}
function clean(obj,depth=0){
 if(depth>=6)return null;
 if(Array.isArray(obj))return obj.slice(0,35).map(x=>clean(x,depth+1));
 if(obj&&typeof obj==='object'){const o={};for(const [k,v] of Object.entries(obj).slice(0,70))if(!/apikey|api_key|token|password|credential|authorization/i.test(k))o[k]=clean(v,depth+1);return o;}
 if(typeof obj==='string')return obj.slice(0,3000);
 return obj;
}
export async function handle(request,env,ctx={},fetcher=fetch){
 const u=new URL(request.url),path=u.pathname.replace(/\/+$/,'');
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
 if(request.method!=='GET')return json({error:'GET only'},405);
 if(path==='/'||path==='/health')return json({service:'POLITICS Research API',status:'operational',providers:Object.keys(CATALOG).length+Object.keys(KEYLESS_SOURCES).length+Object.keys(ACCESS_REQUIRED).length,catalog:'/api/catalog'},200,300);
 if(path==='/api/catalog')return json({providers:[...Object.entries(CATALOG).map(([id,[binding,category,description]])=>({id,category,description,configured:id==='lobbyview'?['LOBBYVIEW_API_KEY','LOBBYVIEW_API_KEY_2','LOBBYVIEW_API_KEY_3'].filter(x=>!!key(env,x)).length:!!key(env,binding),access:'cloudflare-variable'})),...Object.entries(KEYLESS_SOURCES).map(([id,[category,description]])=>({id,category,description,configured:true,access:'keyless-public'})),...Object.entries(ACCESS_REQUIRED).map(([id,[category,description,keyName,userName]])=>({id,category,description,configured:!!key(env,keyName)&&!!key(env,userName),access:'requires-provider-credentials'}))]},200,600);
 const id=path.startsWith('/api/')?path.slice(5):'';
 if(!Object.hasOwn(CATALOG,id)&&!Object.hasOwn(KEYLESS_SOURCES,id)&&!Object.hasOwn(ACCESS_REQUIRED,id))return json({error:'Unknown endpoint'},404);
 let route;
 try{route=Object.hasOwn(KEYLESS_SOURCES,id)?publicRoute(id,u.searchParams):Object.hasOwn(ACCESS_REQUIRED,id)?authenticatedPublicRoute(id,u.searchParams,env):target(id,u.searchParams,env);}catch(e){return json({provider:id,error:e.message},/Missing|No LobbyView/.test(e.message)?503:400);}
 const cache=globalThis.caches?.default;
 if(cache){try{const hit=await cache.match(request);if(hit)return hit;}catch{}}
 let upstream;
 try{upstream=await getUpstream(id,route,env,fetcher);}catch(_){return json({provider:id,error:'Provider unreachable or unavailable'},502);}
 if(!upstream.ok)return json({provider:id,error:'Upstream HTTP '+upstream.status},upstream.status===429?429:502);
 let body;
 try{const raw=await upstream.text();if(raw.length>1400000)throw Error('too large');body=JSON.parse(raw);}catch(_){return json({provider:id,error:'Invalid or oversized provider response'},502);}
 const response=json({provider:id,source:(KEYLESS_SOURCES[id]?.[1]||ACCESS_REQUIRED[id]?.[1]||CATALOG[id][2]),retrievedAt:new Date().toISOString(),data:clean(body)},200,(KEYLESS_SOURCES[id]?.[2]||ACCESS_REQUIRED[id]?.[4]||TTL[id]));
 if(cache){try{const p=cache.put(request,response.clone());if(ctx.waitUntil)ctx.waitUntil(p);else await p;}catch{}}
 return response;
}
export default {fetch:handle};

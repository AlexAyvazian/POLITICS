/* POLITICS: 19 allowlisted research API adapters; Cloudflare dashboard bindings only. */
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
 if(path==='/api/catalog')return json({providers:Object.entries(CATALOG).map(([id,[binding,category,description]])=>({id,category,description,configured:id==='lobbyview'?['LOBBYVIEW_API_KEY','LOBBYVIEW_API_KEY_2','LOBBYVIEW_API_KEY_3'].filter(x=>!!key(env,x)).length:!!key(env,binding)}))},200,600);
 const id=path.startsWith('/api/')?path.slice(5):'';
 if(!Object.hasOwn(CATALOG,id))return json({error:'Unknown endpoint'},404);
 let route;
 try{route=target(id,u.searchParams,env);}catch(e){return json({provider:id,error:e.message},/Missing|No LobbyView/.test(e.message)?503:400);}
 const cache=globalThis.caches?.default;
 if(cache){try{const hit=await cache.match(request);if(hit)return hit;}catch{}}
 let upstream;
 try{upstream=await getUpstream(id,route,env,fetcher);}catch(_){return json({provider:id,error:'Provider unreachable or unavailable'},502);}
 if(!upstream.ok)return json({provider:id,error:'Upstream HTTP '+upstream.status},upstream.status===429?429:502);
 let body;
 try{const raw=await upstream.text();if(raw.length>1400000)throw Error('too large');body=JSON.parse(raw);}catch(_){return json({provider:id,error:'Invalid or oversized provider response'},502);}
 const response=json({provider:id,source:CATALOG[id][2],retrievedAt:new Date().toISOString(),data:clean(body)},200,TTL[id]);
 if(cache){try{const p=cache.put(request,response.clone());if(ctx.waitUntil)ctx.waitUntil(p);else await p;}catch{}}
 return response;
}
export default {fetch:handle};

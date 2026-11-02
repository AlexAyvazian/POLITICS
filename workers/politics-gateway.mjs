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
/* Match Healthcare Directory: browser CORS is limited to approved FRONTEND_ORIGIN values. */
const CORS={};
function allowedOrigins(env){
 return String(env?.FRONTEND_ORIGIN||'').split(',').map(v=>v.trim().replace(/\/+$/,'')).filter(Boolean);
}
function withOriginCors(response,request,env){
 const headers=new Headers(response.headers);
 for(const name of ['Access-Control-Allow-Origin','Access-Control-Allow-Headers','Access-Control-Allow-Methods','Access-Control-Max-Age'])headers.delete(name);
 const vary=headers.get('Vary');
 if(vary!=='*' && !(vary||'').toLowerCase().split(',').some(v=>v.trim()==='origin'))headers.set('Vary',vary?vary+', Origin':'Origin');
 const origin=request.headers?.get?.('Origin')||null;
 if(origin && allowedOrigins(env).includes(origin)){
  headers.set('Access-Control-Allow-Origin',origin);
  headers.set('Access-Control-Allow-Methods','GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers','Accept, Content-Type');
  headers.set('Access-Control-Max-Age','86400');
 }
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
const json=(data,status=200,ttl=0)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...CORS,'Cache-Control':ttl?'public, max-age=60, s-maxage='+ttl:'no-store'}});
const key=(env,name)=>typeof env[name]==='string'&&env[name].trim()?env[name].trim():null;
/* api.data.gov 40-character keys work across participating federal agencies.
 * Use the already validated FEC key if an older Congress binding is malformed.
 * Never expose the fallback credential to callers. */
const congressApiKey=env=>{
 const value=key(env,'CONGRESS_API_KEY');
 if(value?.length===40)return value;
 const alternate=key(env,'FEC_API_KEY');
 return alternate?.length===40?alternate:value;
};
const qs=(url,query)=>{const u=new URL(url);for(const [k,v] of Object.entries(query||{}))if(v!==null&&v!==undefined&&v!=='')u.searchParams.set(k,String(v));return u.toString();};
const limited=(v,regexp,max)=>typeof v==='string'&&v.length<=max&&regexp.test(v)?v:null;
const maxRows=(p,n=10)=>{const v=Number(p.get('limit'));return Number.isInteger(v)&&v>0&&v<=25?v:n;};
function target(id,p,env){
 const k=id==='congress'?congressApiKey(env):key(env,CATALOG[id][0]),f=limited(p.get('county'),/^\d{5}$/,5);
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
 case 'openstates':{
  const resource=p.get('record')||'bills';
  if(!['bills','people'].includes(resource))throw Error('Invalid Open States record type');
  const pageRaw=Number(p.get('page')||1);
  if(!Number.isInteger(pageRaw)||pageRaw<1||pageRaw>20)throw Error('Invalid Open States page');
  u=qs('https://v3.openstates.org/'+resource,{jurisdiction:limited(p.get('jurisdiction')||'ca',/^[a-z]{2,20}$/i,20),per_page:n,page:pageRaw,...(q?{q}:{})});
  options.headers['X-API-KEY']=k;break;
 }
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
 if(typeof obj==='string'){
  return obj.slice(0,3000).replace(/https?:\/\/[^\s"'<>]+/g,match=>{
   try{const u=new URL(match);for(const name of [...u.searchParams.keys()])if(/key|token|auth|email|password|username/i.test(name))u.searchParams.delete(name);return u.toString();}
   catch{return match;}
  });
 }
 return obj;
}

/* Scheduled nationwide ingest — NEVER fetch external providers during a county click.
   Snapshots are D1 rows with explicit source vintage. */
const CENSUS_YEAR=2024;
const CENSUS_FIELDS='NAME,B01001_001E,B19013_001E,B17001_001E,B17001_002E,B25064_001E';
const CENSUS_PUBLIC_URL='https://api.census.gov/data/'+CENSUS_YEAR+'/acs/acs5';
const snapshotHeaders={'Cache-Control':'public, max-age=300, s-maxage=1800'};
function validAcsNumber(value){
 const n=Number(value);
 return value!==null&&value!==''&&Number.isFinite(n)&&n>=0&&n!==-666666666&&n!==-999999999?n:null;
}
function normalizeCensus(rows){
 if(!Array.isArray(rows)||rows.length<2||!Array.isArray(rows[0]))throw Error('Invalid Census response');
 const columns=rows[0];
 const indexes=Object.fromEntries(columns.map((name,index)=>[name,index]));
 for(const col of ['NAME','B01001_001E','B19013_001E','B17001_001E','B17001_002E','B25064_001E','state','county'])
  if(!Object.hasOwn(indexes,col))throw Error('Census column missing');
 const counties={};
 for(const row of rows.slice(1)){
  const state=String(row[indexes.state]||''),county=String(row[indexes.county]||'');
  if(!/^\d{2}$/.test(state)||!/^\d{3}$/.test(county))continue;
  const povertyTotal=validAcsNumber(row[indexes.B17001_001E]);
  const povertyBelow=validAcsNumber(row[indexes.B17001_002E]);
  counties[state+county]={
   name:String(row[indexes.NAME]||'').slice(0,150),
   population:validAcsNumber(row[indexes.B01001_001E]),
   medianHouseholdIncome:validAcsNumber(row[indexes.B19013_001E]),
   medianGrossRent:validAcsNumber(row[indexes.B25064_001E]),
   povertyRate:povertyTotal>0&&povertyBelow!==null?Math.round(povertyBelow/povertyTotal*1000)/10:null
  };
 }
 return counties;
}
async function refreshCensusSnapshot(env,fetchImpl=fetch,now=new Date()){
 if(!env?.COUNTY_DB)throw Error('COUNTY_DB D1 binding missing');
 const apiKey=env['CENSUS-API-KEY'];
 if(!apiKey)throw Error('Census API credential not configured');
 const u=new URL(CENSUS_PUBLIC_URL);
 u.searchParams.set('get',CENSUS_FIELDS);
 u.searchParams.set('for','county:*');
 u.searchParams.set('in','state:*');
 u.searchParams.set('key',apiKey);
 const res=await fetchImpl(u.toString(),{headers:{Accept:'application/json'}});
 if(!res.ok)throw Error('Census upstream HTTP '+res.status);
 const rows=await res.json();
 const counties=normalizeCensus(rows);
 const count=Object.keys(counties).length;
 if(count<2900)throw Error('Incomplete national Census dataset ('+count+' counties); previous snapshot retained');
 const payload=JSON.stringify({source:'U.S. Census Bureau ACS 2024 5-Year',sourceUrl:CENSUS_PUBLIC_URL,period:'2020–2024',year:CENSUS_YEAR,refreshedAt:now.toISOString(),count,counties});
 await env.COUNTY_DB.prepare('INSERT INTO county_snapshots (source, snapshot_json, refreshed_at, record_count) VALUES (?, ?, ?, ?) ON CONFLICT(source) DO UPDATE SET snapshot_json=excluded.snapshot_json,refreshed_at=excluded.refreshed_at,record_count=excluded.record_count')
  .bind('census_acs5',payload,now.toISOString(),count).run();
 return {count,refreshedAt:now.toISOString()};
}
async function getSnapshot(env){
 if(!env?.COUNTY_DB)return new Response(JSON.stringify({status:'storage_not_configured',count:0}),{status:503,headers:{'Content-Type':'application/json',...snapshotHeaders}});
 try{
  const record=await env.COUNTY_DB.prepare('SELECT snapshot_json FROM county_snapshots WHERE source = ?').bind('census_acs5').first();
  return new Response(record?.snapshot_json||JSON.stringify({status:'pending',count:0,message:'The first scheduled national collection has not completed.'}),{status:200,headers:{'Content-Type':'application/json',...snapshotHeaders}});
 }catch(_){return new Response(JSON.stringify({status:'storage_unavailable',count:0}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
}


/* County categories are collected nationwide in scheduled bulk queries only.
 * Seven independent D1 databases prevent giant rows and isolate failed refreshes.
 * The source year (ACS 2024) is different from each scheduled fetch timestamp. */
const COUNTY_CATEGORY_CONFIG={"specs":{"housing":[["medianHomeValue","DP04","DP04_0089E","Median owner-occupied home value","currency"],["ownerOccupiedPct","DP04","DP04_0046PE","Owner-occupied housing","percent"],["renterOccupiedPct","DP04","DP04_0047PE","Renter-occupied housing","percent"],["vacantHousingPct","DP04","DP04_0003PE","Vacant housing units","percent"],["rentalVacancyRate","DP04","DP04_0005E","Rental vacancy rate","percent"],["mortgagedOwnersPct","DP04","DP04_0091PE","Owners with a mortgage","percent"],["medianMonthlyMortgageCost","DP04","DP04_0101E","Median monthly costs with mortgage","currency"],["mortgageCost35PlusPct","DP04","DP04_0115PE","Mortgage owners spending 35%+ of income","percent"],["medianGrossRent","DP04","DP04_0134E","Median gross monthly rent","currency"],["rentCost30to34Pct","DP04","DP04_0141PE","Renters spending 30–34.9% of income","percent"],["rentCost35PlusPct","DP04","DP04_0142PE","Renters spending 35%+ of income","percent"],["rent2000to2499Pct","DP04","DP04_0131PE","Rents $2,000–$2,499","percent"],["rent3000PlusPct","DP04","DP04_0133PE","Rents $3,000+","percent"]],"jobs":[["laborForceParticipationPct","DP03","DP03_0002PE","Population in labor force","percent"],["unemploymentRatePct","DP03","DP03_0009PE","Civilian unemployment rate","percent"],["femaleLaborForceParticipationPct","DP03","DP03_0011PE","Women in labor force","percent"],["meanCommuteMinutes","DP03","DP03_0025E","Average travel time to work","decimal"],["workFromHomePct","DP03","DP03_0024PE","Workers working from home","percent"],["driveAlonePct","DP03","DP03_0019PE","Workers driving alone","percent"],["publicTransitPct","DP03","DP03_0021PE","Workers using public transit","percent"],["managementJobsPct","DP03","DP03_0027PE","Management/business/science/arts occupations","percent"],["serviceJobsPct","DP03","DP03_0028PE","Service occupations","percent"],["constructionJobsPct","DP03","DP03_0030PE","Natural resources/construction/maintenance occupations","percent"],["manufacturingIndustryPct","DP03","DP03_0035PE","Manufacturing industry workers","percent"],["retailIndustryPct","DP03","DP03_0037PE","Retail industry workers","percent"],["healthcareEducationIndustryPct","DP03","DP03_0042PE","Education and healthcare industry workers","percent"],["governmentWorkersPct","DP03","DP03_0048PE","Government workers","percent"],["medianWorkerEarnings","DP03","DP03_0092E","Median annual worker earnings","currency"],["medianMenFullTimeEarnings","DP03","DP03_0093E","Median earnings, male full-time workers","currency"],["medianWomenFullTimeEarnings","DP03","DP03_0094E","Median earnings, female full-time workers","currency"]],"income":[["medianHouseholdIncome","DP03","DP03_0062E","Median household income","currency"],["perCapitaIncome","DP03","DP03_0088E","Income per person","currency"],["medianFamilyIncome","DP03","DP03_0086E","Median family income","currency"],["householdsUnder10kPct","DP03","DP03_0052PE","Households earning under $10,000","percent"],["households50to74kPct","DP03","DP03_0057PE","Households earning $50–74,999","percent"],["households100to149kPct","DP03","DP03_0059PE","Households earning $100–149,999","percent"],["households200kPlusPct","DP03","DP03_0061PE","Households earning $200,000+","percent"],["householdsOnSocialSecurityPct","DP03","DP03_0066PE","Households receiving Social Security","percent"],["householdsOnSSIPct","DP03","DP03_0070PE","Households receiving Supplemental Security Income","percent"],["householdsOnCashAssistancePct","DP03","DP03_0072PE","Households receiving cash assistance","percent"],["householdsReceivingSNAPPct","DP03","DP03_0074PE","Households receiving SNAP benefits","percent"],["familiesBelowPovertyPct","DP03","DP03_0119PE","Families below poverty level","percent"],["childrenBelowPovertyPct","DP03","DP03_0129PE","Children under 18 below poverty level","percent"],["giniIndex","detail","B19083_001E","Gini index of income inequality","ratio"]],"healthcare":[["insuredPct","DP03","DP03_0096PE","Population with health insurance","percent"],["privateInsurancePct","DP03","DP03_0097PE","Population with private health insurance","percent"],["publicInsurancePct","DP03","DP03_0098PE","Population with public health coverage","percent"],["uninsuredPct","DP03","DP03_0099PE","Population without health insurance","percent"],["uninsuredChildrenPct","DP03","DP03_0101PE","Children without health insurance","percent"],["disabilityPct","DP02","DP02_0072PE","Population with a disability","percent"],["childDisabilityPct","DP02","DP02_0074PE","Children with a disability","percent"],["workingAgeDisabilityPct","DP02","DP02_0076PE","Adults 18–64 with a disability","percent"],["seniorDisabilityPct","DP02","DP02_0078PE","Adults 65+ with a disability","percent"]],"education":[["populationEnrolledSchool","DP02","DP02_0053E","Population enrolled in school","count"],["preschoolEnrollmentPct","DP02","DP02_0054PE","Enrolled students in preschool","percent"],["highSchoolEnrollmentPct","DP02","DP02_0057PE","Enrolled students in high school","percent"],["collegeEnrollmentPct","DP02","DP02_0058PE","Enrolled students in college/graduate school","percent"],["highSchoolGradOrHigherPct","DP02","DP02_0067PE","Adults with high-school diploma or higher","percent"],["bachelorsOrHigherPct","DP02","DP02_0068PE","Adults with bachelor's degree or higher","percent"],["graduateDegreePct","DP02","DP02_0066PE","Adults with graduate/professional degree","percent"],["associateDegreePct","DP02","DP02_0064PE","Adults with associate degree","percent"],["someCollegeNoDegreePct","DP02","DP02_0063PE","Adults with some college, no degree","percent"]],"families":[["medianAge","DP05","DP05_0018E","Median age","decimal"],["under18Pct","DP05","DP05_0019PE","Residents under 18","percent"],["seniors65PlusPct","DP05","DP05_0024PE","Residents aged 65+","percent"],["age25to34Pct","DP05","DP05_0010PE","Residents aged 25–34","percent"],["femalePopulationPct","DP05","DP05_0003PE","Female population","percent"],["citizenVotingAgePopulation","DP05","DP05_0106E","Citizen voting-age population","count"],["marriedCoupleHouseholdsPct","DP02","DP02_0002PE","Married-couple households","percent"],["femaleHouseholderWithChildrenPct","DP02","DP02_0011PE","Female householders with children, no spouse/partner","percent"],["householdsWithChildrenPct","DP02","DP02_0014PE","Households with children under 18","percent"],["householdsWithSeniorsPct","DP02","DP02_0015PE","Households with people aged 65+","percent"],["veteransPct","DP02","DP02_0070PE","Civilian veterans aged 18+","percent"]],"infrastructure":[["broadbandHouseholdsPct","DP02","DP02_0154PE","Households with broadband subscription","percent"],["computerHouseholdsPct","DP02","DP02_0153PE","Households with a computer","percent"],["noVehicleHouseholdsPct","DP04","DP04_0058PE","Households without a vehicle","percent"],["oneVehicleHouseholdsPct","DP04","DP04_0059PE","Households with one vehicle","percent"],["twoVehicleHouseholdsPct","DP04","DP04_0060PE","Households with two vehicles","percent"],["threePlusVehicleHouseholdsPct","DP04","DP04_0061PE","Households with three or more vehicles","percent"]]},"cron":{"16 7 * * *":["housing","infrastructure"],"17 7 * * *":["jobs","income"],"18 7 * * *":["healthcare","education"],"19 7 * * *":["families"]},"envNames":{"housing":"CATEGORY_DB_HOUSING","jobs":"CATEGORY_DB_JOBS","income":"CATEGORY_DB_INCOME","healthcare":"CATEGORY_DB_HEALTHCARE","education":"CATEGORY_DB_EDUCATION","families":"CATEGORY_DB_FAMILIES","infrastructure":"CATEGORY_DB_INFRASTRUCTURE"},"keyNames":["CENSUS-API-KEY","CENSUS_API_KEY_2","CENSUS_API_KEY_3","CENSUS_API_KEY_4","CENSUS_API_KEY_5","CENSUS_API_KEY_6"]};
function countyEstimate(value,unit){
 if(value===null||value===undefined||value===''||value==='N'||value==='-')return null;
 const n=Number(value);
 if(!Number.isFinite(n)||n<0)return null;
 if(unit==='percent'&&n>100)return null;
 if(unit==='ratio'&&n>1)return null;
 return n;
}
async function updateCountyCategory(env,category,fetchImpl=fetch,now=new Date()){
 const conf=COUNTY_CATEGORY_CONFIG;
 const fields=conf.specs[category],db=env?.[conf.envNames[category]];
 if(!fields||!db)throw Error('Missing category config or D1: '+category);
 const idx=Object.keys(conf.specs).indexOf(category);
 const apiKey=key(env,'CENSUS-API-KEY') || conf.keyNames.slice(idx%6).concat(conf.keyNames.slice(0,idx%6)).map(n=>key(env,n)).find(Boolean);
 if(!apiKey)throw Error('No Census key configured');
 const groups={};
 for(const item of fields){(groups[item[1]] ||= []).push(item);}
 const counties={};
 for(const [dataset,entries] of Object.entries(groups)){
  const variableCodes=[...new Set(entries.map(x=>x[2]))];
  if(variableCodes.length>49)throw Error('Census profile request over 49 variables');
  const u=new URL('https://api.census.gov/data/2024/acs/acs5'+(dataset==='detail'?'':'/profile'));
  for(const [k,v] of [['get', ['NAME',...variableCodes].join(',')],['for','county:*'],['in','state:*'],['key',apiKey]])u.searchParams.set(k,v);
  const response=await fetchImpl(u.toString(),{headers:{Accept:'application/json'}});
  if(!response.ok)throw Error(category+' '+dataset+' upstream HTTP '+response.status);
  const rows=await response.json();
  if(!Array.isArray(rows)||!Array.isArray(rows[0]))throw Error('Invalid ACS '+dataset+' payload');
  const col=Object.fromEntries(rows[0].map((k,i)=>[k,i]));
  if(['state','county',...variableCodes].some(k=>!Object.hasOwn(col,k)))throw Error('Missing ACS '+dataset+' column');
  const seen=new Set();
  for(const row of rows.slice(1)){
   const state=String(row[col.state]||''),county=String(row[col.county]||'');
   if(!/^\d{2}$/.test(state)||!/^\d{3}$/.test(county))continue;
   const fips=state+county;seen.add(fips);
   const target=(counties[fips] ||= {});
   for(const [name,_dataset,code,_label,unit] of entries)target[name]=countyEstimate(row[col[code]],unit);
  }
  if(seen.size<2900)throw Error('Incomplete nationwide '+dataset+' dataset; saved data unchanged');
 }
 const count=Object.keys(counties).length;
 const metadata=Object.fromEntries(fields.map(([k,dataset,code,label,unit])=>[k,{label,unit,dataset,code}]));
 const snapshot=JSON.stringify({category,source:'U.S. Census Bureau ACS 2024 5-Year',year:2024,period:'2020–2024',
  sourceUrl:'https://api.census.gov/data/2024/acs/acs5/profile',retrievedAt:now.toISOString(),refreshedAt:now.toISOString(),count,fields:metadata,counties});
 if(new TextEncoder().encode(snapshot).length>=1900000)throw Error('County category '+category+' exceeds D1 2MB row limit');
 await db.prepare('INSERT INTO county_snapshots(source,snapshot_json,refreshed_at,record_count) VALUES(?,?,?,?) ON CONFLICT(source) DO UPDATE SET snapshot_json=excluded.snapshot_json,refreshed_at=excluded.refreshed_at,record_count=excluded.record_count')
  .bind('census_'+category,snapshot,now.toISOString(),count).run();
 return {category,count,fieldCount:fields.length,refreshedAt:now.toISOString()};
}


/* EIA state-only pricing: one nationwide scheduled query, retained separately from
   arithmetic averages of county measurements. No provider calls during clicks. */
async function refreshStateEnergy(env,fetchImpl=fetch,now=new Date()){
 const db=env?.CATEGORY_DB_INFRASTRUCTURE;
 const apiKey=key(env,'EIA_API_KEY');
 if(!db||!apiKey)throw Error('Missing infrastructure D1 or EIA credential');
 const url=new URL('https://api.eia.gov/v2/electricity/retail-sales/data/');
 for(const [key,value] of [['api_key',apiKey],['frequency','monthly'],['data[0]','price'],['facets[sectorid][]','RES'],
   ['sort[0][column]','period'],['sort[0][direction]','desc'],['length','500']])url.searchParams.set(key,value);
 const response=await fetchImpl(url.toString(),{headers:{Accept:'application/json'}});
 if(!response.ok)throw Error('EIA HTTP '+response.status);
 const raw=await response.json();
 const items=raw?.response?.data;
 if(!Array.isArray(items))throw Error('EIA response has no data');
 const states={};
 const allowedStates=new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
 for(const item of items){
  const abbr=String(item.stateid||'');
  const value=Number(item.price);
  if(!allowedStates.has(abbr)||!Number.isFinite(value)||value<0||!item.period||states[abbr])continue;
  states[abbr]={residentialElectricityCentsKwh:value,period:String(item.period)};
 }
 if(Object.keys(states).length<40)throw Error('Incomplete nationwide EIA state data, previous snapshot retained');
 const payload=JSON.stringify({source:'U.S. Energy Information Administration',sourceUrl:'https://www.eia.gov/electricity/data.php',
  dataset:'Monthly residential retail electricity price',unit:'cents per kWh',retrievedAt:now.toISOString(),count:Object.keys(states).length,states});
 await db.prepare('INSERT INTO county_snapshots (source,snapshot_json,refreshed_at,record_count) VALUES(?,?,?,?) ON CONFLICT(source) DO UPDATE SET snapshot_json=excluded.snapshot_json,refreshed_at=excluded.refreshed_at,record_count=excluded.record_count')
  .bind('eia_state_electricity',payload,now.toISOString(),Object.keys(states).length).run();
 return {states:Object.keys(states).length};
}

/* Credential-free, scheduled source collectors. These data are never fetched on map clicks.
 * PLACES 2025 is a model-based release (mostly 2023 survey inputs), NOT a
 * wellbeing index, and must not be used to rank counties or infer causation. */
const PLACES_FIELDS=Object.freeze({
 frequentMentalDistressPct:['mhlth_crudeprev','Frequent mental distress (adults)','percent'],
 poorPhysicalHealthPct:['phlth_crudeprev','Frequent physical distress (adults)','percent'],
 depressionPct:['depression_crudeprev','Diagnosed depression (adults)','percent'],
 lonelinessPct:['loneliness_crudeprev','Loneliness (adults)','percent'],
 foodInsecurityPct:['foodinsecu_crudeprev','Food insecurity (adults)','percent'],
 housingInsecurityPct:['housinsecu_crudeprev','Housing insecurity (adults)','percent'],
 routineCheckupPct:['checkup_crudeprev','Routine checkup (adults)','percent'],
 uninsuredAdultsPct:['access2_crudeprev','No health insurance, ages 18–64','percent']
});
async function refreshPlacesHealth(env,fetchImpl=fetch,now=new Date()){
 const db=env?.CATEGORY_DB_HEALTHCARE;
 if(!db)throw Error('Healthcare D1 binding missing');
 const url=new URL('https://data.cdc.gov/resource/i46a-9kgh.json');
 const cols=['countyfips',...Object.values(PLACES_FIELDS).map(([c])=>c)];
 url.searchParams.set('$select',cols.join(','));
 url.searchParams.set('$limit','5000');
 const r=await fetchImpl(url.toString(),{headers:{Accept:'application/json'}});
 if(!r.ok)throw Error('CDC PLACES upstream HTTP '+r.status);
 const rows=await r.json();
 if(!Array.isArray(rows))throw Error('CDC PLACES invalid format');
 const counties={};
 for(const item of rows){
  const fips=String(item?.countyfips||'');
  if(!/^\d{5}$/.test(fips)||counties[fips])continue;
  const measurements={};
  for(const [name,[col]] of Object.entries(PLACES_FIELDS))measurements[name]=countyEstimate(item[col],'percent');
  counties[fips]=measurements;
 }
 const count=Object.keys(counties).length;
 if(count<2900)throw Error('CDC PLACES national response incomplete; previous saved data retained');
 const fields=Object.fromEntries(Object.entries(PLACES_FIELDS).map(([id,[code,label,unit]])=>[id,{code,label,unit}]));
 const snapshot=JSON.stringify({
  source:'CDC PLACES',year:2025,period:'2025 release; mostly 2023 BRFSS observations',
  note:'Model-based estimates, not directly measured county happiness or a ranking.',
  sourceUrl:'https://data.cdc.gov/d/i46a-9kgh',retrievedAt:now.toISOString(),count,fields,counties
 });
 if(new TextEncoder().encode(snapshot).length>=1900000)throw Error('CDC PLACES snapshot exceeds D1 2MB guard');
 await db.prepare('INSERT INTO county_snapshots(source,snapshot_json,refreshed_at,record_count) VALUES(?,?,?,?) ON CONFLICT(source) DO UPDATE SET snapshot_json=excluded.snapshot_json,refreshed_at=excluded.refreshed_at,record_count=excluded.record_count')
  .bind('cdc_places_2025',snapshot,now.toISOString(),count).run();
 return {count,source:'cdc_places_2025'};
}

/* Congressional terms in the public open UnitedStates/congress-legislators
 * record represent offices, NOT who governs a county or a state legislature.
 * A county can cross several House district boundaries. */
const US_STATE_ABBRS=new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
async function refreshCongressMembers(env,fetchImpl=fetch,now=new Date()){
 const db=env?.COUNTY_DB;
 if(!db)throw Error('Core D1 binding missing');
 const endpoint='https://unitedstates.github.io/congress-legislators/legislators-current.json';
 const r=await fetchImpl(endpoint,{headers:{Accept:'application/json'}});
 if(!r.ok)throw Error('Congress members source HTTP '+r.status);
 const raw=await r.json();
 if(!Array.isArray(raw))throw Error('Congress members invalid JSON');
 const states={};
 const day=now.toISOString().slice(0,10);
 for(const member of raw){
  const terms=member?.terms;
  if(!Array.isArray(terms))continue;
  const active=[...terms].reverse().find(t=>t?.start<=day&&day<t?.end);
  if(!active||!US_STATE_ABBRS.has(active.state)||!['sen','rep'].includes(active.type))continue;
  const name=member?.name?.official_full||[member?.name?.first,member?.name?.last].filter(Boolean).join(' ');
  if(!name||!member?.id?.bioguide)continue;
  const record={
   name:String(name).slice(0,120),party:String(active.party||'Unspecified').slice(0,40),
   bioguide:String(member.id.bioguide).slice(0,16),
   start:String(active.start),end:String(active.end)
  };
  if(active.type==='rep'){
   const d=Number(active.district);
   record.district=Number.isInteger(d)&&d>=0?d:null;
  }
  const entry=states[active.state] ||= {senators:[],house:[]};
  entry[active.type==='sen'?'senators':'house'].push(record);
 }
 for(const entry of Object.values(states)){
  entry.senators.sort((a,b)=>a.name.localeCompare(b.name));
  entry.house.sort((a,b)=>(a.district??999)-(b.district??999)||a.name.localeCompare(b.name));
 }
 const count=Object.values(states).reduce((sum,s)=>sum+s.senators.length+s.house.length,0);
 if(count<400||Object.keys(states).length<45)throw Error('Incomplete national congressional source; previous saved data retained');
 const snapshot=JSON.stringify({
  source:'unitedstates/congress-legislators community data',sourceUrl:'https://github.com/unitedstates/congress-legislators',
  retrievedAt:now.toISOString(),asOf:day,count,states,
  note:'Current incumbents, not election winners. House districts may cross county borders; no county-specific House member is inferred.'
 });
 if(new TextEncoder().encode(snapshot).length>=1900000)throw Error('Congress delegation snapshot exceeds D1 row guard');
 await db.prepare('INSERT INTO county_snapshots(source,snapshot_json,refreshed_at,record_count) VALUES(?,?,?,?) ON CONFLICT(source) DO UPDATE SET snapshot_json=excluded.snapshot_json,refreshed_at=excluded.refreshed_at,record_count=excluded.record_count')
  .bind('congress_members_current',snapshot,now.toISOString(),count).run();
 return {states:Object.keys(states).length,members:count};
}

/* Bill Commons public reads require no API key. Pull one jurisdiction per
 * available scheduled slot and cache in D1 for the same state/county panel.
 * Treat coverage and freshness as unverified until proven by official source. */
const BILL_COMMONS_STATES='AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
function safeBillText(v,max=250){return typeof v==='string'?v.trim().slice(0,max):'';}
async function refreshBillCommonsState(env,state,fetchImpl=fetch,now=new Date()){
 if(!BILL_COMMONS_STATES.includes(state))throw Error('Invalid Bill Commons jurisdiction');
 const db=env?.COUNTY_DB;
 if(!db)throw Error('Core D1 binding missing');
 const u=new URL('https://api.billcommons.org/api/v1/bills');
 u.searchParams.set('jurisdiction',state);
 u.searchParams.set('per_page','12');
 u.searchParams.set('page','1');
 const response=await fetchImpl(u.toString(),{headers:{Accept:'application/json'}});
 if(!response.ok)throw Error('Bill Commons upstream HTTP '+response.status);
 const raw=await response.json();
 if(!Array.isArray(raw?.data)||!raw.data.length)throw Error('Bill Commons missing/incomplete list; stored data unchanged');
 const items=raw.data.slice(0,12).map(b=>({
  id:safeBillText(b?.id,80),
  identifier:safeBillText(b?.identifier,80),
  title:safeBillText(b?.title,320),
  status:safeBillText(b?.status,100),
  updatedAt:safeBillText(b?.updated_at||b?.last_action_date,45)
 })).filter(b=>b.id&&b.identifier&&b.title);
 if(!items.length)throw Error('Bill Commons returned no usable bill identities');
 const total=Number(raw?.pagination?.total);
 const payload=JSON.stringify({
  source:'Bill Commons',state,count:items.length,
  total:Number.isInteger(total)&&total>=0?total:null,
  retrievedAt:now.toISOString(),
  sourceUrl:'https://billcommons.org/docs/api',
  note:'Sample of up to 12 indexed bills, not a comprehensive, official or necessarily fresh legislative record.',
  meta:{source_freshness:raw?.meta?.source_freshness??null},
  items
 });
 if(new TextEncoder().encode(payload).length>=1000000)throw Error('Bill Commons state snapshot too large');
 await db.prepare('INSERT INTO county_snapshots(source,snapshot_json,refreshed_at,record_count) VALUES(?,?,?,?) ON CONFLICT(source) DO UPDATE SET snapshot_json=excluded.snapshot_json,refreshed_at=excluded.refreshed_at,record_count=excluded.record_count')
  .bind('billcommons_'+state,payload,now.toISOString(),items.length).run();
 return {state,count:items.length};
}

/* Expand already-configured official API adapters into stored political data.
 * Avoid provider fetches on map selection, and preserve the last good snapshot on errors. */
async function politicalSnapshotWrite(db,id,record,now,count){
 const payload=JSON.stringify(record);
 if(new TextEncoder().encode(payload).length>=1900000)throw Error('Political snapshot too large: '+id);
 await db.prepare('INSERT INTO county_snapshots(source,snapshot_json,refreshed_at,record_count) VALUES(?,?,?,?) ON CONFLICT(source) DO UPDATE SET snapshot_json=excluded.snapshot_json,refreshed_at=excluded.refreshed_at,record_count=excluded.record_count')
  .bind(id,payload,now.toISOString(),count).run();
}
async function refreshOpenStatesState(env,state,fetchImpl=fetch,now=new Date()){
 if(!BILL_COMMONS_STATES.includes(state))throw Error('Invalid state jurisdiction');
 const db=env?.COUNTY_DB,token=key(env,'OPENSTATES_API_KEY');
 if(!db||!token)throw Error('Missing core D1 or Open States key');
 async function request(type,perPage){
  const u=new URL('https://v3.openstates.org/'+type);
  u.searchParams.set('jurisdiction',state.toLowerCase());
  u.searchParams.set('per_page',String(perPage));
  const res=await fetchImpl(u.toString(),{headers:{Accept:'application/json','X-API-KEY':token}});
  if(!res.ok)throw Error('Open States '+type+' HTTP '+res.status);
  const body=await res.json();
  if(!Array.isArray(body?.results))throw Error('Open States '+type+' schema unavailable');
  return body;
 }
 const [billsResult,peopleResult]=await Promise.all([request('bills',12),request('people',32)]);
 const bills=billsResult.results.slice(0,12).map(x=>({
  id:safeBillText(x.id,100),
  identifier:safeBillText(x.identifier,70),
  title:safeBillText(x.title,350),
  action:safeBillText(x.latest_action_description,160),
  actionDate:safeBillText(x.latest_action_date,32),
  url:safeBillText(x.openstates_url,500)
 })).filter(x=>x.id&&x.identifier&&x.title);
 const people=peopleResult.results.slice(0,32).map(x=>({
  id:safeBillText(x.id,100),
  name:safeBillText(x.name,120),
  party:safeBillText(x.party,80),
  role:safeBillText(x.current_role?.title,100),
  district:safeBillText(x.current_role?.district,40),
  url:safeBillText(x.openstates_url,500)
 })).filter(x=>x.id&&x.name);
 if(!bills.length&&!people.length)throw Error('Empty Open States dataset; previous cache retained');
 const record={source:'Open States / Plural Open',state,
  retrievedAt:now.toISOString(),sourceUrl:'https://docs.openstates.org/api-v3/',
  caveat:'Partial API sample, not a complete legislative session or roster. Actions and vote detail vary by jurisdiction.',
  totalBills:Number.isInteger(billsResult.pagination?.total_items)?billsResult.pagination.total_items:null,
  totalPeople:Number.isInteger(peopleResult.pagination?.total_items)?peopleResult.pagination.total_items:null,
  count:bills.length+people.length,bills,people};
 await politicalSnapshotWrite(db,'openstates_'+state,record,now,record.count);
 return {state,bills:bills.length,people:people.length};
}
/* Official Congress.gov House legislative roll calls (119th Congress, 2nd session).
 * No assertion about Senate votes, leadership elections or future elections.
 * Store actual individual choices, not presumed party-line votes. */
async function refreshFederalHouseVotes(env,fetchImpl=fetch,now=new Date()){
 const db=env?.COUNTY_DB,token=congressApiKey(env);
 if(!db||!token)throw Error('Missing core D1 or Congress.gov key');
 async function get(path,limit,offset){
  const u=new URL('https://api.congress.gov/v3/'+path);
  u.searchParams.set('api_key',token);u.searchParams.set('format','json');
  if(limit)u.searchParams.set('limit',String(limit));
  if(offset!==undefined)u.searchParams.set('offset',String(offset));
  if(path==='house-vote/119/2')u.searchParams.set('sort','updateDate+desc');
  const res=await fetchImpl(u.toString(),{headers:{Accept:'application/json'}});
  if(!res.ok)throw Error('Congress.gov House vote HTTP '+res.status);
  return res.json();
 }
 const index=await get('house-vote/119/2',6);
 const list=index?.houseRollCallVotes;
 if(!Array.isArray(list)||!list.length)throw Error('Congress.gov vote list missing');
 const votes=[];
 for(const vote of list.slice(0,6)){
  const num=Number(vote.rollCallNumber);
  if(!Number.isInteger(num)||num<1)continue;
  const route='house-vote/119/2/'+num+'/members';
  const extract=raw=>{
   const c=raw?.houseRollCallVoteMemberVotes;
   return Array.isArray(c?.results)?c.results:c?.results?.item;
  };
  const first=extract(await get(route,250,0));
  if(!Array.isArray(first)||first.length<100)throw Error('Congress.gov House member vote page incomplete');
  const rows=[...first];
  if(first.length===250){
   const second=extract(await get(route,250,250));
   if(!Array.isArray(second)||!second.length)throw Error('Congress.gov House second vote page missing');
   rows.push(...second);
  }
  if(rows.length<350)throw Error('Congress.gov House roll call is missing member pages');
  const stateVotes={};
  for(const v of rows){
   const st=String(v.voteState||v.state||'').toUpperCase();
   const cast=String(v.voteCast||'');
   if(!US_STATE_ABBRS.has(st)||!['Aye','Nay','Present','Not Voting','Yea','No'].includes(cast))continue;
   const person={
    bioguide:safeBillText(v.bioguideId||v.bioguideID,25),name:safeBillText([v.firstName,v.lastName].filter(Boolean).join(' '),100),
    party:safeBillText(v.voteParty,12),cast
   };
   (stateVotes[st] ||= []).push(person);
  }
  if(Object.keys(stateVotes).length<40)throw Error('Congress.gov incomplete state vote map');
  votes.push({voteNumber:num,date:safeBillText(vote.startDate,48),
   result:safeBillText(vote.result,60),legislationType:safeBillText(vote.legislationType,18),
   legislationNumber:safeBillText(String(vote.legislationNumber||''),20),
   question:safeBillText(vote.voteQuestion,200),stateVotes});
 }
 if(!votes.length)throw Error('Congress.gov no usable House vote records');
 const record={source:'Congress.gov',sourceUrl:'https://api.congress.gov/',
  congress:119,session:2,chamber:'House',retrievedAt:now.toISOString(),count:votes.length,
  note:'Recent legislative House roll calls only. Senate and non-legislative votes are not included.',
  votes};
 await politicalSnapshotWrite(db,'congress_house_votes_recent',record,now,votes.length);
 return {votes:votes.length};
}


/* Reuse the existing Congress.gov key to collect member-specific sponsorship.
 * Visitor clicks read Cloudflare D1 only. Recent 30 items of each kind are
 * deliberately labeled a sample, NOT a complete legislative history. */
async function refreshMemberLegislation(env,bioguide,fetchImpl=fetch,now=new Date()){
 if(!/^[A-Z][0-9]{6}$/.test(String(bioguide||'')))throw Error('Invalid Bioguide ID');
 const db=env?.COUNTY_DB,token=congressApiKey(env);
 if(!db||!token)throw Error('Missing Congress.gov key or D1 binding');
 async function collect(kind){
  const u=new URL('https://api.congress.gov/v3/member/'+bioguide+'/'+kind+'-legislation');
  u.searchParams.set('api_key',token);u.searchParams.set('format','json');
  u.searchParams.set('limit','30');u.searchParams.set('offset','0');
  const r=await fetchImpl(u.toString(),{headers:{Accept:'application/json'}});
  if(!r.ok)throw Error('Congress.gov '+kind+' HTTP '+r.status);
  const json=await r.json();
  const items=json?.[kind+'Legislation'];
  if(!Array.isArray(items))throw Error('Congress.gov '+kind+' response missing legislation array');
  return items.slice(0,30).filter(b=>b&&Number(b.congress)===119)
   .map(b=>({
    congress:119,type:safeBillText(b.type,12),number:safeBillText(String(b.number||''),12),
    title:safeBillText(b.title||b.latestTitle,320),
    introducedDate:safeBillText(b.introducedDate,25),
    latestAction:safeBillText(b.latestAction?.text,210),
    actionDate:safeBillText(b.latestAction?.actionDate,25),
    sourceUrl:/^https:\/\/api\.congress\.gov\/v3\/bill\/119\//.test(String(b.url||''))?b.url:null
   })).filter(b=>b.type&&b.number&&b.title);
 }
 const [sponsored,cosponsored]=await Promise.all([collect('sponsored'),collect('cosponsored')]);
 const record={source:'Congress.gov',bioguide,congress:119,retrievedAt:now.toISOString(),
  sourceUrl:'https://api.congress.gov/',
  coverage:'Up to 30 most recent sponsored and cosponsored items per member, filtered to the 119th Congress. Not exhaustive.',
  count:sponsored.length+cosponsored.length,sponsored,cosponsored};
 await politicalSnapshotWrite(db,'member_legislation_'+bioguide,record,now,record.count);
 return {bioguide,count:record.count};
}
async function refreshMemberLegislationBatch(env,slot,fetchImpl=fetch,now=new Date()){
 const db=env?.COUNTY_DB;
 if(!db||!congressApiKey(env))return {status:'not_configured'};
 const row=await db.prepare('SELECT snapshot_json FROM county_snapshots WHERE source=?').bind('congress_members_current').first();
 if(!row)return {status:'roster_pending'};
 const roster=JSON.parse(row.snapshot_json);
 const members=Object.values(roster.states||{}).flatMap(x=>[...(x?.house||[]),...(x?.senators||[])])
  .map(x=>x.bioguide).filter(x=>/^[A-Z][0-9]{6}$/.test(String(x||''))).sort();
 if(members.length<400)return {status:'incomplete_roster'};
 const days=Math.floor(now.getTime()/86400000);
 const start=((days*36+(slot-12))*8)%members.length;
 const ids=Array.from({length:8},(_,i)=>members[(start+i)%members.length]);
 const results=await Promise.allSettled(ids.map(id=>refreshMemberLegislation(env,id,fetchImpl,now)));
 const failed=results.filter(x=>x.status==='rejected');
 const errorReasons=[...new Set(failed.map(x=>String(x.reason?.message||'Provider request failed').slice(0,140)))].slice(0,4);
 // Persist sanitized operational evidence. Do not include keys, requests or full error stacks.
 const status={source:'Congress.gov member sponsorship ingestion',asOf:now.toISOString(),
  attempted:ids.length,updated:ids.length-failed.length,failed:failed.length,
  examples:errorReasons,recordCount:ids.length-failed.length};
 try{await politicalSnapshotWrite(db,'member_legislation_collection_health',status,now,status.updated);}
 catch(e){console.warn('Could not save member collector health: '+e.message);}
 if(failed.length)console.warn('Congress.gov member legislation refresh failures '+failed.length+'/'+ids.length+': '+errorReasons.join(' | '));
 return {attempted:ids.length,updated:ids.length-failed.length,failed:failed.length};
}

/* Federal election influence data. Explicit Bioguide-to-FEC candidate IDs
 * are supplied by the existing validated FEC finance cache; no name joins.
 * Numbers below describe FEC reporting categories, not payments to lawmakers. */
const FEC_MEMBER_ROOT='https://politics-e5yt.onrender.com/assets/data/records/finance/';
function safePositiveNumber(v){
 const n=typeof v==='number'?v:typeof v==='string'&&v.trim()?Number(v):NaN;
 return Number.isFinite(n)&&n>=0?n:null;
}
async function refreshMemberFinanceDetail(env,bioguide,fetchImpl=fetch,now=new Date()){
 if(!/^[A-Z][0-9]{6}$/.test(String(bioguide||'')))throw Error('Invalid Bioguide ID');
 const db=env?.COUNTY_DB,token=key(env,'FEC_API_KEY');
 if(!db||!token)throw Error('FEC or D1 not configured');
 const identity=await fetchImpl(FEC_MEMBER_ROOT+bioguide+'.json',{headers:{Accept:'application/json'}});
 if(!identity.ok)throw Error('No verified candidate-to-member finance file HTTP '+identity.status);
 const finance=await identity.json();
 const id=finance?.candidateId;
 if(finance?.bioguide!==bioguide||finance?.cycle!==2026||!/^[HS][A-Z0-9]{8}$/.test(String(id||'')))
  throw Error('Member finance file has no verified 2026 FEC candidate identifier');
 async function fec(path,args){
  const u=new URL('https://api.open.fec.gov/v1/'+path);
  for(const [k,v] of Object.entries({api_key:token,cycle:2026,per_page:20,...args}))u.searchParams.set(k,String(v));
  const response=await fetchImpl(u.toString(),{headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('FEC '+path+' HTTP '+response.status);
  const body=await response.json();
  if(!Array.isArray(body?.results))throw Error('FEC '+path+' response does not include results');
  return body.results;
 }
 const queries={
  size:fec('schedules/schedule_a/by_size/by_candidate/',{candidate_id:id,election_full:false}),
  state:fec('schedules/schedule_a/by_state/by_candidate/',{candidate_id:id,election_full:false}),
  outside:fec('schedules/schedule_e/totals/by_candidate/',{candidate_id:id,election_full:false}),
  committee:fec('candidate/'+id+'/committees/',{designation:'P'})
 };
 const settled=await Promise.allSettled(Object.values(queries));
 const data=Object.fromEntries(Object.keys(queries).map((k,i)=>[k,settled[i].status==='fulfilled'?settled[i].value:null]));
 if(!data.size&&!data.state&&!data.outside)throw Error('All member FEC aggregate requests failed');
 const list=(rows,make)=>rows?.slice(0,20).map(make).filter(Boolean)||[];
 const contributionSizes=data.size?list(data.size,x=>{
  const total=safePositiveNumber(x.total);if(total===null||x.size===undefined)return null;
  return {size:String(x.size).slice(0,50),total,count:safePositiveNumber(x.count)};
 }):null;
 const byState=data.state?list(data.state,x=>{
  const state=String(x.state||'').toUpperCase(),total=safePositiveNumber(x.total);
  if(!/^[A-Z]{2}$/.test(state)||total===null)return null;
  return {state,total,count:safePositiveNumber(x.count)};
 }):null;
 const outsideSpending=data.outside?list(data.outside,x=>{
  const total=safePositiveNumber(x.total),side=String(x.support_oppose||x.support_oppose_indicator||'').toUpperCase();
  if(total===null||!['S','O','SUPPORT','OPPOSE'].includes(side))return null;
  return {side:side.startsWith('S')?'support':'oppose',total,count:safePositiveNumber(x.count)};
 }):null;
 let reportedEmployers=null,employerScope=null;
 const committees=data.committee?.filter(x=>x?.designation==='P'&&/^C[0-9]{8}$/.test(String(x.committee_id||'')))||[];
 if(committees.length===1){
  try{
   const rows=await fec('schedules/schedule_a/by_employer/',{committee_id:committees[0].committee_id});
   reportedEmployers=list(rows,x=>{
    const employer=safeBillText(x.employer,90),total=safePositiveNumber(x.total);
    if(!employer||total===null)return null;
    return {employer,total,count:safePositiveNumber(x.count)};
   });
   employerScope='Principal campaign committee only; employer is self-reported and does not establish a corporate contribution.';
  }catch(_){}
 }
 const sections=[contributionSizes,byState,outsideSpending,reportedEmployers].filter(x=>x!==null).length;
 const doc={source:'Federal Election Commission',bioguide,candidateId:id,cycle:2026,retrievedAt:now.toISOString(),
  coverage:'Limited itemized FEC aggregate breakdowns for the 2025–2026 cycle. These summaries do not exhaust all contributions, committees or transfers.',
  sourceUrl:'https://www.fec.gov/data/candidate/'+id+'/?cycle=2026',
  contributionSizes,byState,outsideSpending,reportedEmployers,employerScope,sections};
 await politicalSnapshotWrite(db,'member_finance_detail_'+bioguide,doc,now,sections);
 return {bioguide,candidateId:id,sections};
}
/* LobbyView networks are research-constructed client/bill overlap records.
 * They are not evidence that clients paid lawmakers or contacted their offices.
 * A verified client_uuid must match before a client name can be presented. */
async function refreshMemberLobby(env,bioguide,fetchImpl=fetch,now=new Date()){
 if(!/^[A-Z][0-9]{6}$/.test(String(bioguide||'')))throw Error('Invalid Bioguide ID');
 const db=env?.COUNTY_DB;
 if(!db)throw Error('LobbyView D1 binding missing');
 const route={u:'https://rest-api.lobbyview.org/api/networks?legislator_id=eq.'+bioguide+'&page=1',options:{headers:{Accept:'application/json'}}};
 const resp=await getUpstream('lobbyview',route,env,fetchImpl);
 if(!resp.ok)throw Error('LobbyView networks HTTP '+resp.status);
 const body=await resp.json();
 const rows=Array.isArray(body)?body:Array.isArray(body?.data)?body.data:Array.isArray(body?.results)?body.results:null;
 if(!rows)throw Error('LobbyView network response schema not recognized');
 const connections=rows.filter(x=>x?.legislator_id===bioguide&&[2025,2026].includes(Number(x.report_year))&&
  /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(String(x.client_uuid||'')));
 const unique=[...new Map(connections.map(x=>[x.client_uuid,x])).values()];
 const clients=[];
 for(const link of unique.slice(0,2)){
  const url='https://rest-api.lobbyview.org/api/clients?client_uuid=eq.'+encodeURIComponent(link.client_uuid);
  try{
   const r=await getUpstream('lobbyview',{u:url,options:{headers:{Accept:'application/json'}}},env,fetchImpl);
   if(!r.ok)continue;
   const payload=await r.json();
   const list=Array.isArray(payload)?payload:Array.isArray(payload?.data)?payload.data:Array.isArray(payload?.results)?payload.results:[];
   const item=list.find(x=>x.client_uuid===link.client_uuid&&typeof x.client_name==='string');
   if(item)clients.push({clientUuid:link.client_uuid,name:safeBillText(item.client_name,120),
    reportYear:Number(link.report_year),billOverlapCount:safePositiveNumber(link.n_bills_sponsored)});
  }catch(_){}
 }
 const record={source:'LobbyView researcher-coded bill/client networks',bioguide,retrievedAt:now.toISOString(),
  sourceUrl:'https://www.lobbyview.org/data-download/api/',clientCount:unique.length,clients,
  coverage:'Only available 2025–2026 network records in the first returned page; network matches are research-coded bill/client overlaps, not donations, payments or confirmed lobbying meetings.'};
 await politicalSnapshotWrite(db,'member_lobby_network_'+bioguide,record,now,record.clientCount);
 return {bioguide,clientCount:unique.length,identifiedClients:clients.length};
}
async function refreshMemberExtraBatch(env,kind,slot,fetchImpl=fetch,now=new Date()){
 const db=env?.COUNTY_DB;
 if(!db)throw Error('D1 not configured');
 const r=await db.prepare('SELECT snapshot_json FROM county_snapshots WHERE source=?').bind('congress_members_current').first();
 if(!r)return {status:'roster_pending'};
 const roster=JSON.parse(r.snapshot_json);
 const ids=[...new Set(Object.values(roster.states||{}).flatMap(s=>[...(s.house||[]),...(s.senators||[])])
  .map(m=>m.bioguide).filter(id=>/^[A-Z][0-9]{6}$/.test(String(id||''))))].sort();
 if(ids.length<400)return {status:'incomplete_roster'};
 const finance=kind==='finance',count=finance?5:2;
 const days=Math.floor(now.getTime()/86400000);
 const start=((days*36+slot-12)*count)%ids.length;
 const selected=Array.from({length:count},(_,i)=>ids[(start+i)%ids.length]);
 const jobs=selected.map(id=>(finance?refreshMemberFinanceDetail:refreshMemberLobby)(env,id,fetchImpl,now));
 const results=await Promise.allSettled(jobs);
 const issues=[...new Set(results.filter(x=>x.status==='rejected').map(x=>String(x.reason?.message||'unknown failure').slice(0,130)))].slice(0,6);
 const ok=results.filter(x=>x.status==='fulfilled').length;
 const summary={source:finance?'FEC member aggregate collector':'LobbyView member network collector',
  asOf:now.toISOString(),attempted:count,updated:ok,failed:count-ok,examples:issues};
 await politicalSnapshotWrite(db,finance?'member_finance_collection_health':'member_lobby_collection_health',summary,now,ok);
 return summary;
}

/* Source: Census TIGERweb official 2025 generalized legislative boundary polygons.
 * Layer 5 = 119th U.S. House; 8 = 2024 state Senate; 9 = 2024 state House.
 * This proxy serves only public polygons; does not mix in county boundaries. */
async function fetchDistrictGeometry(u,request,ctx,fetcher){
 const layer=u.searchParams.get('layer'),state=u.searchParams.get('state')||'';
 const layers={house:5,stateSenate:8,stateHouse:9};
 if(!Object.hasOwn(layers,layer)||!/^[0-9]{2}$/.test(state)||!US_STATE_ABBRS_FIPS.has(state))
  return json({error:'Unsupported district layer or state'},400);
 const cache=globalThis.caches?.default;
 if(cache){
  try{const cached=await cache.match(request);if(cached)return cached;}catch{}
 }
 const census=new URL('https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2025/Legislative/MapServer/'+layers[layer]+'/query');
 for(const [k,v] of Object.entries({where:"STATE='"+state+"'",outFields:'GEOID,BASENAME,STATE',outSR:'4326',returnGeometry:'true',geometryPrecision:'4',f:'geojson'}))census.searchParams.set(k,v);
 let response;
 try{response=await fetcher(census.toString(),{headers:{Accept:'application/json'}});}
 catch(_){return json({error:'Census geographic service unreachable'},502);}
 if(!response.ok)return json({error:'Census geographic service HTTP '+response.status},502);
 let data;
 try{data=await response.json();}catch(_){return json({error:'Invalid Census boundary response'},502);}
 if(data?.type!=='FeatureCollection'||!Array.isArray(data.features)||!data.features.some(x=>x.geometry?.coordinates?.length))
  return json({error:'No usable polygons returned by Census'},502);
 const output=json({source:'U.S. Census Bureau TIGERweb',state,layer,vintage:layer==='house'?'119th Congress (January 2025)':'2024 legislative district boundaries',data},200,604800);
 if(cache){try{const save=cache.put(request,output.clone());if(ctx.waitUntil)ctx.waitUntil(save);else await save;}catch{}}
 return output;
}
const US_STATE_ABBRS_FIPS=new Set('01 02 04 05 06 08 09 10 11 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56'.split(' '));

async function handleCore(request,env,ctx={},fetcher=fetch){
 const u=new URL(request.url),path=u.pathname.replace(/\/+$/,'');
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
 if(request.method!=='GET')return json({error:'GET only'},405);
 if(path==='/'||path==='/health')return json({service:'POLITICS Research API',status:'operational',providers:Object.keys(CATALOG).length+Object.keys(KEYLESS_SOURCES).length+Object.keys(ACCESS_REQUIRED).length,catalog:'/api/catalog'},200,300);
 if(path==='/api/county-snapshot')return getSnapshot(env);
 if(path==='/api/district-geometry')return fetchDistrictGeometry(u,request,ctx,fetcher);
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
export async function handle(request,env,ctx={},fetcher=fetch){
 return withOriginCors(await handleCore(request,env,ctx,fetcher),request,env);
}
export default {
 fetch:handle,
 scheduled(event,env,ctx){
  // One cron trigger, fixed slots: 7 categories, statewide EIA, and the baseline Census.
  // Every slot is a single source group; reserve remaining slots for 27-provider future jobs.
  const when=new Date(event.scheduledTime??Date.now());
  const slot=when.getUTCHours()*2+(when.getUTCMinutes()>=30?1:0);
  const tasks=['housing','jobs','income','healthcare','education','families','infrastructure','eia','census','places','congressMembers'];
  // Slot 11: once/day update recent House roll calls from official Congress.gov.
  if(slot===11){ctx.waitUntil(refreshFederalHouseVotes(env));return;}
  // Remaining 36 slots: alternate Open States (primary) and Bill Commons
  // (optional supplement). Each state rotates roughly every three days.
  if(slot>=12&&slot<48){
   const days=Math.floor(when.getTime()/86400000);
   const index=Math.floor((slot-12)/2);
   const state=BILL_COMMONS_STATES[(days*18+index)%BILL_COMMONS_STATES.length];
   ctx.waitUntil(slot%2===0?refreshOpenStatesState(env,state):refreshBillCommonsState(env,state));
   // Member-level FEC, lobbying and sponsorship fetches run in the isolated
   // politics-member-ingest Worker. Keep this scheduled job focused on states.
   return;
  }
  const task=tasks[slot];if(!task)return;
  ctx.waitUntil(task==='eia'?refreshStateEnergy(env):task==='census'?refreshCensusSnapshot(env):task==='places'?refreshPlacesHealth(env):task==='congressMembers'?refreshCongressMembers(env):updateCountyCategory(env,task));
 }
};

// Named exports for the scheduled-collection regression suite.
export { COUNTY_CATEGORY_CONFIG, updateCountyCategory, refreshStateEnergy, refreshPlacesHealth, refreshCongressMembers, refreshBillCommonsState, refreshOpenStatesState, refreshFederalHouseVotes, refreshMemberLegislation, refreshMemberLegislationBatch, refreshMemberFinanceDetail, refreshMemberLobby, refreshMemberExtraBatch };

'use strict';
const READER='https://politics-daily-snapshot.alxayvazian.workers.dev';
const GATEWAY='https://crimson-mud-d254.alxayvazian.workers.dev';
const META={
 airnow:{name:'AirNow',where:'County Atlas · Infrastructure & Environment',match:[],onDemandLive:true,note:'Current preliminary reporting-area air quality loaded on demand by ZIP.'},
 bea:{name:'Bureau of Economic Analysis',where:'County Atlas · Jobs & Economy',match:['bea_county_per_capita_income'],note:'Annual county per-capita personal income from the BEA Regional accounts.'},
 bls:{name:'Bureau of Labor Statistics',where:'County Atlas · Jobs & Economy',match:['bls_laus_county'],note:'Latest monthly county labor-force and unemployment statistics from BLS LAUS.'},
 census:{name:'U.S. Census Bureau',where:'County Atlas · every conditions tab',match:['census_acs5','census_housing','census_jobs','census_income','census_healthcare','census_education','census_families','census_infrastructure'],note:'ACS county conditions and demographics.'},
 congress:{name:'Congress.gov',where:'Congressional Records · Legislation / County Atlas · Representation / Government Action',match:['congress_members_current','member_legislation','congress_house_votes_recent'],note:'Federal member, legislation and House roll-call records.'},
 datagov:{name:'Data.gov',where:'Data Sources · Live Research Tools',match:[],onDemandLive:true,note:'Federal dataset catalog searched on demand; catalog entries identify datasets and do not by themselves establish a finding.'},
 eia:{name:'U.S. Energy Information Administration',where:'County Atlas · Infrastructure & Environment',match:['eia_state_electricity'],note:'State residential electricity-price data.'},
 fda:{name:'openFDA',where:'Data Sources · Live Research Tools',match:[],onDemandLive:true,note:'Published FDA animal adverse-event reports searched on demand by active ingredient; reports are not incidence, causality or pricing data.'},
 fdic:{name:'FDIC BankFind Suite',where:'County Atlas · Housing',match:['fdic_county_offices'],note:'Current physical office presence for FDIC-insured banks and savings associations by county.'},
 fec:{name:'Federal Election Commission',where:'Congressional Records · Campaign Money / PAC & Networks',match:['member_finance_detail','political_money','member_finance_collection_health'],note:'Campaign finance, itemized receipts and committee-network filings.'},
 fred:{name:'Federal Reserve Economic Data',where:'Data Sources · Live Research Tools / County Atlas · Jobs & Economy context',match:[],onDemandLive:true,note:'Official FRED economic time series loaded on demand as national context.'},
 govinfo:{name:'GovInfo',where:'Government Action · Official Publications',match:[],onDemandLive:true,note:'Official federal publications and documents searched on demand.'},
 lda:{name:'Senate LDA',where:'Congressional Records · Lobbying',match:[],onDemandLive:true,note:'Official federal LD-1/LD-2 lobbying disclosure filings searched on demand.'},
 maptiler:{name:'MapTiler',where:'Geocoding utility · no public data panel',match:[],note:'Geocoding support.'},
 noaa:{name:'NOAA NCEI',where:'County Atlas · Infrastructure & Environment',match:[],onDemandLive:true,note:'Recent GHCN-Daily station observations loaded on demand for a selected county.'},
 openstates:{name:'Open States',where:'County Atlas · Representation / Congressional Atlas',match:['openstates'],note:'State legislators and legislation.'},
 regulations:{name:'Regulations.gov',where:'Government Action · Regulatory Dockets',match:[],onDemandLive:true,note:'Federal rulemaking dockets and documents searched on demand.'},
 usgs:{name:'USGS Water',where:'County Atlas · Infrastructure & Environment',match:[],onDemandLive:true,note:'Recent daily-mean streamflow observations loaded on demand for monitoring sites associated with a selected county.'},
 cfpb:{name:'Consumer Financial Protection Bureau',where:'County Atlas · Housing',match:['cfpb_mortgage_state_24m'],note:'Rolling 24-month statewide mortgage complaint context; complaints are allegations and are not a representative sample.'},
 cms:{name:'CMS',where:'County Atlas · Health & Well-Being',match:['cms_partb_state_provider_activity'],note:'2024 statewide published Medicare Part B rendering-provider activity; not a count of all clinicians or guaranteed access.'},
 hmda:{name:'FFIEC / HMDA',where:'County Atlas · Housing',match:['hmda_state_2025'],note:'2025 statewide mortgage application outcomes from the HMDA Data Browser.'},
 federalregister:{name:'Federal Register',where:'Government Action · Rules & Notices',match:[],onDemandLive:true,note:'Official federal rules, proposed rules and notices searched on demand.'},
 sec:{name:'SEC EDGAR',where:'Data Sources · Live Research Tools',match:[],onDemandLive:true,note:'Public company filings searched on demand; SEC filings are corporate disclosures, not political donations.'},
 usaspending:{name:'USAspending',where:'County Atlas · Federal Money',match:['usaspending_county'],note:'Federal prime-award obligations by county place of performance.'},
 epa_aqs:{name:'EPA AQS / Air Trends',where:'County Atlas · Infrastructure & Environment',match:['epa_air_quality_county_2025'],note:'Official 2025 county air-monitoring statistics from EPA AQS, with monitoring-coverage limits.'},
 fcc_broadband:{name:'FCC National Broadband Map',where:'County Atlas · Infrastructure & Environment',match:['fcc_broadband_county'],note:'Daily stored county fixed-broadband availability from the current FCC National Broadband Map Area Comparison feed; availability is provider-reported and is not a speed-test or affordability measure.'}
};
const EXTRA=[
 {id:'cdc_places',name:'CDC PLACES',category:'health',configured:true,description:'Modeled county health and well-being estimates.',match:['cdc_places_2025'],where:'County Atlas · Health & Well-Being'},
 {id:'billcommons',name:'Bill Commons',category:'policy',configured:true,description:'State legislative index used as a supplementary source.',match:['billcommons'],where:'County Atlas · Representation'},
 {id:'fara',name:'U.S. Department of Justice FARA',category:'influence',configured:true,staticLive:true,description:'Foreign-agent registrations and source-verified filing totals.',match:[],where:'Foreign Influence'},
 {id:'voteview',name:'Voteview / UCLA',category:'policy',configured:true,staticLive:true,description:'Historical and current congressional roll-call datasets used for member vote snapshots.',match:[],where:'Congressional Records · Voting Record'},
 {id:'ncsl',name:'National Conference of State Legislatures',category:'policy',configured:true,staticLive:true,description:'Published state partisan composition used for state-control context.',match:[],where:'County Atlas · Overview / Representation'},
 {id:'tiger',name:'U.S. Census TIGER/Line',category:'geography',configured:true,staticLive:true,description:'Congressional and state-legislative boundary geometry.',match:[],where:'Congressional Atlas'}
];
let filter='all',query='';
const fmtDate=value=>{if(!value)return 'Not yet stored';const d=new Date(value);return Number.isNaN(d.valueOf())?String(value):d.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'});};
const fmt=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-US'):'—';
function matchesDataset(row,key){return key===row.source||row.source.startsWith(key+'_')||row.source.startsWith(key);}
function classify(provider,datasets,health){
 const keys=provider.match||[];
 if(provider.staticLive)return {status:'live',label:'Live',linked:[],issue:null};
 if(provider.onDemandLive&&provider.configured)return {status:'live',label:'Live on demand',linked:[],issue:null};
 const linked=datasets.filter(row=>keys.some(key=>matchesDataset(row,key)));
 const issue=health.find(row=>keys.includes(row.source)||keys.some(key=>row.source.startsWith(key)))||
 if(issue&&issue.failed>0&&issue.updated===0)return {status:'issue',label:'Needs attention',linked,issue};
 if(linked.some(row=>row.records>0||row.snapshots>1))return {status:'live',label:'Live',linked,issue};
 return {status:'connected',label:provider.configured?'Connected':'Not configured',linked,issue};
}
function card(provider,datasets,health){
 const state=classify(provider,datasets,health);
 const el=document.createElement('article');el.className='sourceHealthCard';el.dataset.status=state.status;
 el.dataset.search=[provider.name,provider.category,provider.description,provider.where].join(' ').toLowerCase();
 const top=document.createElement('div');top.className='sourceHealthTop';
 const h=document.createElement('h3');h.textContent=provider.name;
 const badge=document.createElement('span');badge.className='sourceStatusBadge '+state.status;badge.textContent=state.label;
 top.append(h,badge);el.append(top);
 const desc=document.createElement('div');desc.className='sourceDescription';desc.textContent=provider.description;el.append(desc);
 if(state.issue?.examples?.length){
  const problem=document.createElement('div');problem.className='sourceHealthIssue';problem.textContent=state.issue.examples.join(' · ');el.append(problem);
 }
 const newest=state.linked.map(x=>x.refreshedAt).filter(Boolean).sort().at(-1)||state.issue?.refreshedAt||null;
 const records=state.linked.reduce((sum,x)=>sum+(Number(x.records)||0),0);
 const snapshots=state.linked.reduce((sum,x)=>sum+(Number(x.snapshots)||0),0);
 const meta=document.createElement('div');meta.className='sourceMeta';
 const coverage=provider.onDemandLive?'Official API search available on demand · results are not stored':
  state.linked.length?(fmt(records)+' records · '+fmt(snapshots)+' snapshots'):'No stored dataset yet';
 for(const [label,value] of [['Last stored refresh',provider.onDemandLive?'On-demand query':fmtDate(newest)],['Coverage',coverage]]){
  const box=document.createElement('div'),l=document.createElement('span'),v=document.createElement('strong');l.textContent=label;v.textContent=value;box.append(l,v);meta.append(box);
 }
 el.append(meta);
 const where=document.createElement('div');where.className='sourceWhere';where.textContent='Appears: '+provider.where;el.append(where);
 return el;
}
function applyFilter(){
 document.querySelectorAll('.sourceHealthCard').forEach(card=>{
  const status=card.dataset.status,search=card.dataset.search||'';
  card.hidden=(filter!=='all'&&status!==filter)||(query&&!search.includes(query));
 });
}
function researchMessage(root,text,className=''){
 root.replaceChildren();
 const p=document.createElement('p');if(className)p.className=className;p.textContent=text;root.append(p);
}
function formatFredValue(value){
 const n=Number(value);
 return Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:2}):String(value??'—');
}
function wireFredTool(){
 const tool=document.querySelector('[data-fred-tool]');if(!tool)return;
 const form=tool.querySelector('[data-fred-form]'),select=tool.querySelector('[data-fred-series]'),result=tool.querySelector('[data-fred-result]');
 const labels={UNRATE:'U.S. unemployment rate',CPIAUCSL:'Consumer Price Index',FEDFUNDS:'Federal funds rate',MORTGAGE30US:'30-year mortgage rate',PAYEMS:'Total nonfarm payrolls'};
 form?.addEventListener('submit',async event=>{
  event.preventDefault();
  const series=String(select?.value||'UNRATE');
  researchMessage(result,'Loading '+(labels[series]||series)+'…');
  try{
   const response=await fetch(GATEWAY+'/api/fred?series='+encodeURIComponent(series)+'&limit=18',{headers:{Accept:'application/json'},credentials:'omit'});
   const payload=await response.json();
   if(!response.ok)throw Error(payload?.error||'FRED request failed');
   const rows=Array.isArray(payload?.data?.observations)?payload.data.observations.filter(row=>row&&row.value!=='.').slice(0,12):[];
   result.replaceChildren();
   const head=document.createElement('div');head.className='researchResultHead';
   const title=document.createElement('strong');title.textContent=labels[series]||series;
   const source=document.createElement('a');source.href='https://fred.stlouisfed.org/series/'+encodeURIComponent(series);source.target='_blank';source.rel='noopener noreferrer';source.textContent='FRED source ↗';
   head.append(title,source);result.append(head);
   if(!rows.length){researchMessage(result,'FRED returned no usable observations for this series.');return;}
   const latest=rows[0],latestBox=document.createElement('div');latestBox.className='researchLatest';
   latestBox.append(Object.assign(document.createElement('span'),{textContent:'Latest observation'}),Object.assign(document.createElement('strong'),{textContent:formatFredValue(latest.value)}),Object.assign(document.createElement('small'),{textContent:String(latest.date||'')}));
   result.append(latestBox);
   const list=document.createElement('div');list.className='researchObservationList';
   for(const row of rows.slice(0,8)){
    const item=document.createElement('div'),date=document.createElement('span'),value=document.createElement('strong');
    date.textContent=String(row.date||'');value.textContent=formatFredValue(row.value);item.append(date,value);list.append(item);
   }
   result.append(list);
   const note=document.createElement('p');note.className='researchCaveat';note.textContent='National FRED series shown for economic context. Do not interpret this as a county-level estimate.';result.append(note);
  }catch(error){researchMessage(result,'FRED could not be loaded right now: '+String(error?.message||'request failed'),'researchError');}
 });
}
function secRecentFilings(data){
 const recent=data?.filings?.recent||{},forms=Array.isArray(recent.form)?recent.form:[],out=[];
 for(let i=0;i<Math.min(forms.length,12);i++){
  const accession=recent.accessionNumber?.[i],doc=recent.primaryDocument?.[i];
  out.push({form:forms[i],date:recent.filingDate?.[i]||'',description:recent.primaryDocDescription?.[i]||'',accession,doc});
 }
 return out.filter(row=>row.form);
}
function wireSecTool(){
 const tool=document.querySelector('[data-sec-tool]');if(!tool)return;
 const form=tool.querySelector('[data-sec-form]'),input=tool.querySelector('[data-sec-query]'),result=tool.querySelector('[data-sec-result]');
 async function loadCompany(company){
  researchMessage(result,'Loading recent SEC filings for '+company.title+'…');
  try{
   const response=await fetch(GATEWAY+'/api/sec?cik='+encodeURIComponent(company.cik),{headers:{Accept:'application/json'},credentials:'omit'});
   const payload=await response.json();
   if(!response.ok)throw Error(payload?.error||'SEC submissions request failed');
   const data=payload?.data||{},filings=secRecentFilings(data);
   result.replaceChildren();
   const head=document.createElement('div');head.className='researchResultHead';
   const title=document.createElement('strong');title.textContent=(data.name||company.title)+(company.ticker?' · '+company.ticker:'');
   const sec=document.createElement('a');sec.href='https://www.sec.gov/edgar/browse/?CIK='+encodeURIComponent(company.cik)+'&owner=exclude';sec.target='_blank';sec.rel='noopener noreferrer';sec.textContent='SEC company page ↗';head.append(title,sec);result.append(head);
   if(!filings.length){const p=document.createElement('p');p.textContent='No recent filings were returned in the current submissions record.';result.append(p);return;}
   const list=document.createElement('div');list.className='researchFilingList';
   for(const row of filings){
    const article=document.createElement('article'),top=document.createElement('div'),formName=document.createElement('strong'),date=document.createElement('span');
    formName.textContent=row.form;date.textContent=row.date;top.append(formName,date);article.append(top);
    if(row.description){const d=document.createElement('p');d.textContent=row.description;article.append(d);}
    if(row.accession&&row.doc){
     const accessionNo=String(row.accession).replaceAll('-',''),cik=String(Number(company.cik));
     const link=document.createElement('a');link.href='https://www.sec.gov/Archives/edgar/data/'+encodeURIComponent(cik)+'/'+encodeURIComponent(accessionNo)+'/'+encodeURIComponent(row.doc);
     link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open filing ↗';article.append(link);
    }
    list.append(article);
   }
   result.append(list);
   const note=document.createElement('p');note.className='researchCaveat';note.textContent='SEC EDGAR filings are corporate disclosure records. They do not establish political donations, lobbying, wrongdoing, or a relationship with a public official.';result.append(note);
  }catch(error){researchMessage(result,'SEC filings could not be loaded right now: '+String(error?.message||'request failed'),'researchError');}
 }
 form?.addEventListener('submit',async event=>{
  event.preventDefault();
  const q=String(input?.value||'').trim();
  if(q.length<2){researchMessage(result,'Enter at least two characters of a company name or ticker.');return;}
  researchMessage(result,'Searching SEC company records…');
  try{
   const response=await fetch(GATEWAY+'/api/sec?q='+encodeURIComponent(q),{headers:{Accept:'application/json'},credentials:'omit'});
   const payload=await response.json();
   if(!response.ok)throw Error(payload?.error||'SEC company search failed');
   const matches=Array.isArray(payload?.data?.results)?payload.data.results:[];
   result.replaceChildren();
   if(!matches.length){researchMessage(result,'No SEC company match was found for that search.');return;}
   const list=document.createElement('div');list.className='researchCompanyList';
   for(const company of matches){
    const button=document.createElement('button');button.type='button';
    const title=document.createElement('strong');title.textContent=company.title||'Unnamed company';
    const meta=document.createElement('span');meta.textContent=[company.ticker,'CIK '+company.cik].filter(Boolean).join(' · ');
    button.append(title,meta);button.addEventListener('click',()=>loadCompany(company));list.append(button);
   }
   result.append(list);
  }catch(error){researchMessage(result,'SEC company search could not be loaded right now: '+String(error?.message||'request failed'),'researchError');}
 });
}
function wireDataGovTool(){
 const tool=document.querySelector('[data-datagov-tool]');if(!tool)return;
 const form=tool.querySelector('[data-datagov-form]'),input=tool.querySelector('[data-datagov-query]'),result=tool.querySelector('[data-datagov-result]');
 form?.addEventListener('submit',async event=>{
  event.preventDefault();
  const q=String(input?.value||'').trim();
  if(q.length<2){researchMessage(result,'Enter at least two characters for a dataset topic.');return;}
  researchMessage(result,'Searching Data.gov…');
  try{
   const response=await fetch(GATEWAY+'/api/datagov?q='+encodeURIComponent(q)+'&limit=10',{headers:{Accept:'application/json'},credentials:'omit'});
   const payload=await response.json();
   if(!response.ok)throw Error(payload?.error||'Data.gov search failed');
   const rows=Array.isArray(payload?.data?.results)?payload.data.results:[];
   result.replaceChildren();
   if(!rows.length){researchMessage(result,'No Data.gov catalog matches were returned for that topic.');return;}
   const list=document.createElement('div');list.className='researchFilingList';
   for(const row of rows.slice(0,10)){
    const article=document.createElement('article');
    const top=document.createElement('div'),title=document.createElement('strong');
    title.textContent=String(row?.title||row?.name||'Untitled dataset').slice(0,180);top.append(title);article.append(top);
    const org=row?.publisher||row?.organization?.name||row?.organization?.title||row?.dcat?.publisher?.name||'';
    if(org){const meta=document.createElement('p');meta.textContent=String(org).slice(0,160);article.append(meta);}
    const notes=String(row?.description||row?.dcat?.description||row?.notes||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    if(notes){const desc=document.createElement('p');desc.textContent=notes.slice(0,320);article.append(desc);}
    const url=row?.url||row?.landing_page||('https://catalog.data.gov/dataset/'+encodeURIComponent(String(row?.slug||row?.identifier||row?.name||'')));
    const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open catalog record ↗';article.append(link);
    list.append(article);
   }
   result.append(list);
   const note=document.createElement('p');note.className='researchCaveat';note.textContent='Data.gov is a catalog. A matching catalog entry tells you a dataset exists; inspect the dataset, methodology and publication date before drawing a conclusion.';result.append(note);
  }catch(error){researchMessage(result,'Data.gov could not be loaded right now: '+String(error?.message||'request failed'),'researchError');}
 });
}
function fdaDrugNames(row){
 const drugs=Array.isArray(row?.drug)?row.drug:[];
 const values=[];
 for(const drug of drugs){
  if(drug?.brand_name)values.push(String(drug.brand_name));
  for(const item of Array.isArray(drug?.active_ingredients)?drug.active_ingredients:[])if(item?.name)values.push(String(item.name));
 }
 return [...new Set(values)].slice(0,5);
}
function wireFdaTool(){
 const tool=document.querySelector('[data-fda-tool]');if(!tool)return;
 const form=tool.querySelector('[data-fda-form]'),input=tool.querySelector('[data-fda-query]'),result=tool.querySelector('[data-fda-result]');
 form?.addEventListener('submit',async event=>{
  event.preventDefault();
  const q=String(input?.value||'').trim();
  if(q.length<2){researchMessage(result,'Enter at least two characters of an active ingredient.');return;}
  researchMessage(result,'Searching openFDA animal adverse-event reports…');
  try{
   const response=await fetch(GATEWAY+'/api/fda?q='+encodeURIComponent(q)+'&limit=10',{headers:{Accept:'application/json'},credentials:'omit'});
   const payload=await response.json();
   if(!response.ok)throw Error(payload?.error||'openFDA search failed');
   const rows=Array.isArray(payload?.data?.results)?payload.data.results:[];
   result.replaceChildren();
   if(!rows.length){researchMessage(result,'No published openFDA animal adverse-event reports matched that active ingredient.');return;}
   const list=document.createElement('div');list.className='researchFilingList';
   for(const row of rows.slice(0,10)){
    const article=document.createElement('article'),top=document.createElement('div'),species=document.createElement('strong'),date=document.createElement('span');
    species.textContent=String(row?.animal?.species||'Animal adverse-event report').slice(0,80);
    date.textContent=String(row?.original_receive_date||row?.onset_date||'').slice(0,10);
    top.append(species,date);article.append(top);
    const names=fdaDrugNames(row);
    if(names.length){const p=document.createElement('p');p.textContent='Reported product/ingredient: '+names.join(' · ');article.append(p);}
    const serious=row?.serious_ae;
    const status=document.createElement('p');status.textContent='Reported serious adverse event: '+(serious===true||String(serious).toLowerCase()==='yes'?'Yes':serious===false||String(serious).toLowerCase()==='no'?'No':'Not stated');article.append(status);
    list.append(article);
   }
   result.append(list);
   const note=document.createElement('p');note.className='researchCaveat';note.textContent='FDA states these are adverse-event reports, not proof of causation or incidence. Animal & Veterinary reports are updated quarterly and can lag FDA receipt by months.';result.append(note);
  }catch(error){researchMessage(result,'openFDA could not be loaded right now: '+String(error?.message||'request failed'),'researchError');}
 });
}
async function load(){
 const status=document.getElementById('sourceStatus');
 try{
  const [catalogRes,healthRes,spendingRes,housingFinanceRes,cmsPartBRes,epaAirQualityRes,fdicBankingRes,fccBroadbandRes]=await Promise.all([
   fetch(GATEWAY+'/api/catalog',{headers:{Accept:'application/json'},credentials:'omit'}),
   fetch(READER+'/api/data-health',{headers:{Accept:'application/json'},credentials:'omit'}),
   fetch('assets/data/county/usaspending.json',{headers:{Accept:'application/json'},credentials:'same-origin',cache:'no-cache'}),
   fetch('assets/data/state/housing-finance.json',{headers:{Accept:'application/json'},credentials:'same-origin',cache:'no-cache'}),
   fetch('assets/data/state/cms-partb-provider-activity.json',{headers:{Accept:'application/json'},credentials:'same-origin',cache:'no-cache'}),
   fetch('assets/data/county/epa-air-quality-2025.json',{headers:{Accept:'application/json'},credentials:'same-origin',cache:'no-cache'}),
   fetch('assets/data/county/fdic-banking-access.json',{headers:{Accept:'application/json'},credentials:'same-origin',cache:'no-cache'}),
   fetch('assets/data/county/fcc-broadband-availability.json',{headers:{Accept:'application/json'},credentials:'same-origin',cache:'no-cache'})
  ]);
  const catalog=catalogRes.ok?await catalogRes.json():{providers:[]};
  const health=healthRes.ok?await healthRes.json():{datasets:[],collectionHealth:[]};
  const spending=spendingRes.ok?await spendingRes.json():null;
  const housingFinance=housingFinanceRes.ok?await housingFinanceRes.json():null;
  const cmsPartB=cmsPartBRes.ok?await cmsPartBRes.json():null;
  const epaAirQuality=epaAirQualityRes.ok?await epaAirQualityRes.json():null;
  const fdicBanking=fdicBankingRes.ok?await fdicBankingRes.json():null;
  const fccBroadband=fccBroadbandRes.ok?await fccBroadbandRes.json():null;
  if(spending?.source==='USAspending.gov'&&Number(spending.count)>0){
   health.datasets=(health.datasets||[]).concat([{
    source:'usaspending_county',refreshedAt:spending.retrievedAt||null,
    records:Number(spending.count)||0,snapshots:1,database:'static'
   }]);
  }
  if(housingFinance?.source==='FFIEC HMDA + CFPB Consumer Complaint Database'&&Number(housingFinance.stateCount)>0){
   const records=Number(housingFinance.stateCount)||0,refreshedAt=housingFinance.retrievedAt||null;
   health.datasets=(health.datasets||[]).concat([
    {source:'hmda_state_2025',refreshedAt,records,snapshots:1,database:'static'},
    {source:'cfpb_mortgage_state_24m',refreshedAt,records,snapshots:1,database:'static'}
   ]);
  }
  if(cmsPartB?.source==='Centers for Medicare & Medicaid Services'&&Number(cmsPartB.stateCount)>0){
   health.datasets=(health.datasets||[]).concat([{
    source:'cms_partb_state_provider_activity',refreshedAt:cmsPartB.retrievedAt||null,
    records:Number(cmsPartB.stateCount)||0,snapshots:1,database:'static'
   }]);
  }
  if(epaAirQuality?.source==='U.S. EPA Air Quality System / Air Trends'&&Number(epaAirQuality.count)>0){
   health.datasets=(health.datasets||[]).concat([{
    source:'epa_air_quality_county_2025',refreshedAt:epaAirQuality.retrievedAt||null,
    records:Number(epaAirQuality.count)||0,snapshots:1,database:'static'
   }]);
  }
  if(fdicBanking?.source==='FDIC BankFind Suite'&&Number(fdicBanking.officeCount)>0){
   health.datasets=(health.datasets||[]).concat([{
    source:'fdic_county_offices',refreshedAt:fdicBanking.retrievedAt||fdicBanking.dataAsOf||null,
    records:Number(fdicBanking.officeCount)||0,snapshots:1,database:'static'
   }]);
  }
  if(fccBroadband?.source==='FCC National Broadband Map'&&Number(fccBroadband.count)>0){
   health.datasets=(health.datasets||[]).concat([{
    source:'fcc_broadband_county',refreshedAt:fccBroadband.retrievedAt||fccBroadband.releaseDate||null,
    records:Number(fccBroadband.count)||0,snapshots:1,database:'static'
   }]);
  }
  const providers=(catalog.providers||[]).map(p=>({
   ...p,id:p.id,name:META[p.id]?.name||p.id,description:META[p.id]?.note||p.description,
   match:META[p.id]?.match||[],where:META[p.id]?.where||'Research adapter · no public surface',
   onDemandLive:!!META[p.id]?.onDemandLive
  })).concat(EXTRA.map(x=>({...x,note:x.description})));
  const grid=document.getElementById('sourceGrid');grid.replaceChildren();
  providers.sort((a,b)=>a.name.localeCompare(b.name)).forEach(p=>grid.append(card(p,health.datasets||[],health.collectionHealth||[])));
  document.getElementById('connectedCount').textContent=String(providers.filter(p=>p.configured!==false).length);
  document.getElementById('datasetCount').textContent=String((health.datasets||[]).length);
  document.getElementById('problemCount').textContent=String((health.collectionHealth||[]).filter(x=>x.failed>0).length);
  document.getElementById('healthGenerated').textContent=fmtDate(health.generatedAt);
  status.textContent='Live status loaded from the POLITICS data reader.';
  applyFilter();
 }catch(error){
  status.textContent='Live source health could not be loaded. The site pages remain available.';
  document.getElementById('sourceGrid').textContent='Source-health service unavailable.';
 }
}
document.getElementById('sourceSearch').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();applyFilter();});
document.querySelectorAll('[data-source-filter]').forEach(btn=>btn.addEventListener('click',()=>{
 filter=btn.dataset.sourceFilter;
 document.querySelectorAll('[data-source-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));
 applyFilter();
}));
wireFredTool();
wireSecTool();
wireDataGovTool();
wireFdaTool();
load();

'use strict';
const READER='https://politics-daily-snapshot.alxayvazian.workers.dev';
const GATEWAY='https://crimson-mud-d254.alxayvazian.workers.dev';
const META={
 airnow:{name:'AirNow',where:'County Atlas · Infrastructure & Environment',match:[],note:'Preliminary reporting-area air quality.'},
 bea:{name:'Bureau of Economic Analysis',where:'County Atlas · Jobs & Economy',match:['bea_county_per_capita_income'],note:'Annual county per-capita personal income from the BEA Regional accounts.'},
 bls:{name:'Bureau of Labor Statistics',where:'County Atlas · Jobs & Economy',match:['bls_laus_county'],note:'Latest monthly county labor-force and unemployment statistics from BLS LAUS.'},
 census:{name:'U.S. Census Bureau',where:'County Atlas · every conditions tab',match:['census_acs5','census_housing','census_jobs','census_income','census_healthcare','census_education','census_families','census_infrastructure'],note:'ACS county conditions and demographics.'},
 congress:{name:'Congress.gov',where:'Congressional Records · Legislation / County Atlas · Representation',match:['congress_members_current','member_legislation','congress_house_votes_recent'],note:'Federal member, legislation and House roll-call records.'},
 datagov:{name:'Data.gov',where:'Research adapter · no voter-facing dataset yet',match:[],note:'Federal data catalog search.'},
 eia:{name:'U.S. Energy Information Administration',where:'County Atlas · Infrastructure',match:['eia_state_electricity'],note:'State residential electricity-price data.'},
 fda:{name:'openFDA',where:'Research adapter · no voter-facing dataset yet',match:[],note:'Published FDA datasets; current adapter is not a healthcare-price source.'},
 fdic:{name:'FDIC',where:'Research adapter · no voter-facing dataset yet',match:[],note:'Bank institution records.'},
 fec:{name:'Federal Election Commission',where:'Congressional Records · Campaign Money / PAC & Networks',match:['member_finance_detail','political_money','member_finance_collection_health'],note:'Campaign finance, itemized receipts and committee-network filings.'},
 fred:{name:'Federal Reserve Economic Data',where:'Future County Atlas · Jobs & Economy',match:[],note:'Economic time series.'},
 govinfo:{name:'GovInfo',where:'Future Government Action / legislation enrichment',match:[],note:'Official federal publications and documents.'},
 lda:{name:'Senate LDA',where:'Congressional Records · Lobbying',match:[],onDemandLive:true,note:'Official federal LD-1/LD-2 lobbying disclosure filings searched on demand.'},
 lobbyview:{name:'LobbyView',where:'Congressional Records · Lobbying',match:['member_lobby_network','member_lobby_collection_health'],note:'Research-coded lobbying and legislator relationships.'},
 maptiler:{name:'MapTiler',where:'Geocoding utility · no public data panel',match:[],note:'Geocoding support.'},
 noaa:{name:'NOAA NCEI',where:'Future County Atlas · Infrastructure & Environment',match:[],note:'Climate-data catalog.'},
 openstates:{name:'Open States',where:'County Atlas · Representation / Congressional Atlas',match:['openstates'],note:'State legislators and legislation.'},
 regulations:{name:'Regulations.gov',where:'Future Government Action',match:[],note:'Federal rulemaking dockets and documents.'},
 usgs:{name:'USGS Water',where:'Future County Atlas · Infrastructure & Environment',match:[],note:'Water observations.'},
 cfpb:{name:'Consumer Financial Protection Bureau',where:'Future County Atlas · Housing & consumer conditions',match:[],note:'Published consumer complaints; complaints are allegations, not adjudicated wrongdoing.'},
 cms:{name:'CMS',where:'Future County Atlas · Health & Well-Being',match:[],note:'Public Medicare provider-enrollment data.'},
 hmda:{name:'FFIEC / HMDA',where:'Future County Atlas · Housing',match:[],note:'County mortgage-application aggregations.'},
 federalregister:{name:'Federal Register',where:'Future Government Action',match:[],note:'Official federal notices and rules.'},
 sec:{name:'SEC EDGAR',where:'Future influence/company research',match:[],note:'Public company filings; not a political-donation source.'},
 usaspending:{name:'USAspending',where:'County Atlas · Federal Money',match:['usaspending_county'],note:'Federal prime-award obligations by county place of performance.'},
 epa_aqs:{name:'EPA AQS',where:'Future County Atlas · Infrastructure & Environment',match:[],note:'Validated historical air-monitor summaries.'},
 fcc_broadband:{name:'FCC Broadband Data Collection',where:'Future County Atlas · Infrastructure',match:[],note:'Broadband availability release metadata.'}
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
  health.find(row=>provider.id==='lobbyview'&&row.source==='member_lobby_collection_health');
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
async function load(){
 const status=document.getElementById('sourceStatus');
 try{
  const [catalogRes,healthRes,spendingRes]=await Promise.all([
   fetch(GATEWAY+'/api/catalog',{headers:{Accept:'application/json'},credentials:'omit'}),
   fetch(READER+'/api/data-health',{headers:{Accept:'application/json'},credentials:'omit'}),
   fetch('assets/data/county/usaspending.json',{headers:{Accept:'application/json'},credentials:'same-origin',cache:'no-cache'})
  ]);
  const catalog=catalogRes.ok?await catalogRes.json():{providers:[]};
  const health=healthRes.ok?await healthRes.json():{datasets:[],collectionHealth:[]};
  const spending=spendingRes.ok?await spendingRes.json():null;
  if(spending?.source==='USAspending.gov'&&Number(spending.count)>0){
   health.datasets=(health.datasets||[]).concat([{
    source:'usaspending_county',refreshedAt:spending.retrievedAt||null,
    records:Number(spending.count)||0,snapshots:1,database:'static'
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
load();

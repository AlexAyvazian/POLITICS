import {COUNTRIES} from './foreign-world-catalog.js';
import {CONTINENTS,continentBySlug,flagAsset} from './foreign-agents-model.mjs';

const $=id=>document.getElementById(id);
const byIso=new Map(COUNTRIES.filter(c=>c.iso2).map(c=>[c.iso2,c]));
let summary=null;
let currentContinent=null;
let currentCountry=null;
let countryData=null;

const esc=value=>String(value??'');
const number=value=>Number.isFinite(Number(value))?Number(value).toLocaleString('en-US'):'—';

function setView(view){
 $('continentStage').hidden=view!=='continents';
 $('countryStage').hidden=view!=='countries';
 $('agentStage').hidden=view!=='agents';
}
function countryRecord(iso){
 return summary?.countries?.[iso]||{agents:0,activeAgents:0};
}
function continentAgentCount(continent){
 return continent.countries.reduce((sum,iso)=>sum+Number(countryRecord(iso).agents||0),0);
}
function make(tag,className='',text=''){
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(text!==undefined&&text!==null)node.textContent=String(text);
 return node;
}
function pushHash(hash){
 history.replaceState(null,'',hash);
}
function renderContinents(){
 const grid=$('continentGrid');grid.replaceChildren();
 for(const continent of CONTINENTS){
  const button=make('button','continentButton');button.type='button';
  button.style.setProperty('--continent-glow',continent.glow);
  button.setAttribute('aria-label','Open '+continent.name+' country directory');
  const img=document.createElement('img');img.className='continentMap';img.src=continent.asset;img.alt='';
  const name=make('span','continentName',continent.name);
  const count=make('span','continentCount',summary?number(continentAgentCount(continent))+' indexed country relationships':'');
  button.append(img,name,count);
  button.addEventListener('click',()=>showContinent(continent.slug));
  grid.append(button);
 }
}
function showContinent(slug,updateHash=true){
 const continent=continentBySlug(slug);if(!continent)return;
 currentContinent=continent;currentCountry=null;countryData=null;
 $('countryStageKicker').textContent=continent.name.toUpperCase();
 $('countryStageTitle').textContent=continent.name;
 $('countryStageMeta').textContent='Choose a country to see individual DOJ FARA Short Form registrants.';
 const countries=continent.countries.map(iso=>byIso.get(iso)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
 const grid=$('countryGrid');grid.replaceChildren();
 for(const country of countries){
  const stats=countryRecord(country.iso2);
  const button=make('button','countryButton');button.type='button';
  button.setAttribute('aria-label','Open '+country.name+' foreign-agent directory');
  const flag=make('span','flag');flag.setAttribute('aria-hidden','true');
  const flagImg=document.createElement('img');flagImg.src=flagAsset(country.iso2);flagImg.alt='';flagImg.loading='lazy';flag.append(flagImg);
  const text=make('span');text.append(make('strong','',country.name),make('small','',stats.activeAgents?number(stats.activeAgents)+' active':'DOJ FARA'));
  const count=make('span','count',stats.agents?number(stats.agents)+' people':'');
  button.append(flag,text,count);
  button.addEventListener('click',()=>showCountry(country.iso2));
  grid.append(button);
 }
 setView('countries');
 if(updateHash)pushHash('#/continent/'+encodeURIComponent(slug));
 window.scrollTo({top:0,behavior:'smooth'});
}
function agentMatches(agent,needle){
 if(!needle)return true;
 return [agent.name,agent.registrantName,agent.registrationNumber,agent.city,agent.state,agent.status]
  .some(value=>String(value||'').toLowerCase().includes(needle));
}
function renderAgents(){
 const root=$('agentDirectory');root.replaceChildren();
 const needle=String($('agentSearch').value||'').trim().toLowerCase();
 const agents=(countryData?.agents||[]).filter(row=>agentMatches(row,needle));
 if(!agents.length){
  root.append(make('div','emptyState',countryData?.agents?.length?'No people match this search.':'No DOJ Short Form records are indexed for this country in the current snapshot.'));
  return;
 }
 for(const agent of agents){
  const row=make('article','agentRow');
  const identity=make('div','agentIdentity');
  identity.append(make('strong','',agent.name||'Name not listed'),make('small','',agent.registrantName||'Registrant not listed'));
  const filing=make('div','agentIdentity');
  filing.append(make('span','',agent.shortFormDate?'Short Form '+agent.shortFormDate:'Short Form date unavailable'),
    make('small','',agent.terminatedAt?'Terminated '+agent.terminatedAt:'Registration #'+esc(agent.registrationNumber)));
  const status=make('span','agentStatus '+(agent.status==='active'?'active':'terminated'),agent.status==='active'?'Active':'Terminated');
  const source=make('div');
  if(agent.documentUrl){
   const link=make('a','','DOJ Short Form ↗');link.href=agent.documentUrl;link.target='_blank';link.rel='noopener noreferrer';source.append(link);
  }else{
   const link=make('a','','DOJ filings ↗');link.href='https://efile.fara.gov/ords/fara/f?p=1235:010::::::';link.target='_blank';link.rel='noopener noreferrer';source.append(link);
  }
  row.append(identity,filing,status,source);root.append(row);
 }
}
async function showCountry(iso,updateHash=true){
 const country=byIso.get(iso);if(!country||!currentContinent)return;
 currentCountry=country;
 const flagRoot=$('agentCountryFlag');flagRoot.replaceChildren();
 const flagImg=document.createElement('img');flagImg.src=flagAsset(iso);flagImg.alt='';flagRoot.append(flagImg);
 $('agentStageTitle').textContent=country.name;
 $('agentStageMeta').textContent='Loading official DOJ FARA Short Form records…';
 $('agentSearch').value='';
 $('agentDirectory').replaceChildren(make('div','emptyState','Loading individual registrations…'));
 setView('agents');
 if(updateHash)pushHash('#/country/'+encodeURIComponent(iso)+'?from='+encodeURIComponent(currentContinent.slug));
 window.scrollTo({top:0,behavior:'smooth'});
 try{
  const response=await fetch('assets/data/foreign-agents/countries/'+encodeURIComponent(iso)+'.json',{cache:'no-cache'});
  if(response.status===404){
   countryData={countryCode:iso,countryName:country.name,agents:[],agentRecords:0,activeAgents:0};
  }else{
   if(!response.ok)throw Error('HTTP '+response.status);
   countryData=await response.json();
  }
  if(currentCountry?.iso2!==iso)return;
  $('agentStageMeta').textContent=number(countryData.agentRecords||0)+' indexed Short Form record'+(Number(countryData.agentRecords||0)===1?'':'s')+
   ' · '+number(countryData.activeAgents||0)+' active';
  renderAgents();
 }catch(error){
  if(currentCountry?.iso2!==iso)return;
  $('agentStageMeta').textContent='DOJ snapshot unavailable';
  $('agentDirectory').replaceChildren(make('div','emptyState','The current Foreign Agents snapshot could not be loaded.'));
 }
}
function route(){
 const hash=decodeURIComponent(location.hash||'');
 const countryMatch=/^#\/country\/([A-Z]{2})(?:\?from=([a-z-]+))?$/.exec(hash);
 if(countryMatch){
  const from=continentBySlug(countryMatch[2]||'')||CONTINENTS.find(c=>c.countries.includes(countryMatch[1]));
  if(from){currentContinent=from;showCountry(countryMatch[1],false);return;}
 }
 const continentMatch=/^#\/continent\/([a-z-]+)$/.exec(hash);
 if(continentMatch&&continentBySlug(continentMatch[1])){showContinent(continentMatch[1],false);return;}
 setView('continents');pushHash('#/continents');
}
async function loadSummary(){
 try{
  const response=await fetch('assets/data/foreign-agents/latest.json',{cache:'no-cache'});
  if(response.ok)summary=await response.json();
 }catch(_){}
 $('statAgents').textContent=summary?number(summary.uniqueShortForms||summary.totalAgentRecords):'Pending';
 $('statCountries').textContent=summary?number(summary.countryCount):'Pending';
 renderContinents();
}
function init(){
 $('backToContinents').addEventListener('click',()=>{currentContinent=null;currentCountry=null;setView('continents');pushHash('#/continents');window.scrollTo({top:0,behavior:'smooth'});});
 $('backToCountries').addEventListener('click',()=>showContinent(currentContinent?.slug||'north-america'));
 $('agentSearch').addEventListener('input',renderAgents);
 window.addEventListener('popstate',route);
 loadSummary().finally(route);
}
init();

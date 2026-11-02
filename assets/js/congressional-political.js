/* Congressional Atlas political data: read-only cached federal D1 and public
 * static nightly state rosters. Fill colors mean verified CURRENT incumbency,
 * not election outcomes or forecasts. No provider API-key call on a map click.
 */
(function(){
'use strict';
const READER='https://politics-daily-snapshot.alxayvazian.workers.dev';
const panel=document.getElementById('politicalDetails');
const model=window.CONGRESSIONAL_POLITICAL_MODEL;
const NCSL=window.POLITICS_NCSL,governors=window.GOVERNORS_2026,atlas=window.POLITICS_CONGRESSIONAL_ATLAS,vacancies=window.POLITICS_VERIFIED_VACANCIES;
if(!panel||!model)return;
const stateCache=new Map();
/* Party classes are categorical current incumbency, never vote predictions.
 * A missing or partial legislative roster leaves unmatched districts neutral. */
function resolveParty({layer,state,scope,district}){
 if(!state)return 'unknown';
 const vacancy=scope==='district'?model.verifiedVacancy(vacancies,{layer,state,district}):null;
 let incumbentParty='unknown';
 if(layer==='house')incumbentParty=scope==='district'?model.houseParty(federal,state,district):'unknown';
 else if(layer==='stateSenate'||layer==='stateHouse')
  incumbentParty=scope==='district'?model.stateDistrictParty(stateData.get(state),layer,district):
   model.chamberMajority(NCSL?.states?.[state],layer);
 else if(layer==='senate')incumbentParty=model.senateParty(federal,state);
 else if(layer==='governor')incumbentParty=model.partyClass(NCSL?.states?.[state]?.governor);
 else if(layer==='president')incumbentParty=model.partyClass('Republican');
 return model.districtPartyWithVacancies(incumbentParty,vacancy);
}
function repaint(){atlas?.setPartyResolver?.(resolveParty);}

let federal=null,federalStatus='loading',current=null,renderSeq=0;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const party=x=>({D:'Democratic',R:'Republican',S:'Divided',Nonpartisan:'Nonpartisan','N/A':'Not applicable'}[x]||x||'Not reported');
const link=(url,label)=>'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>';
const note=x=>'<p class="atlasPoliticalNote">'+x+'</p>';
const heading=x=>'<h3 class="atlasPoliticalHeading">'+esc(x)+'</h3>';
const row=(label,value)=>'<div class="atlasPoliticalRow"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';
const person=(p,kind)=>{
 const name=esc(p.name||'Unlisted'),partyLabel=esc(p.party||'Party not reported');
 const bioguide=String(p.bioguide||'');
 const url=kind==='federal'&&/^[A-Z][0-9]{6}$/.test(bioguide)?
  'https://bioguide.congress.gov/search/bio/'+bioguide:
  kind==='state'&&/^https:\/\/((www\.)?openstates\.org|open\.pluralpolicy\.com)\//.test(String(p.url||''))?p.url:null;
 const recordLink=kind==='federal'&&/^[A-Z][0-9]{6}$/.test(bioguide)?
   '<a class="atlasViewRecords" href="records.html#member='+encodeURIComponent(bioguide)+'">View voting record &amp; disclosures ↗</a>':'';
 return '<div class="atlasPoliticalPerson"><strong>'+(url?link(url,p.name):name)+'</strong><span>'+partyLabel+'</span>'+recordLink+'</div>';
};
function fetchStored(path){
 return fetch(READER+path,{headers:{Accept:'application/json'},credentials:'omit',signal:AbortSignal.timeout(30000)})
  .then(r=>{if(!r.ok)throw Error('Stored data HTTP '+r.status);return r.json();});
}
const federalTask=fetchStored('/api/congress-snapshot').then(data=>{
 if(!data?.states||!data?.count)throw Error('Congressional roster not collected');
 federal=data;federalStatus='ready';repaint();
}).catch(()=>{federalStatus='unavailable';repaint();});
/* Read each current roster from our own nightly static cache.
 * This is a one-time same-origin file read per visitor/state, not a provider
 * API-key call. Older D1 samples remain a safe fallback only. */
function openStates(state){
 if(!stateCache.has(state)){
  const local='assets/data/legislators/'+state.toLowerCase()+'.json';
  const task=fetch(local,{credentials:'same-origin',cache:'default',headers:{Accept:'application/json'},
   signal:AbortSignal.timeout(15000)})
   .then(r=>{if(!r.ok)throw Error('Roster cache HTTP '+r.status);return r.json();})
   .then(data=>{
    if(data?.state!==state||!Array.isArray(data.people)||data.people.length<10)throw Error('Incomplete roster');
    return data;
   })
   .catch(()=>fetchStored('/api/openstates-snapshot?state='+encodeURIComponent(state))
    .then(data=>data?.state===state&&Array.isArray(data.people)?data:null).catch(()=>null));
  stateCache.set(state,task);
 }
 return stateCache.get(state);
}
function render(){
 const s=current;if(!s?.state){panel.innerHTML='';return;}
 const state=s.state,scope=s.scope,layer=s.layer;
 const vacancy=scope==='district'?model.verifiedVacancy(vacancies,s):null;
 const verifiedVacancyNote=()=>note('<strong>Vacant — no current officeholder.</strong> '+esc(vacancy.detail)+' Verified vacancy · '+esc(vacancies.asOf)+' · '+link(vacancy.sourceUrl,vacancy.sourceName)+'.');
 const ns=NCSL?.states?.[state],gv=governors?.states?.[state];
 const chunks=[];
 // Countrywide presidential incumbents are independently verified on USAGov.
 if(layer==='president'){
  chunks.push(heading('Federal executive branch'));
  chunks.push(person({name:'Donald J. Trump',party:'Republican'}));
  chunks.push(row('Vice President','JD Vance · Republican'));
  chunks.push(note('As of 11/01/2026 · '+link('https://www.usa.gov/presidents','USAGov current officeholders')));
 }else{
  if(ns){
   chunks.push(heading('State political control'));
   chunks.push(row('Governor',party(ns.governor)));
   chunks.push(row('State legislature',party(ns.legislature)));
   chunks.push(row('Overall state control',party(ns.stateControl)));
   if(layer==='stateSenate'||scope==='state'||layer==='governor'||layer==='senate')
    chunks.push(row(state==='NE'?'Unicameral chamber':'State Senate',
     'D '+ns.senate.dem+' · R '+ns.senate.rep+(ns.senate.other?' · Other '+ns.senate.other:'')+(ns.senate.vacant?' · Vacant '+ns.senate.vacant:'')));
   if(state!=='NE'&&(layer==='stateHouse'||scope==='state'||layer==='governor'||layer==='senate'))
    chunks.push(row('State House','D '+ns.house.dem+' · R '+ns.house.rep+
     (ns.house.other?' · Other '+ns.house.other:'')+(ns.house.vacant?' · Vacant '+ns.house.vacant:'')));
   chunks.push(note('NCSL seat counts · 10/06/2026 · '+link(NCSL.sourceUrl,'source')+
    '. These are statewide totals, not individual-district results.'));
  }else if(state==='DC'){
   chunks.push(note('D.C. is not a state and has no governor or state legislature. Its elected council is not represented by these state legislative layers.'));
  }
  if(layer==='governor'||scope==='state'){
   if(gv){chunks.push(heading('Governor'));chunks.push(person({name:gv,party:ns?party(ns.governor):'Party not reported'}));
    chunks.push(note('NGA roster · '+esc(governors.asOf)+' · '+link(governors.sourceUrl,'source')));}
  }
  if(layer==='house'){
   if(scope==='district'){
    chunks.push(heading(state==='DC'?'Current U.S. delegate':'Current U.S. representative'));
    const people=model.house(federal,state,s.district);
    if(federalStatus==='loading')chunks.push(note('Loading the stored congressional roster…'));
    else if(federalStatus==='unavailable')chunks.push(note('The stored congressional roster is temporarily unavailable.'));
    else if(!people.length&&vacancy)chunks.push(verifiedVacancyNote());
    else if(!people.length)chunks.push(note('No matching current member in the stored roster; this does not establish a vacancy.'));
    else chunks.push(...people.map(p=>person(p,'federal')));
   }else chunks.push(note('Choose a U.S. House district to see its current representative.'));
  }
  if(layer==='senate'||scope==='state'){
   chunks.push(heading('U.S. senators'));
   if(state==='DC')chunks.push(note('Washington, D.C. has no voting U.S. senators.'));
   else if(federalStatus==='loading')chunks.push(note('Loading stored Senate records…'));
   else if(federalStatus==='unavailable')chunks.push(note('Stored Senate roster temporarily unavailable.'));
   else {
    const senators=model.senators(federal,state);
    chunks.push(...(senators.length?senators.map(p=>person(p,'federal')):[note('No matching senators in the stored roster; verify before assuming a vacancy.')]));
   }
  }
  if((layer==='stateHouse'||layer==='stateSenate')&&scope==='district'){
   chunks.push(heading(layer==='stateSenate'?'State senator':'State representative'));
   if(s.state==='NE'&&layer==='stateSenate')chunks.push(note('Nebraska legislators serve in a nonpartisan unicameral legislature.'));
   const data=stateData.get(state);
   if(!data)chunks.push(note(statePending.has(state)?'Loading cached state legislative records…':'Individual state legislator records are not yet available for this state.'));
   else{
    const people=model.stateMembers(data,layer,s.district);
    chunks.push(...people.map(p=>person(p,'state')));
    if(!people.length&&vacancy)chunks.push(verifiedVacancyNote());
    else if(!people.length)chunks.push(note('No matching legislator in the available roster; this is not evidence that the seat is vacant.'));
    if(model.stateCompleteness(data)==='partial')chunks.push(note(
     'Partial roster: '+data.people.length+' of '+(Number.isInteger(data.totalPeople)?data.totalPeople:'unknown')+
     ' reported records. Some districts are not yet represented here.'));
    chunks.push(note(esc(data.source||'Open States / Plural')+' · '+esc(data.retrievedAt?.slice(0,10)||'date unavailable')+
     ' · '+link(data.sourceUrl||'https://open.pluralpolicy.com/data/legislator-csv/','source')+
     '. Source roster reflects current officeholder records, not an election prediction.'));
   }
  }
  if(federalStatus==='ready'&&(layer==='house'||layer==='senate'||scope==='state'))
   chunks.push(note('Federal member snapshot · '+esc(federal.asOf||federal.retrievedAt?.slice(0,10)||'date not reported')+
    ' · '+link('https://github.com/unitedstates/congress-legislators','source')+
    '. This is an incumbency roster, not a 2026 election forecast.'));
 }
 panel.innerHTML=chunks.join('');
}
const stateData=new Map(),statePending=new Set();
async function onSelection(selection){
 current=selection;const seq=++renderSeq;
 if(!selection?.state){render();return;}
 render();
 if(federalStatus==='loading'){
  federalTask.then(()=>{if(seq===renderSeq)render();});
 }
 if(['stateSenate','stateHouse'].includes(selection.layer)&&
    !stateData.has(selection.state)&&!statePending.has(selection.state)){
  const key=selection.state;statePending.add(key);render();
  const result=await openStates(key);
  statePending.delete(key);
  if(result)stateData.set(key,result);
  repaint();
  if(seq===renderSeq)render();
 }
}
window.addEventListener('congressional-atlas:selection',e=>{onSelection(e.detail);});
repaint();
const initial=window.POLITICS_CONGRESSIONAL_ATLAS?.getSelection?.();
if(initial)onSelection(initial);
window.POLITICS_CONGRESSIONAL_POLITICAL=Object.freeze({getFederalStatus:()=>federalStatus});
})();

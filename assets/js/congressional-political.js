/* Congressional Atlas political data: read-only cached federal D1 and public
 * static nightly state rosters. Legislative district fills mean verified current
 * incumbency; President/Governor/U.S. Senate geographic fills are sourced election
 * outcomes handled by congressional-map.js. Alaska statewide races use House districts. No provider API-key call on a map click.
 */
(function(){
'use strict';
const READER='https://politics-daily-snapshot.alxayvazian.workers.dev';
const panel=document.getElementById('politicalDetails');
const model=window.CONGRESSIONAL_POLITICAL_MODEL;
const NCSL=window.POLITICS_NCSL,governors=window.GOVERNORS_2026,atlas=window.POLITICS_CONGRESSIONAL_ATLAS,vacancies=window.POLITICS_VERIFIED_VACANCIES,ELECTION=window.US_2026_ELECTION_RESULTS;
if(!panel||!model)return;
const stateCache=new Map();
/* The community congress-legislators roster currently omits these 2025
 * appointees. Official U.S. Senate state pages verify both as serving in the
 * 119th Congress. Use only as a narrow fallback when the stored roster has
 * fewer than two senators for the matching state. */
const VERIFIED_CURRENT_SENATORS=Object.freeze({
 OH:Object.freeze({name:'Jon Husted',party:'Republican',url:'https://www.senate.gov/states/OH/intro.htm',verifiedAt:'2026-11-19',end:'2027-01-03'}),
 FL:Object.freeze({name:'Ashley Moody',party:'Republican',url:'https://www.senate.gov/states/FL/intro.htm',verifiedAt:'2026-11-19',end:'2027-01-03'})
});
function currentSenators(state){
 const people=model.senators(federal,state);
 const fallback=VERIFIED_CURRENT_SENATORS[state];
 if(!fallback||people.length>=2||people.some(person=>person.name===fallback.name))return people;
 return [...people,fallback].slice(0,2);
}
function currentSenateParty(state){
 const people=currentSenators(state);
 if(people.length!==2)return 'unknown';
 const parties=people.map(person=>model.partyClass(person.party));
 if(parties.includes('unknown'))return 'unknown';
 return new Set(parties).size===1?parties[0]:'split';
}
function electionPartyLabel(value){
 return value==='democratic'?'Democratic':value==='republican'?'Republican':value==='other'?'Other':'Party not reported';
}
function houseElectionResult(state,district){
 const key=String(Number(district)).padStart(2,'0');
 return ELECTION?.house?.[state]?.[key]||ELECTION?.house?.[state]?.[String(district)]||null;
}
function incomingSenators(state){
 const current=currentSenators(state);
 const race=ELECTION?.senate?.[state];
 if(!race||!race.winner||race.resultState==='unresolved')return current;
 const holdovers=current.filter(person=>String(person.end||'')!=='2027-01-03');
 const elected={name:race.winner,party:electionPartyLabel(race.party),elected:true,resultState:race.resultState,pageUrl:race.pageUrl};
 const combined=[...holdovers,elected];
 const seen=new Set();
 return combined.filter(person=>{
  const key=String(person.name||'').toLowerCase();
  if(!key||seen.has(key))return false;
  seen.add(key);return true;
 }).slice(0,2);
}
function incomingSenateParty(state){
 const people=incomingSenators(state);
 if(people.length!==2)return 'unknown';
 const parties=people.map(person=>model.partyClass(person.party));
 if(parties.includes('unknown'))return 'unknown';
 return new Set(parties).size===1?parties[0]:'split';
}
/* Party classes are categorical current incumbency, never vote predictions.
 * A missing or partial legislative roster leaves unmatched districts neutral. */
function resolveParty({layer,state,scope,district}){
 if(!state)return 'unknown';
 const vacancy=scope==='district'?model.verifiedVacancy(vacancies,{layer,state,district}):null;
 let incumbentParty='unknown';
 if(layer==='house'&&scope==='district')
  incumbentParty=houseElectionResult(state,district)?.party||'unknown';
 else if(layer==='stateSenate'||layer==='stateHouse')
  incumbentParty=scope==='district'?model.stateDistrictParty(stateData.get(state),layer,district):
   model.chamberMajority(NCSL?.states?.[state],layer);
 else if(layer==='governor'&&scope==='state')
  incumbentParty=ELECTION?.governor?.[state]?.party||model.partyClass(NCSL?.states?.[state]?.governor);
 else if(layer==='senate'&&scope==='state')
  incumbentParty=incomingSenateParty(state);
 // State drill-downs are still colored by election winners in congressional-map.js.
 // These statewide values are only for the national U.S. overview.
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
 const explicitFederal=/^https:\/\/www\.senate\.gov\/states\/[A-Z]{2}\/intro\.htm$/.test(String(p.url||''))?p.url:null;
 const url=kind==='federal'&&/^[A-Z][0-9]{6}$/.test(bioguide)?
  'https://bioguide.congress.gov/search/bio/'+bioguide:
  kind==='federal'&&explicitFederal?explicitFederal:
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
 if(scope==='county'||scope==='electionDistrict'){
  const unit=scope==='electionDistrict'?'House district':'County';
  chunks.push(heading(unit+' result'));
  const result=s.electionResult;
  if(result){
   chunks.push(row('Winner',(result.winner||'Unreported')+' · '+party(result.party==='democratic'?'D':result.party==='republican'?'R':result.party)));
   if(Number.isFinite(result.winnerPct))chunks.push(row(result.winner,result.winnerPct.toFixed(1)+'%'));
   if(result.runner&&Number.isFinite(result.runnerPct))chunks.push(row(result.runner,result.runnerPct.toFixed(1)+'%'));
   if(result.demName)chunks.push(row(result.demName,Number.isFinite(result.demPct)?result.demPct.toFixed(1)+'%':'Democratic'));
   if(result.repName)chunks.push(row(result.repName,Number.isFinite(result.repPct)?result.repPct.toFixed(1)+'%':'Republican'));
   if(Number.isFinite(result.marginPts)&&!Number.isFinite(result.winnerPct))chunks.push(row('Winning margin',result.marginPts.toFixed(1)+' points'));
   const statusLabel=s.electionStatus==='certified'?'Certified result':s.electionStatus==='unofficial'?'Current unofficial result':'Result status unavailable';
   chunks.push(note(statusLabel+' · '+esc(s.electionDate||'date unavailable')+
    (s.sourceUrl?' · '+link(s.sourceUrl,'election source'):'')+'.'));
  }else{
   chunks.push(note(unit+' result is not available in the loaded election dataset for this state.'));
  }
 }
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
  if(layer==='governor'){
   const race=ELECTION?.governor?.[state];
   if(race){
    chunks.push(heading('2026 election · Governor'));
    chunks.push(row(race.resultState==='won'?'Winner':'Leader',race.winner+' · '+electionPartyLabel(race.party)));
    if(Number.isFinite(race.winnerPct))chunks.push(row('Vote share',race.winnerPct.toFixed(1)+'%'));
    chunks.push(note((race.resultState==='won'?'Called/certified election result':'Current count; race not yet called')+
     ' · '+link(race.pageUrl||race.sourceUrl||ELECTION.sourceUrl,'2026 election source')+'.'));
   }else chunks.push(note('No governor election is listed for this state in the 2026 general election.'));
   if(gv){chunks.push(heading('Current governor'));chunks.push(person({name:gv,party:ns?party(ns.governor):'Party not reported'}));
    chunks.push(note('Current officeholder until the new term begins · NGA roster · '+esc(governors.asOf)+' · '+link(governors.sourceUrl,'source')));}
  }else if(scope==='state'&&gv){
   chunks.push(heading('Governor'));chunks.push(person({name:gv,party:ns?party(ns.governor):'Party not reported'}));
  }
  if(layer==='house'){
   if(scope==='district'){
    const result=s.electionResult||houseElectionResult(state,s.district);
    chunks.push(heading('2026 election · 120th Congress'));
    if(result){
     chunks.push(row(result.resultState==='won'?'2026 winner':'Current leader',result.winner+' · '+electionPartyLabel(result.party)));
     if(Number.isFinite(result.winnerPct))chunks.push(row('Vote share',result.winnerPct.toFixed(1)+'%'));
     if(result.runner&&Number.isFinite(result.runnerPct))chunks.push(row(result.runner,result.runnerPct.toFixed(1)+'%'));
     chunks.push(note((result.resultState==='won'?'Race called/certified':'Race still counting')+
      ' · '+link(result.pageUrl||result.sourceUrl||ELECTION?.sourceUrl,'2026 election source')+'.'));
     if(result.resultState==='won')chunks.push(note('Member-elect for the 120th Congress. Takes office Jan. 3, 2027.'));
    }else chunks.push(note('No 2026 House result is loaded for this district.'));
    chunks.push(note('This map uses the 120th Congress district lines. It does not map the sitting 119th representative onto redrawn 2026 geography.'));
   }else chunks.push(note('Choose a U.S. House district to see its 2026 election result for the incoming 120th Congress.'));
  }
  if(layer==='senate'){
   if(state==='DC')chunks.push(note('Washington, D.C. has no voting U.S. senators.'));
   else {
    const race=ELECTION?.senate?.[state];
    if(race){
     chunks.push(heading('2026 election · 120th Congress'));
     chunks.push(row(race.resultState==='won'?'Winner':'Current leader',race.winner+' · '+electionPartyLabel(race.party)));
     if(Number.isFinite(race.winnerPct))chunks.push(row('Vote share',race.winnerPct.toFixed(1)+'%'));
     chunks.push(note((race.resultState==='won'?'Race called/certified':'Race still counting')+
      ' · '+link(race.pageUrl||race.sourceUrl||ELECTION?.sourceUrl,'2026 election source')+'.'));
    }else chunks.push(note('No U.S. Senate election is listed for this state in 2026.'));
    if(federalStatus==='loading')chunks.push(note('Loading stored Senate records…'));
    else if(federalStatus==='unavailable')chunks.push(note('Stored Senate roster temporarily unavailable.'));
    else{
     chunks.push(heading('Incoming Senate delegation'));
     const incoming=incomingSenators(state);
     chunks.push(...(incoming.length?incoming.map(p=>person(p,p.elected?'election':'federal')):[note('Incoming delegation unavailable.')]));
     chunks.push(note('2026 winners take office with the 120th Congress on Jan. 3, 2027.'));
     chunks.push(heading('Current senators · 119th Congress'));
     chunks.push(...currentSenators(state).map(p=>person(p,'federal')));
    }
   }
  }else if(scope==='state'){
   chunks.push(heading('U.S. senators'));
   if(state==='DC')chunks.push(note('Washington, D.C. has no voting U.S. senators.'));
   else if(federalStatus==='ready')chunks.push(...currentSenators(state).map(p=>person(p,'federal')));
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
  if(federalStatus==='ready'&&(layer==='senate'||scope==='state'))
   chunks.push(note('Current 119th Congress roster · '+esc(federal.asOf||federal.retrievedAt?.slice(0,10)||'date not reported')+
    ' · '+link('https://github.com/unitedstates/congress-legislators','source')+
    '. Election winners are shown separately above.'));
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

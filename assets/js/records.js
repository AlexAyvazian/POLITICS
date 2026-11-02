/* Public congressional record explorer.
 * All official roll call provider traffic occurs only in scheduled GitHub jobs.
 * The website reads published JSON and the pre-existing cached member roster.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const model=window.POLITICS_RECORDS_MODEL;
const reader='https://politics-daily-snapshot.alxayvazian.workers.dev/api/congress-snapshot';
const rosterStatus=$('directoryStatus'),stateGrid=$('stateGrid');
const state={members:[],member:null,votes:[],voteData:null,rosterDate:null,selectedState:null};
const states=model.states(window.GEO_STATES||[]);
const stateByCode=Object.fromEntries(states.map(item=>[item.abbr,item]));
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cleanName=n=>String(n||'').replace(/[^\p{L}\p{N} .'-]/gu,' ').trim();
const external=(url,label)=>'<a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">'+esc(label)+' ↗</a>';
const formatDate=d=>{if(!d)return 'Date not supplied';const dt=new Date(d);return Number.isNaN(dt.valueOf())?String(d):dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});};
const chamberSource=member=>member.chamber==='House'?'U.S. House Clerk':'U.S. Senate';
function renderStateDirectory(){
 stateGrid.replaceChildren();
 for(const item of states){
  const btn=document.createElement('button');
  btn.type='button';btn.className='recordsStateCard';
  btn.setAttribute('aria-label','Browse '+item.name+' congressional delegation');
  const abbreviation=document.createElement('span');
  abbreviation.className='recordsStateAbbr';abbreviation.textContent=item.abbr;
  const name=document.createElement('strong');
  name.textContent=item.name;
  btn.append(abbreviation,name);
  btn.addEventListener('click',()=>showState(item.abbr,true));
  stateGrid.append(btn);
 }
 rosterStatus.textContent=state.members.length?
   'Select a state to see its current senators and representatives.':'Loading the current congressional delegation directory…';
}
function memberCard(m){
 const btn=document.createElement('button');
 btn.type='button';btn.className='recordsMemberCard';
 btn.setAttribute('aria-current',String(state.member?.bioguide===m.bioguide));
 const district=document.createElement('span');
 district.className='recordsMemberDistrict';
 district.textContent=m.chamber==='Senate'?'U.S. SENATE':
  m.state==='DC'?'AT-LARGE DELEGATE':
  Number(m.district)===0?'AT-LARGE DISTRICT':'DISTRICT '+m.district;
 const name=document.createElement('strong');name.textContent=m.name;
 const party=document.createElement('span');party.className='recordsMemberParty';
 party.textContent=m.party||'Party not reported';
 btn.append(district,name,party);
 btn.addEventListener('click',()=>select(m.bioguide));
 return btn;
}
function renderDelegation(){
 const abbr=state.selectedState;
 const item=stateByCode[abbr];
 if(!item)return;
 const delegation=model.delegation(state.members,abbr);
 $('delegationTitle').textContent=item.name;
 $('delegationIntro').textContent=delegation.house.length+' House member'+(delegation.house.length===1?'':'s')+
  (abbr==='DC'?' or delegate':'')+' · '+delegation.senate.length+' senator'+(delegation.senate.length===1?'':'s');
 $('senateCount').textContent=String(delegation.senate.length)+' listed';
 $('houseCount').textContent=String(delegation.house.length)+' listed';
 $('houseHeading').textContent=abbr==='DC'?'U.S. Delegate':'U.S. Representatives';
 const senate=$('senateMembers'),house=$('houseMembers');
 senate.replaceChildren();house.replaceChildren();
 for(const member of delegation.senate)senate.append(memberCard(member));
 for(const member of delegation.house)house.append(memberCard(member));
 if(!delegation.senate.length){
  const msg=document.createElement('p');msg.className='recordsStatus';
  msg.textContent=abbr==='DC'?'Washington, D.C. does not elect voting U.S. senators.':'No current senators in this directory snapshot.';
  senate.append(msg);
 }
 if(!delegation.house.length){
  const msg=document.createElement('p');msg.className='recordsStatus';
  msg.textContent='No House member in this directory snapshot. A seat may be vacant; no incumbent is inferred.';
  house.append(msg);
 }
}
function showState(code,shouldScroll=false){
 if(!stateByCode[code])return;
 state.selectedState=code;
 $('stateDirectory').hidden=true;
 $('delegationDirectory').hidden=false;
 if(state.member?.state!==code){
  state.member=null;state.votes=[];state.voteData=null;
  $('memberProfile').hidden=true;
  $('recordsStart').hidden=false;
 }
 renderDelegation();
 if(shouldScroll){
  try{history.replaceState(null,'','#state='+encodeURIComponent(code));}catch{}
  $('delegationDirectory').scrollIntoView?.({behavior:'smooth',block:'start'});
 }
}
function showAllStates(){
 state.selectedState=null;state.member=null;state.votes=[];state.voteData=null;
 $('delegationDirectory').hidden=true;
 $('stateDirectory').hidden=false;
 $('memberProfile').hidden=true;
 $('recordsStart').hidden=false;
 try{history.replaceState(null,'',location.pathname+location.search);}catch{}
 $('stateDirectory').scrollIntoView?.({behavior:'smooth',block:'start'});
}
function sourceUrl(v){
 if(typeof v.url==='string'&&/^https:\/\/(clerk\.house\.gov|www\.senate\.gov)\//.test(v.url))return v.url;
 if(state.member?.chamber==='House'&&Number.isInteger(v.year)&&Number.isInteger(v.roll))
  return 'https://clerk.house.gov/Votes/'+v.year+v.roll;
 return 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_'+String(v.roll).padStart(5,'0')+'.htm';
}
function renderVotes(){
 const filtered=model.filterVotes(state.votes,$('votesQuery').value);
 const list=$('memberVotes');list.replaceChildren();
 for(const v of filtered.slice(0,160)){
  const card=document.createElement('div');card.className='recordsVoteRow';
  const cast=document.createElement('span');cast.className='recordsCast '+(v.cast==='Yea'?'Yea':v.cast==='Nay'?'Nay':'');cast.textContent=v.cast;
  const body=document.createElement('div');body.className='recordsVoteText';
  const title=document.createElement('strong');title.textContent=(v.measure?v.measure+' · ':'')+(v.question||'Recorded roll call');
  const foot=document.createElement('small');foot.textContent=formatDate(v.date)+' · Roll '+v.roll+' · '+(v.result||'Result not reported');
  body.append(title,foot);
  const link=document.createElement('a');link.href=sourceUrl(v);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Official roll ↗';
  card.append(cast,body,link);list.append(card);
 }
 if(!filtered.length){
  const p=document.createElement('p');p.className='recordsStatus';
  p.textContent=state.votes.length?'No captured votes match this search.':'No individual roll-call votes were found for this member in the available snapshot. This does not establish that they missed votes.';
  list.append(p);
 }
}
function displayFinance(m){
 $('fecMemberLink').href='https://www.fec.gov/data/candidates/?q='+encodeURIComponent(cleanName(m.name));
 const disclosure=$('disclosureList');
 disclosure.replaceChildren();
 const sources=m.chamber==='House'?[
  ['House gift travel filings','https://disclosures-clerk.house.gov/GiftTravelFilings'],
  ['House official foreign travel','https://disclosures-clerk.house.gov/ForeignTravel'],
  ['House personal financial reports','https://disclosures-clerk.house.gov/FinancialDisclosure']
 ]:[
  ['Senate ethics disclosures','https://www.ethics.senate.gov/public/'],
  ['Senate member office','https://www.senate.gov/senators/']
 ];
 for(const [label,url] of sources){
  const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label+' ↗';
  disclosure.append(a);
 }
 $('congressMemberLink').href='https://www.congress.gov/member?q='+encodeURIComponent(cleanName(m.name));
}
async function loadVotes(m){
 const chamber=m.chamber.toLowerCase();
 const marker=m.bioguide;
 $('voteStatus').textContent='Loading captured '+m.chamber+' roll calls…';
 $('voteSummary').hidden=true;$('memberVotes').replaceChildren();
 let data;
 try{
  const r=await fetch('assets/data/records/members/'+encodeURIComponent(marker)+'.json',{credentials:'same-origin',cache:'default'});
  if(!r.ok)throw Error('No published '+m.chamber+' roll-call snapshot');
  data=await r.json();
  if(data.bioguide!==marker||data.chamber!==m.chamber||!Array.isArray(data.votes)||!data.votes.length)
   throw Error('No validated member vote data available');
 }catch(_){
  if(state.member?.bioguide!==marker)return;
  state.voteData=null;state.votes=[];
  $('voteStatus').textContent='Official vote data has not been published in our cache yet. Open the official '+chamberSource(m)+' roll-call archive below.';
  const link=document.createElement('a');link.href=m.chamber==='House'?'https://clerk.house.gov/Votes':'https://www.senate.gov/votes/';
  link.textContent='Browse '+chamberSource(m)+' votes ↗';link.target='_blank';link.rel='noopener noreferrer';
  $('memberVotes').replaceChildren(link);return;
 }
 if(state.member?.bioguide!==marker)return;
 state.voteData=data;state.votes=model.memberVotes(data,m);
 const counts=model.countVotes(state.votes);
 $('votePeriod').textContent=String(data.congress||119)+'th Congress · '+data.votes.length+' recorded member votes';
 $('voteStatus').textContent=state.votes.length+' recorded votes · Voteview (UCLA), data through '+formatDate(data.asOf)+'.';
 const sum=$('voteSummary');sum.hidden=false;sum.innerHTML=Object.entries(counts).map(([label,n])=>
  '<div><strong>'+n+'</strong><span>'+esc(label)+'</span></div>').join('');
 renderVotes();
}
function select(id){
 const m=model.getMember(state.members,id);if(!m)return;
 state.member=m;state.votes=[];state.voteData=null;
 $('recordsStart').hidden=true;$('memberProfile').hidden=false;
 $('profileName').textContent=m.name;
 $('profileChamber').textContent=m.chamber==='House'?'U.S. House of Representatives':'U.S. Senate';
 $('profileInfo').textContent=(m.chamber==='House'?m.state+' · District '+(m.district===0?'At-large':m.district):m.state+' · U.S. Senate')+' · '+m.party;
 $('profileBio').href='https://bioguide.congress.gov/search/bio/'+m.bioguide;
 $('recordUpdated').textContent='Member roster checked '+formatDate(state.rosterDate)+' · individual vote coverage indicated alongside each captured snapshot.';
 $('votesQuery').value='';displayFinance(m);renderDelegation();
 if(state.selectedState!==m.state)showState(m.state);
 try{history.replaceState(null,'','#state='+encodeURIComponent(m.state)+'&member='+encodeURIComponent(id));}catch{}
 $('memberProfile').scrollIntoView?.({behavior:'smooth',block:'start'});
 loadVotes(m);
}
async function begin(){
 try{
  const response=await fetch(reader,{headers:{Accept:'application/json'},credentials:'omit'});
  if(!response.ok)throw Error('Roster HTTP '+response.status);
  const payload=await response.json();
  const members=model.members(payload);
  if(!members.length)throw Error('Roster is empty');
  state.members=members;state.rosterDate=payload.asOf||payload.retrievedAt;
  renderStateDirectory();
  const route=new URLSearchParams(location.hash.slice(1));
  const id=route.get('member'),stateCode=route.get('state');
  const target=id?model.getMember(members,id):null;
  if(target)showState(target.state);
  else if(stateCode&&stateByCode[stateCode.toUpperCase()])showState(stateCode.toUpperCase());
  if(target)select(target.bioguide);
 }catch(_){
  rosterStatus.textContent='The cached congressional roster is temporarily unavailable. Reopen the page to retry.';
 }
}
$('backToStates').addEventListener('click',showAllStates);
renderStateDirectory();
$('votesQuery').addEventListener('input',()=>{if(state.member)renderVotes();});
begin();
})();

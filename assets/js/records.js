/* Public congressional record explorer.
 * All official roll call provider traffic occurs only in scheduled GitHub jobs.
 * The website reads published JSON and the pre-existing cached member roster.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const model=window.POLITICS_RECORDS_MODEL;
const reader='https://politics-daily-snapshot.alxayvazian.workers.dev/api/congress-snapshot';
const rosterStatus=$('searchStatus'),results=$('memberResults'),search=$('memberSearch');
const state={members:[],member:null,votes:[],voteData:null,rosterDate:null};
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cleanName=n=>String(n||'').replace(/[^\p{L}\p{N} .'-]/gu,' ').trim();
const external=(url,label)=>'<a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">'+esc(label)+' ↗</a>';
const formatDate=d=>{if(!d)return 'Date not supplied';const dt=new Date(d);return Number.isNaN(dt.valueOf())?String(d):dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});};
const chamberSource=member=>member.chamber==='House'?'U.S. House Clerk':'U.S. Senate';
function renderCandidates(){
 const q=search.value.trim().toLowerCase();
 const chamber=$('memberChamber').value;
 const filtered=state.members.filter(m=>{
  if(chamber!=='all'&&m.chamber!==chamber)return false;
  return !q||[m.name,m.state,m.chamber,m.bioguide,(m.chamber==='House'?m.state+'-'+String(m.district).padStart(2,'0'):'')].join(' ').toLowerCase().includes(q);
 });
 const shown=filtered.slice(0,45);
 results.replaceChildren();
 for(const m of shown){
  const button=document.createElement('button');
  button.type='button';button.setAttribute('aria-current',String(state.member?.bioguide===m.bioguide));
  const title=document.createElement('strong');title.textContent=m.name;
  const subtitle=document.createElement('span');
  subtitle.textContent=m.chamber==='Senate'?m.state+' · U.S. Senate · '+m.party:m.state+'-'+String(m.district).padStart(2,'0')+' · U.S. House · '+m.party;
  button.append(title,subtitle);
  button.addEventListener('click',()=>select(m.bioguide));
  results.append(button);
 }
 rosterStatus.textContent=shown.length?filtered.length+' current matching member'+(filtered.length===1?'':'s')+
   (filtered.length>45?' · showing first 45':''):'No matches. Try a member name or state abbreviation.';
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
  const r=await fetch('assets/data/records/'+chamber+'-votes.json',{credentials:'same-origin',cache:'default'});
  if(!r.ok)throw Error('No published '+m.chamber+' roll-call snapshot');
  data=await r.json();
  if(!Array.isArray(data.votes)||!data.votes.length)throw Error('No validated captured votes available');
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
 $('votePeriod').textContent=String(data.congress||119)+'th Congress · '+data.votes.length+' captured chamber roll calls';
 $('voteStatus').textContent=state.votes.length+' identified votes in this captured dataset · source checked '+formatDate(data.retrievedAt||data.asOf)+'. This is not a full career total.';
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
 $('votesQuery').value='';displayFinance(m);renderCandidates();
 try{history.replaceState(null,'','#member='+encodeURIComponent(id));}catch{}
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
  renderCandidates();
  const route=new URLSearchParams(location.hash.slice(1));
  const id=route.get('member');
  if(id&&model.getMember(members,id))select(id);
 }catch(_){
  rosterStatus.textContent='The cached congressional roster is temporarily unavailable. Reopen the page to retry.';
 }
}
search.addEventListener('input',renderCandidates);
$('memberChamber').addEventListener('change',renderCandidates);
$('votesQuery').addEventListener('input',()=>{if(state.member)renderVotes();});
begin();
})();

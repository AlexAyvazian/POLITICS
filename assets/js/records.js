/* Public congressional record explorer.
 * All official roll call provider traffic occurs only in scheduled GitHub jobs.
 * The website reads published JSON and the pre-existing cached member roster.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const model=window.POLITICS_RECORDS_MODEL;
const readerBase='https://politics-daily-snapshot.alxayvazian.workers.dev';
const reader=readerBase+'/api/congress-snapshot';
const rosterStatus=$('directoryStatus'),stateGrid=$('stateGrid');
const state={members:[],member:null,votes:[],voteData:null,rosterDate:null,selectedState:null,activeVoteFilter:'all',measures:{},financeData:null,travelData:null,sponsorData:null};
const states=model.states(window.GEO_STATES||[]);
const stateByCode=Object.fromEntries(states.map(item=>[item.abbr,item]));
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cleanName=n=>String(n||'').replace(/[^\p{L}\p{N} .'-]/gu,' ').trim();
const external=(url,label)=>'<a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">'+esc(label)+' ↗</a>';
const formatDate=d=>{if(!d)return 'Date not supplied';const dt=new Date(d);return Number.isNaN(dt.valueOf())?String(d):dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});};
const chamberSource=member=>member.chamber==='House'?'U.S. House Clerk':'U.S. Senate';
function recordsProfilePortrait(member,compact=false){
 const wrapper=document.createElement('span');wrapper.className='recordsMemberPortrait';
 const fallback=document.createElement('span');fallback.className='recordsMemberFallback';
 fallback.textContent=cleanName(member.name).split(/\s+/).filter(Boolean).slice(-2).map(s=>s[0]).join('').toUpperCase();
 const img=document.createElement('img');
 img.alt='';img.loading=compact?'eager':'lazy';img.decoding='async';
 img.src='https://unitedstates.github.io/images/congress/225x275/'+encodeURIComponent(member.bioguide)+'.jpg';
 img.onerror=()=>{img.hidden=true;};
 wrapper.append(fallback,img);
 return wrapper;
}
function renderStateDirectory(){
 stateGrid.replaceChildren();
 for(const item of states){
  const btn=document.createElement('button');
  btn.type='button';btn.className='recordsStateCard';
  if(item.abbr==='AK')btn.className+=' recordsStateCard--alaska';
  btn.setAttribute('aria-label','Browse '+item.name+' congressional delegation');
  // Use the exact geographically assigned state hover colors already used
  // on the main Atlas, not one universal blue highlight.
  const stateColors=window.GEO_COLORS?.state?.(item.fips);
  if(stateColors&&btn.style?.setProperty){
   btn.style.setProperty('--records-state-hover',stateColors.hover);
   btn.style.setProperty('--records-state-glow',stateColors.glow);
  }
  const glyph=document.createElement('span');
  glyph.className='recordsStateGlyph';glyph.setAttribute('aria-hidden','true');
  const path=window.POLITICS_STATE_SILHOUETTES?.[item.abbr];
  // Alaska spans a wide mainland and Aleutian chain. A tighter viewport
  // gives its outline equal visual presence without changing its geography.
  const viewBox=item.abbr==='AK'?'12 28 176 104':'0 0 200 160';
  if(path)glyph.innerHTML='<svg viewBox="'+viewBox+'" preserveAspectRatio="xMidYMid meet" focusable="false"><path d="'+path+'"></path></svg>';
  const abbreviation=document.createElement('span');
  abbreviation.className='recordsStateAbbr';abbreviation.textContent=item.abbr;
  const name=document.createElement('strong');
  name.textContent=item.name;
  btn.append(glyph,abbreviation,name);
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
 const name=document.createElement('strong');name.className='recordsMemberName';name.textContent=m.name;
 const party=document.createElement('span');party.className='recordsMemberParty';
 party.textContent=m.party||'Party not reported';
 btn.append(recordsProfilePortrait(m,m.chamber==='Senate'),district,name,party);
 btn.addEventListener('click',()=>select(m.bioguide));
 return btn;
}
function renderDelegation(){
 const abbr=state.selectedState;
 const item=stateByCode[abbr];
 if(!item)return;
 const delegation=model.delegation(state.members,abbr);
 $('delegationTitle').textContent=item.name;
 const path=window.POLITICS_STATE_SILHOUETTES?.[abbr];
 $('delegationSilhouette').innerHTML=path?'<svg viewBox="0 0 200 160" aria-hidden="true"><path d="'+path+'"></path></svg>':'';
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
 $('districtLookupStatus').textContent='';$('districtLookupResult').replaceChildren();
 $('addressInput').value='';
 $('stateDirectory').hidden=true;
 $('delegationDirectory').hidden=false;
 if(state.member?.state!==code){
  state.member=null;state.votes=[];state.voteData=null;
  $('memberProfile').hidden=true;
  $('recordsStart').hidden=true;
 }
 renderDelegation();
 if(shouldScroll){
  try{history.replaceState(null,'','#state='+encodeURIComponent(code));}catch{}
  $('delegationDirectory').scrollIntoView?.({behavior:'smooth',block:'start'});
 }
}
/* Census currently blocks cross-origin fetch; its documented public JSONP is
 * used only after a voter submits an address. Never store user addresses. */
function lookupCensusAddress(address,stateCode){
 return new Promise((resolve,reject)=>{
  const callback='politicsCensus'+Date.now()+'_'+Math.floor(Math.random()*1e6);
  let done=false;
  const script=document.createElement('script');
  const cleanup=()=>{try{delete window[callback]}catch{};script.remove?.();clearTimeout(timeout)};
  const finish=(error,result)=>{
   if(done)return;done=true;cleanup();error?reject(error):resolve(result);
  };
  const timeout=setTimeout(()=>finish(new Error('The Census lookup took too long. Please try again.')),16000);
  window[callback]=payload=>finish(null,payload);
  script.onerror=()=>finish(new Error('The Census lookup is temporarily unavailable. Please try again.'));
  const fullAddress=address.trim()+', '+stateCode;
  script.src='https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress'+
   '?address='+encodeURIComponent(fullAddress)+
   '&benchmark=Public_AR_Current&vintage=ACS2025_Current&format=jsonp&callback='+encodeURIComponent(callback);
  document.head.append(script);
 });
}
async function findMyRep(event){
 event?.preventDefault?.();
 const code=state.selectedState;
 if(!code)return;
 const address=$('addressInput').value.trim();
 const status=$('districtLookupStatus'),result=$('districtLookupResult');
 result.replaceChildren();
 if(address.length<8){status.textContent='Enter a street address, city, and ZIP code.';return;}
 const button=$('findMyRep');
 button.disabled=true;button.textContent='Finding your district…';
 status.textContent='Checking your address against 119th Congressional District boundaries…';
 try{
  const matched=await lookupCensusAddress(address,code);
  if(state.selectedState!==code)return;
  const district=window.POLITICS_ADDRESS_MODEL.district(matched,code);
  if(district===null){
   status.textContent='We could not confirm an exact district for that address. Include the street number, city and ZIP code.';
   return;
  }
  const delegation=model.delegation(state.members,code);
  const names=delegation.house.filter(member=>Number(member.district)===district);
  const districtName=district===0?'at-large district':'District '+district;
  status.textContent='Confirmed: '+stateByCode[code].name+' · '+districtName+' (119th Congress).';
  if(names.length===1){
   $('addressInput').value='';
   const member=names[0];
   const action=document.createElement('button');action.type='button';
   action.className='recordsFoundRepresentative';
   action.textContent='View '+member.name+' · '+(member.party||'Party not reported')+' →';
   action.addEventListener('click',()=>select(member.bioguide));
   result.append(action);
   select(member.bioguide);
  }else{
   const info=document.createElement('p');info.className='recordsStatus';
   info.textContent='The district is confirmed, but the directory does not list a current representative for this seat.';
   result.append(info);
  }
 }catch(e){if(state.selectedState===code)status.textContent=e.message||'The district lookup could not be completed.';}
 finally{
  button.disabled=false;button.textContent='Find my representative';
  // Keep the address if lookup failed so voters do not have to retype it.
 }
}
function showAllStates(){
 state.selectedState=null;state.member=null;state.votes=[];state.voteData=null;
 $('delegationDirectory').hidden=true;
 $('stateDirectory').hidden=false;
 $('memberProfile').hidden=true;
 $('recordsStart').hidden=true;
 try{history.replaceState(null,'',location.pathname+location.search);}catch{}
 $('stateDirectory').scrollIntoView?.({behavior:'smooth',block:'start'});
}
function sourceUrl(v){
 if(typeof v.url==='string'&&/^https:\/\/(clerk\.house\.gov|www\.senate\.gov)\//.test(v.url))return v.url;
 if(state.member?.chamber==='House'&&Number.isInteger(v.year)&&Number.isInteger(v.roll))
  return 'https://clerk.house.gov/Votes/'+v.year+v.roll;
 return 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_'+String(v.roll).padStart(5,'0')+'.htm';
}
function voteGroup(cast){
 if(['Yea','Aye','Paired Yea','Announced Yea'].includes(cast))return 'yes';
 if(['Nay','No','Paired Nay','Announced Nay'].includes(cast))return 'no';
 if(cast==='Not Voting')return 'absent';
 return 'other';
}
function renderVoteDistribution(){
 const counts=model.voteDistribution(state.votes);
 const root=$('voteDistribution');root.replaceChildren();
 if(!counts.total)return;
 const caption=document.createElement('p');caption.className='recordsDistributionCaption';
 caption.textContent='HOW THIS PERSON VOTED · Percentage of recorded roll calls, not Democratic vs. Republican votes';
 const rows=document.createElement('div');rows.className='recordsDistributionRows';
 for(const [kind,label] of [['yes','Yes'],['no','No'],['other','Present'],['absent','Not voting']]){
  const n=counts[kind],pct=100*n/counts.total;
  const line=document.createElement('div');line.className='recordsDistributionRow '+kind;
  const head=document.createElement('span');head.className='recordsDistributionLabel';head.textContent=label;
  const track=document.createElement('div');track.className='recordsDistributionTrack';
  track.setAttribute('role','img');track.setAttribute('aria-label',label+': '+n+' of '+counts.total+' votes ('+pct.toFixed(1)+'%)');
  const fill=document.createElement('div');fill.className='recordsDistributionFill';
  fill.style.width=pct.toFixed(2)+'%';track.append(fill);
  const value=document.createElement('span');value.className='recordsDistributionValue';
  value.textContent=n+' · '+pct.toFixed(1)+'%';
  line.append(head,track,value);rows.append(line);
 }
 const note=document.createElement('p');note.className='recordsSectionNote';
 note.textContent='A Yes can approve, confirm, or advance a question. It does not always mean approving a bill; individual vote questions appear below.';
 root.append(caption,rows,note);
}
function measureKey(value){return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function voteMeaning(v){
 const q=String(v.question||'').toLowerCase();
 const measure=measureKey(v.measure);
 const nomination=measure.startsWith('PN')||q.includes('nomination');
 if(q.includes('cloture'))
  return 'This vote concerned whether to limit debate or advance consideration. It does not by itself enact a bill or confirm an appointment.';
 if(q.includes('motion to proceed'))
  return 'This vote concerned taking up the measure for Senate consideration, rather than deciding whether the underlying proposal becomes law.';
 if(nomination)
  return 'This was a vote about a federal appointment. Approval confirms or advances a nominee; it is not a vote on a household spending program.';
 if(q.includes('amendment'))
  return 'This vote was on a proposed change to a legislative measure. The change is not necessarily enacted merely because this roll call passed.';
 if(q.includes('passage')||q.includes('suspend the rules'))
  return 'This was a legislative passage question in this chamber. Passage here does not necessarily mean the measure became federal law.';
 return 'This is one recorded congressional question. The vote result shown above tells you what the chamber decided, not a measured effect on households.';
}
function addVoteExplanation(container,v){
 const desc=document.createElement('div');desc.className='recordsVoteWhy';
 const heading=document.createElement('strong');heading.textContent='What this vote decided: ';
 const line=document.createElement('span');line.textContent=voteMeaning(v);
 desc.append(heading,line);
 const official=state.measures[measureKey(v.measure)];
 if(official&&(official.title||official.summary)){
  const paragraph=document.createElement('div');paragraph.className='recordsOfficialSummary';
  const label=document.createElement('strong');label.textContent='What the proposal says: ';
  const text=document.createElement('span');
  const original=String(official.summary||official.title||'');
  const excerpt=original.length>390?original.slice(0,390).replace(/\s+\S*$/,'').trim():original;
  text.textContent=excerpt+(original.length>390?'…':'');
  paragraph.append(label,text);
  if(original.length>390){
   const expand=document.createElement('details');expand.className='recordsSummaryDetails';
   const button=document.createElement('summary');button.textContent='Read full official explanation';
   const full=document.createElement('p');full.textContent=original;
   expand.append(button,full);paragraph.append(expand);
  }
  desc.append(paragraph);
 }
 container.append(desc);
}
async function loadOfficialSummaries(){
 try{
  const res=await fetch('assets/data/records/measures-119.json',{credentials:'same-origin'});
  if(!res.ok)return;
  const value=await res.json();
  if(value&&typeof value==='object'&&!Array.isArray(value)){
   state.measures=value;
   if(state.member&&state.votes.length)renderVotes();
  }
 }catch(_){}
}
function renderVotes(){
 let filtered=model.filterVotes(state.votes,$('votesQuery').value);
 if(state.activeVoteFilter!=='all')
  filtered=filtered.filter(v=>voteGroup(v.cast)===state.activeVoteFilter);
 const list=$('memberVotes');list.replaceChildren();
 for(const v of filtered.slice(0,160)){
  const card=document.createElement('div');card.className='recordsVoteRow';
  const cast=document.createElement('span');cast.className='recordsCast '+(v.cast==='Yea'?'Yea':v.cast==='Nay'?'Nay':'');cast.textContent=v.cast;
  const body=document.createElement('div');body.className='recordsVoteText';
  const title=document.createElement('strong');
  title.textContent=(v.measure?v.measure+' · ':'')+(v.subject||v.question||'Recorded roll call');
  const foot=document.createElement('small');
  foot.textContent=formatDate(v.date)+' · Roll '+v.roll+' · '+(v.question||'Recorded vote')+
   (v.result?' · '+v.result:'');
  body.append(title,foot);
  addVoteExplanation(body,v);
  const link=document.createElement('a');link.href=sourceUrl(v);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Source';link.setAttribute('aria-label','Source document for roll call '+v.roll);
  card.append(cast,body,link);list.append(card);
 }
 if(!filtered.length){
  const p=document.createElement('p');p.className='recordsStatus';
  p.textContent=state.votes.length?'No captured votes match this search.':'No individual roll-call votes were found for this member in the available snapshot. This does not establish that they missed votes.';
  list.append(p);
 }
}

/* The evidence-first dashboard never treats uncollected data as a zero.
   Identity joins come from validated Bioguide member files and FEC crosswalks. */
function refreshDashboard(){
 const overview=model.profileEvidenceSummary({
  votes:state.votes,votesAvailable:!!state.voteData,
  finance:state.financeData,travel:state.travelData
 });
 const set=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
 set('statCampaign',overview.campaignReceipts===null?'Not reported':moneyLabel(overview.campaignReceipts));
 set('statVotes',overview.voteCount===null?'Not available':overview.voteCount.toLocaleString('en-US'));
 set('statMeasures',overview.measureCount===null?'Not available':overview.measureCount.toLocaleString('en-US'));
 set('statTravel',overview.travelFilings===null?'Not matched':overview.travelFilings.toLocaleString('en-US'));
 set('voteArchiveCount',overview.voteCount===null?'(not available)':'('+overview.voteCount+' captured)');
 const origin=$('financePrimarySource');
 if(origin){
  origin.replaceChildren();
  origin.hidden=!overview.candidateId;
  if(overview.candidateId){
   const link=document.createElement('a');
   link.href='https://www.fec.gov/data/candidate/'+encodeURIComponent(overview.candidateId)+'/?cycle=2026';
   link.target='_blank';link.rel='noopener noreferrer';
   link.textContent='View the matched FEC candidate filing and underlying records ↗';
   origin.append(link);
  }
 }
}
function renderRecentDecisions(){
 const root=$('recentDecisions');if(!root)return;
 root.replaceChildren();
 if(!state.voteData){
  const p=document.createElement('p');p.className='recordsStatus';
  p.textContent='No validated individual roll-call snapshot is currently available for this member.';
  root.append(p);return;
 }
 for(const v of state.votes.slice(0,3)){
  const row=document.createElement('article');row.className='recordsDecision';
  const heading=document.createElement('div');heading.className='recordsDecisionTop';
  const cast=document.createElement('span');cast.className='recordsDecisionCast';
  cast.textContent='Voted '+(v.cast||'status not provided');
  const date=document.createElement('time');date.textContent=formatDate(v.date);
  heading.append(cast,date);
  const title=document.createElement('strong');title.textContent=(v.measure?v.measure+' · ':'')+(v.subject||v.question||'Recorded question');
  const context=document.createElement('p');context.textContent=voteMeaning(v);
  const source=document.createElement('a');source.textContent='Official roll call ↗';
  source.href=sourceUrl(v);source.target='_blank';source.rel='noopener noreferrer';
  row.append(heading,title,context,source);root.append(row);
 }
}

const moneyLabel=n=>typeof n==='number'&&Number.isFinite(n)?
 new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n):'Not reported';
const PAC_SECTOR_COLORS={
 'Health Insurance':'#4d83ef',
 'Insurance & Employee Benefits':'#a05ce4',
 'Finance, Banking & Investment':'#42b86b',
 'Healthcare & Pharmaceuticals':'#e05258',
 'Housing, Real Estate & Construction':'#e8a52d',
 'Technology & Telecommunications':'#4d83ef',
 'Retail, Consumer & Media':'#a05ce4',
 'Defense & Federal Contracting':'#b64257',
 'Industry, Energy & Agriculture':'#42b86b',
 'Transportation & Vehicles':'#e8a52d',
 'Legal, Lobbying & Professional':'#9a63df',
 'Labor & Unions':'#3da9c6',
 'Leadership PACs':'#d5b55b',
 'Party Committees':'#91a5bb',
 'Other / Unclassified':'#71869b'
};
const sectorColor=name=>PAC_SECTOR_COLORS[name]||PAC_SECTOR_COLORS['Other / Unclassified'];
function pacFundingBar(label,total,max,sector){
 const row=document.createElement('div');row.className='recordsPacBar';
 const name=document.createElement('span');name.textContent=label;
 const track=document.createElement('div');track.className='recordsPacBarTrack';
 const fill=document.createElement('span');fill.className='recordsPacBarFill';
 fill.style.width=(Math.max(0,total)/Math.max(1,max)*100).toFixed(1)+'%';
 fill.style.background=sectorColor(sector);
 track.append(fill);
 const amount=document.createElement('strong');amount.textContent=moneyLabel(total);
 row.append(name,track,amount);return row;
}
function pacContributorRow(item){
 const row=document.createElement('div');row.className='recordsPacContributor';
 const main=document.createElement('div');main.className='recordsPacContributorName';
 const name=document.createElement('strong');name.textContent=item.name||item.committeeId||'Unnamed committee';
 main.append(name);
 const meta=document.createElement('span');meta.textContent=item.sector||'Other / Unclassified';
 meta.style.setProperty('--pac-accent',sectorColor(item.sector));
 main.append(meta);
 if(item.leadershipPac){
  const badge=document.createElement('em');badge.textContent='Leadership PAC';
  main.append(badge);
 }
 const amount=document.createElement('strong');amount.className='recordsPacContributorAmount';amount.textContent=moneyLabel(item.total);
 row.append(main,amount);
 if(typeof item.sourceUrl==='string'&&/^https:\/\/www\.fec\.gov\//.test(item.sourceUrl)){
  const link=document.createElement('a');link.href=item.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';
  link.textContent='FEC';link.setAttribute('aria-label','FEC records for '+(item.name||item.committeeId));row.append(link);
 }
 return row;
}
function renderPacFunding(data,m){
 const root=$('pacFundingVisualization');if(!root)return;
 root.replaceChildren();
 if(state.member?.bioguide!==m.bioguide)return;
 if(!data||data.bioguide!==m.bioguide||data.cycle!==2026||
   !Array.isArray(data.topContributors)||!Array.isArray(data.sectors)){
  const p=document.createElement('p');p.className='recordsEvidenceNote';
  p.textContent='Named PAC and committee funding has not been published for this member yet. The FEC campaign totals and filing detail below remain available.';
  root.append(p);return;
 }
 const top=data.topContributors.filter(x=>x&&typeof x.total==='number'&&x.total>0);
 const sectors=data.sectors.filter(x=>x&&typeof x.total==='number'&&x.total>0);
 const own=Array.isArray(data.memberLeadershipPacs)?data.memberLeadershipPacs:[];
 const incomingLeadership=Array.isArray(data.leadershipPacContributors)?data.leadershipPacContributors:[];
 const metrics=document.createElement('div');metrics.className='recordsPacMetrics';
 for(const [label,value,kind] of [
  ['Direct committee contributions',data.directCommitteeTotal,'money'],
  ['Named PACs / committees',top.length,'number'],
  ['Funding sectors',sectors.length,'number'],
  ['Member leadership PACs',own.length,'number']
 ]){
  const box=document.createElement('div');box.className='recordsPacMetric';
  const span=document.createElement('span');span.textContent=label;
  const strong=document.createElement('strong');strong.textContent=kind==='money'?moneyLabel(value):String(value??0);
  box.append(span,strong);metrics.append(box);
 }
 root.append(metrics);
 if(!top.length){
  const none=document.createElement('p');none.className='recordsEvidenceNote';
  none.textContent='No direct committee-to-candidate contribution rows were found in the current FEC bulk snapshot for this candidate. Independent expenditures are not treated as campaign receipts here.';
  root.append(none);
 }else{
  const comparison=document.createElement('div');comparison.className='recordsPacCompare';
  const sectorBlock=document.createElement('section');sectorBlock.className='recordsPacChart';
  const sh=document.createElement('h4');sh.textContent='Funding by sector';sectorBlock.append(sh);
  const sectorMax=Math.max(...sectors.slice(0,10).map(x=>x.total),1);
  for(const item of sectors.slice(0,10))sectorBlock.append(pacFundingBar(item.sector,item.total,sectorMax,item.sector));
  const topBlock=document.createElement('section');topBlock.className='recordsPacChart';
  const th=document.createElement('h4');th.textContent='Top PAC & committee contributors';topBlock.append(th);
  const topMax=Math.max(...top.slice(0,10).map(x=>x.total),1);
  for(const item of top.slice(0,10))topBlock.append(pacFundingBar(item.name,item.total,topMax,item.sector));
  comparison.append(sectorBlock,topBlock);root.append(comparison);
 }
 if(own.length||incomingLeadership.length){
  const leadership=document.createElement('section');leadership.className='recordsLeadershipPacSection';
  const h=document.createElement('div');h.className='recordsPacSubhead';
  h.innerHTML='<span>FEC-REGISTERED RELATIONSHIPS</span><h4>Leadership PAC connections</h4>';
  leadership.append(h);
  if(own.length){
   const label=document.createElement('p');label.className='recordsPacSectionLabel';
   label.textContent='Leadership PACs sponsored by this member';leadership.append(label);
   const cards=document.createElement('div');cards.className='recordsLeadershipPacGrid';
   for(const pac of own){
    const card=document.createElement('article');card.className='recordsLeadershipPacCard';
    const title=document.createElement('strong');title.textContent=pac.name||pac.committeeId;
    const sponsor=document.createElement('span');sponsor.textContent='FEC sponsor: '+(pac.sponsorName||m.name);
    const stats=document.createElement('div');stats.className='recordsLeadershipPacStats';
    for(const [label,value] of [['Receipts',pac.totalReceipts],['Disbursements',pac.totalDisbursements],['Cash on hand',pac.cashOnHand]]){
     const item=document.createElement('span');item.innerHTML='<small>'+esc(label)+'</small><b>'+esc(moneyLabel(value))+'</b>';stats.append(item);
    }
    card.append(title,sponsor,stats);
    if(typeof pac.sourceUrl==='string'&&/^https:\/\/www\.fec\.gov\//.test(pac.sourceUrl)){
     const a=document.createElement('a');a.href=pac.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent='FEC leadership PAC record ↗';card.append(a);
    }
    cards.append(card);
   }
   leadership.append(cards);
  }
  if(incomingLeadership.length){
   const label=document.createElement('p');label.className='recordsPacSectionLabel';
   label.textContent='Leadership PACs that gave directly to this campaign';leadership.append(label);
   const list=document.createElement('div');list.className='recordsPacTable';
   for(const item of incomingLeadership.slice(0,12))list.append(pacContributorRow(item));
   leadership.append(list);
  }
  root.append(leadership);
 }
 if(sectors.length){
  const sectorArea=document.createElement('section');sectorArea.className='recordsFundingSectors';
  const h=document.createElement('div');h.className='recordsPacSubhead';
  h.innerHTML='<span>NAMED PACS, GROUPED FOR BROWSING</span><h4>PACs by sector</h4>';
  sectorArea.append(h);
  const note=document.createElement('p');note.className='recordsEvidenceNote';
  note.textContent='Sector labels are a POLITICS browsing taxonomy based on committee names; they are not industry classifications assigned by the FEC.';
  sectorArea.append(note);
  const grid=document.createElement('div');grid.className='recordsFundingSectorGrid';
  for(const [index,sector] of sectors.entries()){
   const details=document.createElement('details');details.className='recordsFundingSector';
   details.style.setProperty('--sector-accent',sectorColor(sector.sector));
   if(index<3)details.open=true;
   const summary=document.createElement('summary');
   const name=document.createElement('span');name.textContent=sector.sector;
   const count=document.createElement('small');count.textContent=sector.committeeCount+' committee'+(sector.committeeCount===1?'':'s');
   const total=document.createElement('strong');total.textContent=moneyLabel(sector.total);
   summary.append(name,count,total);details.append(summary);
   const table=document.createElement('div');table.className='recordsPacTable';
   for(const item of (Array.isArray(sector.items)?sector.items:[]).slice(0,20))table.append(pacContributorRow(item));
   details.append(table);grid.append(details);
  }
  sectorArea.append(grid);root.append(sectorArea);
 }
 const methodology=document.createElement('p');methodology.className='recordsEvidenceNote recordsPacMethodology';
 methodology.textContent=(data.methodology||'')+' Bulk snapshot updated '+formatDate(data.retrievedAt)+'.';
 root.append(methodology);
}
async function loadPacFunding(m){
 const root=$('pacFundingVisualization');if(!root)return;
 root.textContent='Loading named PAC contributors and sector totals…';
 let data=null;
 try{
  const response=await fetch('assets/data/records/pac-funding/'+encodeURIComponent(m.bioguide)+'.json',{credentials:'same-origin',cache:'default'});
  if(response.ok)data=await response.json();
 }catch(_){}
 renderPacFunding(data,m);
}

function makeMetric(label,value){
 const box=document.createElement('div');box.className='recordsFinanceMetric';
 const h=document.createElement('span');h.textContent=label;
 const n=document.createElement('strong');n.textContent=moneyLabel(value);
 box.append(h,n);return box;
}
function renderFinance(data,m){
 const root=$('financeVisualization');root.replaceChildren();
 if(state.member?.bioguide!==m.bioguide)return;
 if(!data||data.bioguide!==m.bioguide||data.cycle!==2026){
  state.financeData=null;refreshDashboard();
  const p=document.createElement('p');p.className='recordsEvidenceNote';
  p.textContent='A current FEC financial statement has not been linked to this member in our verified cache. No amount is assumed; this does not imply zero campaign funding.';
  root.append(p);return;
 }
 state.financeData=data;refreshDashboard();
 const grid=document.createElement('div');grid.className='recordsFinanceMetrics';
 for(const [label,key] of [['Total receipts','raised'],['Total spending','spent'],['Cash on hand','cashOnHand'],['Debts owed','debts']])
  grid.append(makeMetric(label,data[key]));
 root.append(grid);
 const summary=document.createElement('p');summary.className='recordsEvidenceNote';
 summary.textContent='2025–2026 FEC reported campaign activity, through '+(data.coverageEnd||'latest available filing')+'.';
 root.append(summary);
 const compared=[['Individuals','individualContributions'],['Other political committees','committeeContributions'],
  ['Party committees','partyContributions'],['Candidate’s own contributions','selfContributions']];
 const max=Math.max(...compared.map(([,key])=>Math.max(0,data[key]||0)),1);
 const visual=document.createElement('div');visual.className='recordsFinanceBars';
 for(const [label,key] of compared){
  const value=data[key];
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)continue;
  const row=document.createElement('div');row.className='recordsFinanceBarRow';
  const name=document.createElement('span');name.textContent=label;
  const track=document.createElement('div');track.className='recordsFinanceBarTrack';
  const fill=document.createElement('span');fill.className='recordsFinanceBarFill';
  fill.style.width=(value/max*100).toFixed(2)+'%';track.append(fill);
  track.setAttribute('role','img');track.setAttribute('aria-label',label+': '+moneyLabel(value));
  const val=document.createElement('strong');val.textContent=moneyLabel(value);
  row.append(name,track,val);visual.append(row);
 }
 const title=document.createElement('h4');title.textContent='Reported contribution categories';
 root.append(title,visual);
 const explain=document.createElement('p');explain.className='recordsEvidenceNote';
 explain.textContent='Each bar uses the largest displayed category as its scale. These categories do not necessarily add up to total receipts; loans and transfers can be reported separately.';
 root.append(explain);
}
async function loadFinance(m){
 $('financeVisualization').textContent='Loading official FEC campaign totals…';
 let payload=null;
 try{
  const response=await fetch('assets/data/records/finance/'+encodeURIComponent(m.bioguide)+'.json',{credentials:'same-origin',cache:'default'});
  if(response.ok)payload=await response.json();
 }catch(_){}
 renderFinance(payload,m);
}

/* Confirmed FEC aggregation and researcher-coded lobbying links are stored
 * in the same D1 cache as sponsorship. A missing response is not zero. */
function evidenceBars(title,items,labelField){
 const section=document.createElement('section');section.className='recordsInsightGroup';
 const heading=document.createElement('h4');heading.textContent=title;section.append(heading);
 if(!Array.isArray(items)){
  const p=document.createElement('p');p.className='recordsEvidenceNote';
  p.textContent='This source is not currently available.';section.append(p);return section;
 }
 if(!items.length){
  const p=document.createElement('p');p.className='recordsEvidenceNote';
  p.textContent='No rows were returned in the captured sample; this is not a verified zero.';
  section.append(p);return section;
 }
 const valid=items.filter(x=>typeof x?.total==='number'&&Number.isFinite(x.total)&&x.total>=0)
  .sort((a,b)=>b.total-a.total).slice(0,7);
 const max=Math.max(1,...valid.map(x=>x.total));
 for(const item of valid){
  const line=document.createElement('div');line.className='recordsInsightLine';
  const label=document.createElement('span');label.textContent=String(item[labelField]??'Not classified');
  const track=document.createElement('div');track.className='recordsInsightTrack';
  const fill=document.createElement('span');fill.className='recordsInsightFill';
  fill.style.width=(100*item.total/max).toFixed(1)+'%';track.append(fill);
  const total=document.createElement('strong');total.textContent=moneyLabel(item.total);
  line.append(label,track,total);section.append(line);
 }
 return section;
}

/* One shared FEC committee graph, discovered by the backend for every member.
 * Distinct Schedule A and Schedule B filing entries are never added together
 * as a claim about original funding or a recipient's loyalty. */
let moneyNetworkRequest=0;
async function loadMoneyNetwork(m,committeeId=null,trail=[]){
 const root=$('moneyNetworkVisualization');if(!root)return;
 const requestId=++moneyNetworkRequest;
 root.textContent='Checking recorded committee transactions…';
 let data=null;
 try{
  const param=committeeId?'committee_id='+encodeURIComponent(committeeId):
   'bioguide='+encodeURIComponent(m.bioguide);
  const response=await fetch(readerBase+'/api/political-money-network?'+param,
   {headers:{Accept:'application/json'},credentials:'omit'});
  if(response.ok)data=await response.json();
 }catch(_){}
 if(state.member?.bioguide!==m.bioguide||moneyNetworkRequest!==requestId)return;
 root.replaceChildren();
 if(!data||data.status!=='partial'||!/^C[0-9]{8}$/.test(String(data.committeeId||''))){
  const p=document.createElement('p');p.className='recordsEvidenceNote';
  p.textContent='This committee’s transaction links have not been collected in the shared network yet. That does not mean no contributions or transfers occurred. The campaign totals below are maintained separately.';
  root.append(p);return;
 }
 const header=document.createElement('div');header.className='recordsNetworkTop';
 const heading=document.createElement('strong');heading.textContent=committeeId?'Committee '+data.committeeId:m.name+' · linked campaign committee';
 const id=document.createElement('span');id.textContent='FEC '+data.committeeId+' · 2025–2026';
 header.append(heading,id);
 root.append(header);
 if(committeeId){
  const back=document.createElement('button');back.type='button';back.className='recordsNetworkBack';
  back.textContent=trail.length?'← Previous committee':'← Back to representative';
  back.addEventListener('click',()=>{
   const prev=trail[trail.length-1];
   loadMoneyNetwork(m,prev||null,trail.slice(0,-1));
  });
  root.append(back);
 }
 const documents=Array.isArray(data.records)?data.records.filter(x=>
  (x.sourceFeed==='schedule_a'||x.sourceFeed==='schedule_b')&&
  /^C[0-9]{8}$/.test(x.sourceCommitteeId)&&/^C[0-9]{8}$/.test(x.recipientCommitteeId)): [];
 const incoming=documents.filter(x=>x.recipientCommitteeId===data.committeeId);
 const outgoing=documents.filter(x=>x.sourceCommitteeId===data.committeeId);
 const grid=document.createElement('div');grid.className='recordsNetworkGrid';
 function column(title,rows,direction){
  const section=document.createElement('section');section.className='recordsNetworkColumn';
  const h=document.createElement('h4');h.textContent=title;section.append(h);
  if(!rows.length){
   const message=document.createElement('p');message.className='recordsEvidenceNote';
   message.textContent='No validated committee-to-committee filing rows in the collected sample yet.';
   section.append(message);
  }
  for(const row of rows.slice(0,14)){
   const from=direction==='in',nextId=from?row.sourceCommitteeId:row.recipientCommitteeId;
   const name=from?row.sourceName:row.recipientName;
   const entry=document.createElement('article');entry.className='recordsNetworkEdge';
   const button=document.createElement('button');button.type='button';
   button.className='recordsNetworkNode';
   button.textContent=name||nextId;
   button.setAttribute('aria-label','Explore other transactions involving '+(name||nextId));
   button.addEventListener('click',()=>loadMoneyNetwork(m,nextId,[...trail,committeeId||null]));
   const amount=document.createElement('strong');
   amount.textContent=typeof row.amountCents==='number'&&Number.isFinite(row.amountCents)?
    moneyLabel(row.amountCents/100):'Amount unavailable';
   const context=document.createElement('span');context.className='recordsNetworkContext';
   context.textContent=(row.memo?'Memo/intermediary entry — not additional money':
    row.sourceFeed==='schedule_a'?'Reported committee receipt':'Reported committee disbursement')+
    (row.date?' · '+formatDate(row.date):'')+
    (row.amendment?' · Filing '+row.amendment:'');
   entry.append(button,amount,context);
   const connected=from?row.sourceConnectedOrganization:row.recipientConnectedOrganization;
   if(typeof connected==='string'&&connected.trim()){
    const affiliate=document.createElement('span');affiliate.className='recordsNetworkAffiliation';
    affiliate.textContent='FEC-reported connected organization: '+connected;
    entry.append(affiliate);
   }
   if(typeof row.sourceUrl==='string'&&
    /^https:\/\/(?:docquery\.fec\.gov|www\.fec\.gov)\//.test(row.sourceUrl)){
    const source=document.createElement('a');
    source.href=row.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';
    source.textContent=row.sourceUrl.startsWith('https://docquery.fec.gov/')?'Original FEC filing ↗':'FEC committee records ↗';entry.append(source);
   }
   section.append(entry);
  }
  return section;
 }
 grid.append(column('Reported money into this committee',incoming,'in'));
 grid.append(column('Reported money sent to other committees',outgoing,'out'));
 root.append(grid);
 const note=document.createElement('p');note.className='recordsEvidenceNote recordsNetworkDisclaimer';
 note.textContent=data.methodology||'Receipts and disbursements can describe the same money movement. Do not add them together, or assume a downstream committee payment came from a particular upstream donor.';
 root.append(note);
 const collection=document.createElement('p');collection.className='recordsEvidenceNote';
 collection.textContent=documents.length+' documented rows currently available for this committee. This is an automatically collected partial record, not a complete funding history.';
 root.append(collection);
}

async function loadFinanceDetail(m){
 const root=$('financeDetailViz');if(!root)return;
 root.textContent='Checking detailed FEC breakdowns…';
 let data=null;
 try{
  const r=await fetch(readerBase+'/api/member-finance-detail?bioguide='+encodeURIComponent(m.bioguide),
   {headers:{Accept:'application/json'},credentials:'omit'});
  if(r.ok)data=await r.json();
 }catch(_){}
 if(state.member?.bioguide!==m.bioguide)return;
 root.replaceChildren();
 if(!data||data.bioguide!==m.bioguide||data.cycle!==2026||
   !/^[HS][A-Z0-9]{8}$/.test(String(data.candidateId||''))){
  const p=document.createElement('p');p.className='recordsEvidenceNote';
  p.textContent='Additional itemized FEC breakdowns have not been collected for this member. The verified campaign summary above remains available.';
  root.append(p);return;
 }
 const title=document.createElement('h4');title.textContent='Explore the reported money';
 root.append(title);
 const note=document.createElement('p');note.className='recordsEvidenceNote';
 note.textContent='2025–2026 FEC aggregates · collected '+formatDate(data.retrievedAt)+
  '. These are itemized reporting categories, not comprehensive funding totals or proof an employer donated.';
 root.append(note);
 const body=document.createElement('div');body.className='recordsInsightGrid';
 if(Array.isArray(data.byState))body.append(evidenceBars('Reported individual donation totals by state',data.byState,'state'));
 if(Array.isArray(data.contributionSizes))body.append(evidenceBars('Reported donation-size categories (FEC)',data.contributionSizes,'size'));
 if(Array.isArray(data.reportedEmployers))body.append(evidenceBars('Contributors’ reported employers',data.reportedEmployers,'employer'));
 if(Array.isArray(data.outsideSpending))body.append(evidenceBars('Independent spending: supporting vs opposing',data.outsideSpending,'side'));
 root.append(body);
 if(data.employerScope){
  const caveat=document.createElement('p');caveat.className='recordsEvidenceNote';
  caveat.textContent=data.employerScope;root.append(caveat);
 }
 const source=document.createElement('a');
 source.href='https://www.fec.gov/data/candidate/'+encodeURIComponent(data.candidateId)+'/?cycle=2026';
 source.target='_blank';source.rel='noopener noreferrer';source.textContent='View source FEC financial reports ↗';
 root.append(source);
}
async function loadLobby(m){
 const root=$('lobbyVisualization');if(!root)return;
 root.textContent='Checking LobbyView research records…';
 let data=null;
 try{
  const r=await fetch(readerBase+'/api/member-lobby-network?bioguide='+encodeURIComponent(m.bioguide),
   {headers:{Accept:'application/json'},credentials:'omit'});
  if(r.ok)data=await r.json();
 }catch(_){}
 if(state.member?.bioguide!==m.bioguide)return;
 root.replaceChildren();
 if(data?.bioguide!==m.bioguide||!Array.isArray(data.clients)){
  const p=document.createElement('p');p.className='recordsEvidenceNote';
  p.textContent='No verified LobbyView research snapshot has been cached for this member yet. This does not establish that nobody lobbied on their legislation.';
  root.append(p);return;
 }
 const count=document.createElement('strong');count.className='recordsLobbyCount';
 count.textContent=String(data.clientCount??'Unreported')+' research-coded client connections captured';
 root.append(count);
 const note=document.createElement('p');note.className='recordsEvidenceNote';
 note.textContent='Source: LobbyView · '+formatDate(data.retrievedAt)+
  '. The count covers only available network records from the first collected page in 2025–2026; no direct contact, payment or motive is implied.';
 root.append(note);
 for(const link of data.clients){
  const article=document.createElement('article');article.className='recordsLobbyRow';
  const name=document.createElement('strong');name.textContent=link.name;
  const desc=document.createElement('span');
  desc.textContent=String(link.reportYear)+' research network'+
   (Number.isFinite(link.billOverlapCount)?' · '+link.billOverlapCount+' overlapping sponsored bills':'');
  article.append(name,desc);root.append(article);
 }
 const source=document.createElement('a');source.href='https://www.lobbyview.org/data-download/api/';
 source.target='_blank';source.rel='noopener noreferrer';source.textContent='LobbyView data and methodology ↗';
 root.append(source);
}

function renderTravel(m,report=null){
 const root=$('travelVisualization');root.replaceChildren();
 if(state.member?.bioguide!==m.bioguide)return;
 const filings=Array.isArray(report?.filings)&&report.bioguide===m.bioguide?
  report.filings.filter(r=>r&&Number.isInteger(r.reportedYear)&&(r.reportedYear===2025||r.reportedYear===2026)):[];
 state.travelData=report?.bioguide===m.bioguide&&Array.isArray(report?.filings)?report:null;
 refreshDashboard();
 const house=m.chamber==='House';
 if(!filings.length){
  const message=document.createElement('p');message.className='recordsEvidenceNote';
  message.textContent='No travel filings have been matched to this '+(house?'House member':'Senate office')+' in the current local records. This does not establish that no sponsored travel occurred.';
  root.append(message);return;
 }
 const count=document.createElement('strong');count.className='recordsTravelHeadline';
 count.textContent=filings.length+' published travel filing'+(filings.length===1?'':'s')+
  (house?' associated with this House member':' associated with this Senate office');
 root.append(count);
 const explanation=document.createElement('p');explanation.className='recordsEvidenceNote';
 explanation.textContent=house?
  'House Clerk filings include the office, named filer, destination and sponsor. A filer may be a staff member; these are NOT all trips personally taken by this representative. No dollar amount is shown because the downloaded index does not contain verified costs.':
  'Senate office-associated filings include employee travel and do not establish that the senator personally traveled. Dollar totals are not provided by the downloaded index.';
 root.append(explanation);
 const years=new Map([[2025,0],[2026,0]]);
 for(const filing of filings)years.set(filing.reportedYear,years.get(filing.reportedYear)+1);
 const comparison=document.createElement('div');comparison.className='recordsTravelYears';
 const max=Math.max(...years.values(),1);
 for(const [year,n] of years){
  const row=document.createElement('div');row.className='recordsTravelYearRow';
  const label=document.createElement('span');label.textContent=String(year);
  const track=document.createElement('div');track.className='recordsFinanceBarTrack';
  const bar=document.createElement('span');bar.className='recordsTravelYearFill';
  bar.style.width=(n/max*100).toFixed(1)+'%';track.append(bar);
  track.setAttribute('role','img');track.setAttribute('aria-label',year+': '+n+' published disclosures');
  const total=document.createElement('strong');total.textContent=n+' filing'+(n===1?'':'s');
  row.append(label,track,total);comparison.append(row);
 }
 root.append(comparison);
 if(house){
  const sponsors=new Map();
  for(const filing of filings){
   const name=String(filing.sponsor||'').trim();
   if(name)sponsors.set(name,(sponsors.get(name)||0)+1);
  }
  const top=[...sponsors.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,5);
  if(top.length){
   const heading=document.createElement('h4');heading.textContent='Frequently reported travel sponsors';
   root.append(heading);
   const chart=document.createElement('div');chart.className='recordsTravelSponsors';
   const peak=Math.max(...top.map(row=>row[1]),1);
   for(const [name,n] of top){
    const row=document.createElement('div');row.className='recordsTravelSponsorRow';
    const label=document.createElement('span');label.textContent=name;
    const track=document.createElement('div');track.className='recordsFinanceBarTrack';
    track.setAttribute('role','img');track.setAttribute('aria-label',name+': '+n+' filings');
    const fill=document.createElement('span');fill.className='recordsTravelYearFill';
    fill.style.width=(n/peak*100).toFixed(1)+'%';track.append(fill);
    const value=document.createElement('strong');value.textContent=String(n);
    row.append(label,track,value);chart.append(row);
   }
   root.append(chart);
  }
 }
 const heading=document.createElement('h4');heading.textContent='Recent disclosed travel';
 root.append(heading);
 const listing=document.createElement('div');listing.className='recordsTravelList';
 for(const filing of filings.slice(0,12)){
  const item=document.createElement('div');item.className='recordsTravelItem';
  const title=document.createElement('strong');
  title.textContent=house?(filing.destination||'Destination not reported'):(filing.title||'Office travel disclosure');
  const details=document.createElement('span');details.className='recordsTravelMeta';
  details.textContent=(filing.beginDate||'Dates not listed')+
   (filing.endDate?' – '+filing.endDate:'')+
   (house?' · Sponsor: '+(filing.sponsor||'not recorded'):'')+
   ' · Filed by: '+(filing.filer||filing.traveler||'not specified');
  const badge=document.createElement('span');badge.className='recordsTravelBadge';
  badge.textContent=house?(filing.filingType||'House filing'):(filing.travelerType==='staff'?'Staff filing':'Unclassified filing');
  item.append(title,details,badge);listing.append(item);
 }
 root.append(listing);
 if(filings.length>12){
  const more=document.createElement('p');more.className='recordsEvidenceNote';
  more.textContent='Showing the 12 most recent of '+filings.length+' filings.';
  root.append(more);
 }
}
async function loadTravel(m){
 $('travelVisualization').textContent='Loading congressional travel disclosures…';
 let report=null;
 try{
  const response=await fetch('assets/data/records/travel/'+encodeURIComponent(m.bioguide)+'.json',{credentials:'same-origin',cache:'default'});
  if(response.ok)report=await response.json();
 }catch(_){}
 renderTravel(m,report);
}

async function loadSponsored(m){
 const root=$('sponsorVisualization');if(!root)return;
 root.textContent='Loading cached Congress.gov legislation…';
 let data=null;
 try{
  const response=await fetch(readerBase+'/api/member-legislation?bioguide='+encodeURIComponent(m.bioguide),
   {headers:{Accept:'application/json'},credentials:'omit'});
  if(response.ok)data=await response.json();
 }catch(_){}
 if(state.member?.bioguide!==m.bioguide)return;
 root.replaceChildren();state.sponsorData=null;
 if(data?.bioguide!==m.bioguide||data?.congress!==119||
  !Array.isArray(data?.sponsored)||!Array.isArray(data?.cosponsored)){
  const p=document.createElement('p');p.className='recordsEvidenceNote';
  p.textContent='Member-specific Congress.gov sponsorship data has not been collected into our cache yet. No bill sponsorship is assumed.';
  root.append(p);return;
 }
 state.sponsorData=data;
 const note=document.createElement('p');note.className='recordsEvidenceNote';
 note.textContent='Congress.gov · cache updated '+formatDate(data.retrievedAt)+
  '. Showing up to 30 recent records from each category; these are not complete session counts.';
 root.append(note);
 const grid=document.createElement('div');grid.className='recordsSponsorColumns';
 for(const [key,title] of [['sponsored','Introduced as sponsor'],['cosponsored','Joined as cosponsor']]){
  const section=document.createElement('section');section.className='recordsSponsorColumn';
  const h=document.createElement('h4');h.textContent=title+' · '+data[key].length+' captured';
  section.append(h);
  for(const bill of data[key].slice(0,8)){
   const article=document.createElement('article');article.className='recordsSponsorBill';
   const head=document.createElement('strong');head.textContent=bill.title||'Untitled legislation';
   const meta=document.createElement('span');meta.className='recordsSponsorMeta';
   meta.textContent=(bill.type||'')+' '+(bill.number||'')+
    (bill.introducedDate?' · Introduced '+formatDate(bill.introducedDate):'');
   article.append(head,meta);
   if(bill.latestAction){
    const p=document.createElement('p');p.textContent=bill.latestAction;article.append(p);
   }
   if(typeof bill.sourceUrl==='string'&&/^https:\/\/api\.congress\.gov\/v3\/bill\/119\//.test(bill.sourceUrl)){
    const link=document.createElement('a');link.href=bill.sourceUrl;
    link.target='_blank';link.rel='noopener noreferrer';
    link.textContent='Official bill record ↗';article.append(link);
   }
   section.append(article);
  }
  if(!data[key].length){
   const none=document.createElement('p');none.className='recordsEvidenceNote';
   none.textContent='No items from the 119th Congress in this limited, recent collection. This is not evidence the member has never '+(key==='sponsored'?'sponsored':'cosponsored')+' legislation.';
   section.append(none);
  }
  grid.append(section);
 }
 root.append(grid);
}

function renderMeasures(){
 const root=$('legislationVisualization');root.replaceChildren();
 const totals=new Map();
 for(const v of state.votes){
  const raw=String(v.measure||'').trim().toUpperCase().replace(/\s+/g,'');
  if(!raw||!/[0-9]/.test(raw))continue;
  totals.set(raw,(totals.get(raw)||0)+1);
 }
 const ranked=[...totals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);
 if(!ranked.length){root.textContent='No measure identifiers in the current recorded vote snapshot.';return;}
 const biggest=Math.max(...ranked.map(r=>r[1]),1);
 for(const [bill,n] of ranked){
  const row=document.createElement('div');row.className='recordsMeasureRow';
  const name=document.createElement('strong');name.textContent=bill;
  const track=document.createElement('div');track.className='recordsFinanceBarTrack';
  const fill=document.createElement('span');fill.className='recordsMeasureFill';
  fill.style.width=(n/biggest*100).toFixed(2)+'%';track.append(fill);
  const count=document.createElement('span');count.textContent=n+' recorded vote'+(n===1?'':'s');
  row.append(name,track,count);root.append(row);
 }
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
  $('memberVotes').replaceChildren(link);refreshDashboard();renderRecentDecisions();return;
 }
 if(state.member?.bioguide!==marker)return;
 state.voteData=data;state.votes=model.memberVotes(data,m);
 const counts=model.voteDistribution(state.votes);
 $('votePeriod').textContent=String(data.congress||119)+'th Congress · '+data.votes.length+' recorded member votes';
 $('voteStatus').textContent=state.votes.length+' recorded votes · Voteview (UCLA), data through '+formatDate(data.asOf)+'.';
 const sum=$('voteSummary');sum.hidden=false;
 sum.innerHTML=[['yes','Voted yes'],['no','Voted no'],['other','Present'],['absent','Not voting']]
  .map(([key,label])=>'<div><strong>'+counts[key]+'</strong><span>'+esc(label)+'</span></div>').join('');
 renderVoteDistribution();
 renderMeasures();
 renderVotes();
 refreshDashboard();renderRecentDecisions();
}
function activateProfileTab(name,focus=false){
 const tabs={overview:'profileTabOverview',votes:'profileTabVotes',funding:'profileTabFunding'};
 const panels={overview:'profilePanelOverview',votes:'profilePanelVotes',funding:'profilePanelFunding'};
 if(!tabs[name])name='overview';
 for(const key of Object.keys(tabs)){
  const active=key===name;
  const tab=$(tabs[key]),panel=$(panels[key]);
  if(tab){tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
  if(panel)panel.hidden=!active;
 }
 if(focus)$(tabs[name])?.focus();
}
function select(id){
 const m=model.getMember(state.members,id);if(!m)return;
 if(state.selectedState!==m.state)showState(m.state);
 state.member=m;state.votes=[];state.voteData=null;state.financeData=null;state.travelData=null;state.sponsorData=null;state.activeVoteFilter='all';
 $('recordsStart').hidden=true;
 $('delegationDirectory').hidden=true;
 $('stateDirectory').hidden=true;
 $('memberProfile').hidden=false;
 activateProfileTab('overview');
 $('profileName').textContent=m.name;
 $('profileChamber').textContent=m.chamber==='House'?'U.S. House of Representatives':'U.S. Senate';
 $('profileInfo').textContent=(m.chamber==='House'?stateByCode[m.state]?.name+' · '+(Number(m.district)===0?'At-large district':'Congressional District '+m.district):stateByCode[m.state]?.name+' · U.S. Senate')+' · '+(m.party||'Party not reported');
 $('profileBio').href='https://bioguide.congress.gov/search/bio/'+m.bioguide;
 const portrait=$('profilePortrait');portrait.replaceChildren();
 const photo=recordsProfilePortrait(m,true);
 photo.className='recordsMemberPortrait recordsProfilePortraitImage';
 portrait.append(photo);
 $('recordUpdated').textContent='Member roster checked '+formatDate(state.rosterDate)+' · individual vote coverage indicated alongside each captured snapshot.';
 $('votesQuery').value='';$('voteDistribution').replaceChildren();
 const archive=$('voteArchive');if(archive)archive.open=false;
 const recent=$('recentDecisions');if(recent)recent.textContent='Loading recorded decisions…';
 refreshDashboard();
 $('financeVisualization').textContent='Loading official FEC totals…';
 $('travelVisualization').replaceChildren();$('legislationVisualization').replaceChildren();
 for(const [key,name] of [['all','voteFilterAll'],['yes','voteFilterYea'],['no','voteFilterNay'],['absent','voteFilterAbsent']])
  $(name).setAttribute('aria-pressed',String(key==='all'));
 loadTravel(m);loadFinance(m);loadPacFunding(m);loadSponsored(m);loadFinanceDetail(m);loadLobby(m);loadMoneyNetwork(m);
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
$('districtLookupForm').addEventListener('submit',findMyRep);
$('backToDelegation').addEventListener('click',()=>{
 state.member=null;state.votes=[];state.voteData=null;
 $('memberProfile').hidden=true;
 $('delegationDirectory').hidden=false;
 $('recordsStart').hidden=true;
 renderDelegation();
 if(state.selectedState){
  try{history.replaceState(null,'','#state='+encodeURIComponent(state.selectedState));}catch{}
 }
 $('delegationDirectory').scrollIntoView?.({behavior:'smooth',block:'start'});
});
for(const [id,key] of [['profileTabOverview','overview'],['profileTabVotes','votes'],['profileTabFunding','funding']]){
 const tab=$(id);if(!tab)continue;
 tab.addEventListener('click',()=>activateProfileTab(key));
 tab.addEventListener('keydown',event=>{
  const order=['overview','votes','funding'];
  const currentIndex=order.indexOf(key);
  let next=null;
  if(event.key==='ArrowRight')next=order[(currentIndex+1)%order.length];
  else if(event.key==='ArrowLeft')next=order[(currentIndex+order.length-1)%order.length];
  else if(event.key==='Home')next=order[0];
  else if(event.key==='End')next=order[order.length-1];
  if(next){event.preventDefault();activateProfileTab(next,true);}
 });
}
renderStateDirectory();
loadOfficialSummaries();
for(const [name,key] of [['voteFilterAll','all'],['voteFilterYea','yes'],['voteFilterNay','no'],['voteFilterAbsent','absent']]){
 $(name).addEventListener('click',()=>{
  state.activeVoteFilter=key;
  for(const [id,mode] of [['voteFilterAll','all'],['voteFilterYea','yes'],['voteFilterNay','no'],['voteFilterAbsent','absent']])
   $(id).setAttribute('aria-pressed',String(mode===key));
  renderVotes();
 });
}
$('votesQuery').addEventListener('input',()=>{if(state.member)renderVotes();});
begin();
})();

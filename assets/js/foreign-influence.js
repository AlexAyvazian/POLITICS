/* Foreign Influence — POLITICS. Shell, boundaries and country colors derived
 * directly from the existing Healthcare Directory. Data are DOJ FARA registries.
 * No lobbying dollar, campaign contribution or government contact is inferred. */
import {COUNTRIES} from './foreign-world-catalog.js';
import {countryStates} from './foreign-world-colors.js';
import {countrySummary,selectedPrincipalRecords,verifiedSpending,safeFaraDocument,isIso2} from './foreign-influence-model.mjs';

const $=id=>document.getElementById(id);
const svg=d3.select('#mapSvg');
const countryLayer=svg.append('g').attr('class','countries');
const selectionLayer=svg.append('g').attr('class','foreignMapSelection');
const byNumeric=new Map(COUNTRIES.filter(c=>c.numeric).map(c=>[String(c.numeric).padStart(3,'0'),c]));
const byName=new Map(COUNTRIES.flatMap(c=>[c.name,...(c.atlasNames||[])].map(n=>[n.toLowerCase(),c])));
const byIso=new Map(COUNTRIES.map(c=>[c.iso2,c]));
const compare=(a,b)=>a.name.localeCompare(b.name);
const countries=COUNTRIES.filter(c=>c.iso2).sort(compare);
const millerRaw=(lambda,phi)=>[lambda,1.25*Math.log(Math.tan(Math.PI/4+.4*phi))];
millerRaw.invert=(x,y)=>[x,2.5*Math.atan(Math.exp(.8*y))-.625*Math.PI];
const projection=d3.geoProjection(millerRaw);
const geoPath=d3.geoPath(projection);
let topologyFeatures=[],selected=null,snapshot=null,detail=null,insightIndex=null;
let renderVersion=0,loadingSnapshot=false;

function featureCountry(feature){
 return byNumeric.get(String(feature.id||'').padStart(3,'0'))||
  byName.get(String(feature.properties?.name||'').toLowerCase())||null;
}
function el(tag,className='',content=''){
 const node=document.createElement(tag);if(className)node.className=className;
 if(content!==null&&content!==undefined)node.textContent=String(content);
 return node;
}
function sourceAnchor(url,title){
 const link=document.createElement('a');
 link.href=url;link.textContent=title;link.target='_blank';link.rel='noopener noreferrer';
 return link;
}
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const moneyExact=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const displayNumber=n=>Number.isFinite(n)?n.toLocaleString('en-US'):'Not yet available';
function showLabel(name,count){
 const total=count===null?'not indexed':displayNumber(count)+' listed principals';
 $('mapLabel').textContent=name+' · '+total;
}

function resetSidebar(){
 $('panelTitle').textContent='World';
 $('panelMeta').textContent='Department of Justice · FARA';
 $('countryOverview').replaceChildren(el('strong','','Choose a country'),
  el('p','muted','Select a country on the map to see its foreign principals, U.S. registrants, documented purpose and filing activity.'));
 $('coverageNote').textContent='Select a country to load its DOJ FARA relationships.';
 $('purposeList').replaceChildren(el('p','muted','Select a country to load reviewed filing summaries.'));
 $('moneyEvidenceList').replaceChildren(el('p','muted','Select a country to load verified filing totals.'));
 $('politicalContactList').replaceChildren(el('p','muted','Select a country to load named political contacts.'));
 $('relationshipList').replaceChildren(el('p','muted','Select a country to load relationships.'));
 $('activityTimeline').replaceChildren(el('p','muted','Select a country to load filing activity.'));
 $('historicalRecords').replaceChildren();
 $('historicalCount').textContent='';
 $('historicalSection').hidden=true;
 $('historicalSection').open=false;
 $('search').value='';
}

function drawMap(){
 const shell=$('mapShell'),width=Math.max(320,shell.clientWidth),height=Math.max(300,shell.clientHeight);
 svg.attr('viewBox','0 0 '+width+' '+height);
 // Country selection must retain the world map as geographic context.
 // Only the selected country's fill/outline changes. Do NOT fitExtent to
 // an individual country: that makes Ghana or Luxembourg fill the viewport.
 projection.rotate([0,0]);
 projection.fitExtent([[14,14],[width-14,height-14]],{type:'Sphere'});
 countryLayer.selectAll('path')
  .data(topologyFeatures,d=>String(d.id||d.properties?.name))
  .join('path')
  .attr('class',d=>'country'+(selected?.iso2===featureCountry(d)?.iso2?' selected':''))
  .attr('d',geoPath)
  .style('--fill',d=>countryStates(featureCountry(d)).fill)
  .style('--hover',d=>countryStates(featureCountry(d)).hover)
  .style('--selected',d=>countryStates(featureCountry(d)).selected)
  .style('--outline',d=>countryStates(featureCountry(d)).outline)
  .style('--glow',d=>countryStates(featureCountry(d)).glow)
  .attr('tabindex',d=>featureCountry(d)?0:null)
  .attr('role','button')
  .attr('aria-label',d=>'Inspect '+(featureCountry(d)?.name||d.properties?.name||'unknown country')+' FARA disclosures')
  .on('click',(event,feature)=>{const c=featureCountry(feature);if(event.detail>0&&event.currentTarget?.blur)event.currentTarget.blur();if(c)choose(c.iso2);})
  .on('keydown',(event,feature)=>{
   if(event.key==='Enter'||event.key===' '){event.preventDefault();const c=featureCountry(feature);if(c)choose(c.iso2);}
  })
  .on('mouseenter',(event,feature)=>{
   const c=featureCountry(feature);if(!c)return;
   const tip=$('tooltip');tip.textContent=c.name+(snapshot?.countries?.[c.iso2]?' · '+displayNumber(snapshot.countries[c.iso2].principals)+' indexed principals':' · no indexed principals');
   tip.style.display='block';moveTooltip(event);
  })
  .on('mousemove',moveTooltip)
  .on('mouseleave',()=>{$('tooltip').style.display='none';});
 // World-scale small countries still need a readable selection target.
 // This label does not distort their geographic size or move the map.
 selectionLayer.selectAll('*').remove();
 if(selected&&topologyFeatures.length){
  const feature=topologyFeatures.find(f=>featureCountry(f)?.iso2===selected.iso2);
  if(feature){
   const point=geoPath.centroid(feature);
   if(point.every(Number.isFinite)){
    const colors=countryStates(selected),isRight=point[0]>width-155;
    const marker=selectionLayer.append('g').attr('class','foreignSelectedMarker')
     .attr('transform','translate('+point[0]+','+point[1]+')')
     .style('--markerColor',colors.selected).style('--markerGlow',colors.glow)
     .attr('aria-hidden','true');
    marker.append('circle').attr('class','foreignSelectionHalo').attr('r',12);
    marker.append('circle').attr('class','foreignSelectionDot').attr('r',4);
    marker.append('text').attr('x',isRight?-21:21).attr('y',-12)
     .attr('text-anchor',isRight?'end':'start').text(selected.name);
   }
  }
 }
 $('mapSvg').style.setProperty('--k','1');
}
function moveTooltip(event){
 const tip=$('tooltip');tip.style.left=(event.clientX+18)+'px';tip.style.top=(event.clientY+16)+'px';
}


function usDateValue(value){
 const match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value||'').trim());
 if(!match)return 0;
 return Date.UTC(Number(match[3]),Number(match[1])-1,Number(match[2]));
}
function recordYear(value){
 const match=String(value||'').match(/(?:19|20)\d{2}/g);
 return match?.length?Number(match[match.length-1]):null;
}
function splitHistoricalRecords(records=[],iso=selected?.iso2){
 const modern=[],historical=[];
 for(const entry of Array.isArray(records)?records:[]){
  const terminatedYear=recordYear(entry.terminatedAt);
  const legacyRussia=iso==='RU'&&/(?:\bussr\b|u\.?s\.?s\.?r\.?|soviet|union of soviet socialist republics)/i.test(String(entry.principalName||''));
  const oldTerminated=entry.status==='terminated'&&Number.isFinite(terminatedYear)&&terminatedYear<2000;
  (legacyRussia||oldTerminated?historical:modern).push(entry);
 }
 return {modern,historical};
}
function latestFiling(records=[]){
 let best=null,bestValue=0;
 const seen=new Set();
 for(const entry of records){
  for(const doc of Array.isArray(entry.documents)?entry.documents:[]){
   if(!safeFaraDocument(doc?.url)||seen.has(doc.url))continue;
   seen.add(doc.url);
   const value=usDateValue(doc.filed);
   if(value>bestValue){bestValue=value;best=doc.filed;}
  }
 }
 return best;
}
function sortRecent(a,b){
 if(a.status!==b.status)return a.status==='active'?-1:1;
 return (usDateValue(b.registeredAt)||0)-(usDateValue(a.registeredAt)||0)||
  String(a.principalName||'').localeCompare(String(b.principalName||''));
}
function relationshipGroups(records,search=''){
 const filtered=selectedPrincipalRecords({principals:records},search).slice().sort(sortRecent);
 const groups=new Map();
 for(const entry of filtered){
  const key=String(entry.registrationNumber||'')+'|'+String(entry.registrantName||'');
  if(!groups.has(key))groups.set(key,{registrationNumber:entry.registrationNumber,registrantName:entry.registrantName,rows:[],principals:new Set(),active:0,latestFiling:null,latestValue:0,source:null});
  const group=groups.get(key);
  group.rows.push(entry);group.principals.add(entry.principalName);
  if(entry.status==='active')group.active++;
  if(!group.source&&safeFaraDocument(entry.allRegistrantDocumentsUrl))group.source=entry.allRegistrantDocumentsUrl;
  for(const doc of Array.isArray(entry.documents)?entry.documents:[]){
   if(!safeFaraDocument(doc?.url))continue;
   const value=usDateValue(doc.filed);
   if(value>group.latestValue){group.latestValue=value;group.latestFiling=doc.filed;}
  }
 }
 return [...groups.values()].sort((a,b)=>(b.active-a.active)||(b.latestValue-a.latestValue)||(b.rows.length-a.rows.length)||String(a.registrantName).localeCompare(String(b.registrantName)));
}
function reviewedRegistrationCount(records){
 const available=new Set((insightIndex?.registrations||[]).map(x=>String(x.registrationNumber||'')));
 if(!available.size)return 0;
 return new Set(records.map(x=>String(x.registrationNumber||'')).filter(id=>available.has(id))).size;
}
function renderCountryOverview(country,record,modern,historical){
 const card=$('countryOverview');card.replaceChildren();
 card.style.setProperty('--cardGlow',countryStates(country).glow);
 card.append(el('div','faraSectionLabel','COUNTRY NETWORK'));
 card.append(el('p','countryNetworkHeadline',displayNumber(record.principals)+' foreign-principal records · '+displayNumber(record.registrants)+' U.S. registrant entities'));
 const metrics=el('div','faraCountryMetrics');
 const addStat=(title,value)=>{const x=el('div','faraMetric');x.append(el('span','',title),el('strong','',value));metrics.append(x);};
 addStat('Total principals',displayNumber(record.principals));
 addStat('Current principals',displayNumber(record.active));
 addStat('U.S. registrants',displayNumber(record.registrants));
 addStat('Historical separated',displayNumber(historical.length));
 card.append(metrics);
 const status=el('div','countryIntelStatus');
 const latest=latestFiling(modern);
 const activity=el('div','intelStatusItem');activity.append(el('span','','Latest indexed filing'),el('strong','',latest||'No dated filing'));
 const reviewed=el('div','intelStatusItem');reviewed.append(el('span','','Reviewed supplemental statements'),el('strong','',displayNumber(reviewedRegistrationCount(modern))));
 status.append(activity,reviewed);card.append(status);
 $('coverageNote').textContent='Money below is reported at the U.S.-registrant filing level and is not added into a country total unless it can be safely attributed. Political contacts appear only when a filing provides an itemized principal, date, contact, method and purpose.';
}
function renderRelationshipList(records){
 const list=$('relationshipList');list.replaceChildren();
 const groups=relationshipGroups(records,$('search').value);
 if(!groups.length){list.append(el('p','muted','No current or recent relationships match this search.'));return;}
 for(const group of groups.slice(0,14)){
  const row=el('article','relationshipRow');
  const principals=[...group.principals];
  const principalLabel=principals.length===1?principals[0]:principals[0]+' + '+(principals.length-1)+' more';
  const flow=el('div','relationshipFlow');
  flow.append(el('strong','relationPrincipal',principalLabel),el('span','relationArrow','→'),el('strong','relationRegistrant',group.registrantName||'Registrant not named'));
  row.append(flow);
  if(principals.length>1)row.append(el('p','relationPrincipalList',principals.slice(0,4).join(' · ')+(principals.length>4?' · +'+(principals.length-4)+' more':'')));
  const bits=['DOJ #'+group.registrationNumber];
  if(group.active)bits.push(group.active+' current principal'+(group.active===1?'':'s'));
  else bits.push('terminated');
  if(group.latestFiling)bits.push('latest filing '+group.latestFiling);
  row.append(el('p','relationMeta',bits.join(' · ')));
  if(group.source){const link=sourceAnchor(group.source,'DOJ filing index ↗');link.className='relationSource';row.append(link);}
  list.append(row);
 }
 if(groups.length>14)list.append(el('p','intelFoot',displayNumber(groups.length-14)+' additional registrant relationships match this view. Use search to narrow the network.'));
}
function renderTimeline(records){
 const container=$('activityTimeline');container.replaceChildren();
 const years=new Map(),seenDocs=new Set();
 const bucket=year=>{
  if(!Number.isFinite(year))return null;
  if(!years.has(year))years.set(year,{year,registrations:0,terminations:0,filings:0});
  return years.get(year);
 };
 for(const entry of records){
  const r=bucket(recordYear(entry.registeredAt));if(r)r.registrations++;
  const t=bucket(recordYear(entry.terminatedAt));if(t)t.terminations++;
  for(const doc of Array.isArray(entry.documents)?entry.documents:[]){
   const url=safeFaraDocument(doc?.url);if(!url||seenDocs.has(url))continue;
   seenDocs.add(url);const f=bucket(recordYear(doc.filed));if(f)f.filings++;
  }
 }
 const rows=[...years.values()].sort((a,b)=>b.year-a.year).slice(0,10);
 if(!rows.length){container.append(el('p','muted','No dated registration or filing activity is available in this country snapshot.'));return;}
 for(const item of rows){
  const row=el('div','timelineRow');
  row.append(el('strong','timelineYear',item.year));
  const events=[];
  if(item.filings)events.push(item.filings+' DOJ filing'+(item.filings===1?'':'s'));
  if(item.registrations)events.push(item.registrations+' principal registration'+(item.registrations===1?'':'s'));
  if(item.terminations)events.push(item.terminations+' termination'+(item.terminations===1?'':'s'));
  row.append(el('span','timelineEvents',events.join(' · ')));
  container.append(row);
 }
}
function renderHistoricalRecords(records){
 const details=$('historicalSection'),container=$('historicalRecords');
 container.replaceChildren();$('historicalCount').textContent=records.length?'('+displayNumber(records.length)+')':'';
 details.hidden=!records.length;
 if(!records.length)return;
 const matches=selectedPrincipalRecords({principals:records},$('search').value).slice().sort(sortRecent);
 if($('search').value.trim()&&matches.length)details.open=true;
 if(!matches.length){container.append(el('p','muted','No historical records match this search.'));return;}
 for(const entry of matches.slice(0,12)){
  const row=el('article','historicalRow');
  row.append(el('strong','',entry.principalName));
  row.append(el('p','',entry.registrantName||'Registrant not named'));
  const dates=[entry.registeredAt?'registered '+entry.registeredAt:null,entry.terminatedAt?'terminated '+entry.terminatedAt:null].filter(Boolean).join(' · ');
  row.append(el('small','',dates+' · DOJ #'+entry.registrationNumber));
  const source=safeFaraDocument(entry.allRegistrantDocumentsUrl);
  if(source){const link=sourceAnchor(source,'Source ↗');link.className='historicalSource';row.append(link);}
  container.append(row);
 }
 if(matches.length>12)container.append(el('p','intelFoot',displayNumber(matches.length-12)+' additional historical records are retained in the DOJ snapshot.'));
}
const insightRequests=new Map();
function requestInsight(id){
 if(!/^\d{1,6}$/.test(String(id||'')))return Promise.resolve(null);
 if(!insightRequests.has(id)){
  insightRequests.set(id,fetch('assets/data/foreign-influence/filing-insights/'+id+'.json',{cache:'no-cache'})
   .then(r=>r.ok?r.json():null).catch(()=>null));
 }
 return insightRequests.get(id);
}
function availableInsightGroups(records){
 const groups=relationshipGroups(records,'');
 const available=new Set((insightIndex?.registrations||[]).map(x=>String(x.registrationNumber||'')));
 return (available.size?groups.filter(g=>available.has(String(g.registrationNumber))):groups).slice(0,60);
}
function principalMatches(summary,group){
 const names=new Set((Array.isArray(summary?.namedPrincipals)?summary.namedPrincipals:[]).map(n=>String(n).trim().toLowerCase()));
 return [...group.principals].filter(n=>names.has(String(n).trim().toLowerCase()));
}
function renderMoneyEvidence(results,query){
 const list=$('moneyEvidenceList');list.replaceChildren();
 const needle=String(query||'').trim().toLowerCase();
 const rows=results.filter(({group,summary,principals})=>{
  if(summary.moneyStatus!=='verified_filing_totals')return false;
  if(!Number.isFinite(summary.totalReceivedUsd)&&!Number.isFinite(summary.totalDisbursedUsd))return false;
  if(!needle)return true;
  return [group.registrantName,...principals,summary.moneyExplanation].some(x=>String(x||'').toLowerCase().includes(needle));
 });
 if(!rows.length){
  const excluded=results.filter(x=>x.summary?.moneyStatus==='placeholder_not_actual').length;
  list.append(el('p','muted',excluded?
   'No verified filing totals match this view. '+displayNumber(excluded)+' reviewed filing'+(excluded===1?' contains':'s contain')+' explicitly non-actual placeholder amounts, which are excluded.':
   'No verified registrant-level filing totals are available in the reviewed statements for this country yet.'));
  return;
 }
 for(const {group,summary,principals} of rows.slice(0,12)){
  const item=el('article','moneyEvidenceItem');
  item.append(el('strong','moneyRegistrant',group.registrantName||'U.S. registrant'));
  if(principals.length)item.append(el('span','moneyPrincipals','Foreign principal'+(principals.length===1?'':'s')+' named in filing: '+principals.slice(0,3).join(' · ')+(principals.length>3?' · +'+(principals.length-3)+' more':'')));
  const totals=el('div','filingMoneyTotals');
  const add=(label,value)=>{const box=el('div','filingMoneyMetric');box.append(el('span','',label),el('b','',Number.isFinite(value)?moneyExact(value):'Not reported'));totals.append(box);};
  add('Total receipts',summary.totalReceivedUsd);add('Total disbursements',summary.totalDisbursedUsd);
  item.append(totals);
  item.append(el('p','filingScopeNote','Registrant-level total for this supplemental filing; not automatically a principal-specific payment.'));
  const footer=el('div','purposeFooter');
  if(summary.periodEnd)footer.append(el('span','','Period ending '+summary.periodEnd));
  footer.append(sourceAnchor(summary.sourceUrl,'Reviewed DOJ filing ↗'));item.append(footer);
  list.append(item);
 }
 if(rows.length>12)list.append(el('p','intelFoot',displayNumber(rows.length-12)+' additional reviewed filings contain verified totals.'));
}
function renderPoliticalContacts(results,query){
 const list=$('politicalContactList');list.replaceChildren();
 const needle=String(query||'').trim().toLowerCase(),rows=[],seen=new Set();
 for(const {group,summary,principals} of results){
  const principalSet=new Set(principals.map(x=>String(x).trim().toLowerCase()));
  for(const contact of Array.isArray(summary.politicalContacts)?summary.politicalContacts:[]){
   if(!principalSet.has(String(contact.principal||'').trim().toLowerCase()))continue;
   const row={...contact,registrantName:group.registrantName,sourceUrl:summary.sourceUrl};
   const key=[row.principal,row.date,row.contact,row.method,row.purpose,row.sourceUrl].join('|').toLowerCase();
   if(seen.has(key))continue;seen.add(key);
   if(needle&&![row.principal,row.contact,row.method,row.purpose,row.registrantName].some(x=>String(x||'').toLowerCase().includes(needle)))continue;
   rows.push(row);
  }
 }
 rows.sort((a,b)=>usDateValue(b.date)-usDateValue(a.date)||String(a.contact).localeCompare(String(b.contact)));
 if(!rows.length){list.append(el('p','muted','No itemized U.S. political-contact rows are available in the reviewed filings for this country yet.'));return;}
 for(const row of rows.slice(0,18)){
  const item=el('article','politicalContactItem');
  const flow=el('div','contactFlow');flow.append(el('strong','contactPrincipal',row.principal),el('span','relationArrow','→'),el('strong','contactName',row.contact));
  item.append(flow);
  item.append(el('p','contactMeta',[row.date,row.method,row.registrantName].filter(Boolean).join(' · ')));
  if(row.purpose)item.append(el('p','contactPurpose',row.purpose));
  item.append(sourceAnchor(row.sourceUrl,'Source filing ↗'));
  list.append(item);
 }
 if(rows.length>18)list.append(el('p','intelFoot',displayNumber(rows.length-18)+' additional named political-contact entries match this view.'));
}
async function renderExtractedInsights(records,token){
 const purpose=$('purposeList');
 const moneyList=$('moneyEvidenceList');
 const contactList=$('politicalContactList');
 purpose.replaceChildren(el('p','muted','Checking reviewed original filings…'));
 moneyList.replaceChildren(el('p','muted','Checking reviewed filing totals…'));
 contactList.replaceChildren(el('p','muted','Checking itemized political contacts…'));
 const query=$('search').value;
 const groups=availableInsightGroups(records);
 const loaded=await Promise.all(groups.map(async group=>({group,summary:await requestInsight(String(group.registrationNumber))})));
 if(token!==renderVersion||query!==$('search').value||!purpose.isConnected)return;
 const results=[];
 for(const {group,summary} of loaded){
  if(!summary||Number(summary.schemaVersion)<1||summary.registrationNumber!==String(group.registrationNumber)||!safeFaraDocument(summary.sourceUrl))continue;
  const principals=principalMatches(summary,group);
  if(!principals.length)continue;
  results.push({group,summary,principals});
 }
 purpose.replaceChildren();
 const needle=query.trim().toLowerCase();
 let shown=0;
 for(const {group,summary,principals} of results){
  if(typeof summary.servicesSummary!=='string'||!summary.servicesSummary.trim())continue;
  if(needle&&![group.registrantName,...principals,summary.servicesSummary].some(x=>String(x||'').toLowerCase().includes(needle)))continue;
  const item=el('article','purposeItem');
  item.append(el('strong','purposePrincipal',principals.slice(0,3).join(' · ')+(principals.length>3?' · +'+(principals.length-3)+' more':'')),
              el('span','purposeAgent','U.S. registrant: '+group.registrantName));
  item.append(el('p','purposeText',summary.servicesSummary));
  const footer=el('div','purposeFooter');
  if(summary.periodEnd)footer.append(el('span','','Reporting period ending '+summary.periodEnd));
  footer.append(sourceAnchor(summary.sourceUrl,'Reviewed DOJ filing ↗'));item.append(footer);
  purpose.append(item);shown++;if(shown>=8)break;
 }
 if(!shown)purpose.append(el('p','muted','No reviewed purpose summary matches this view yet. The relationship network and filing timeline still come directly from the DOJ registry.'));
 renderMoneyEvidence(results,query);
 renderPoliticalContacts(results,query);
}
function renderCountryIntel(){
 if(!detail||!selected)return;
 const all=Array.isArray(detail.principals)?detail.principals:[];
 const {modern,historical}=splitHistoricalRecords(all,selected.iso2);
 const record=countrySummary(snapshot,selected.iso2);
 renderCountryOverview(selected,record,modern,historical);
 renderRelationshipList(modern);
 renderTimeline(modern);
 renderHistoricalRecords(historical);
 renderExtractedInsights(modern,renderVersion);
}
async function choose(iso){
 if(!isIso2(iso)||!byIso.has(iso))return;
 const country=byIso.get(iso),token=++renderVersion;
 selected=country;detail=null;
 const record=countrySummary(snapshot,iso);
 $('panelTitle').textContent=country.name;
 $('panelMeta').textContent='Loading DOJ FARA relationships…';
 $('search').value='';
 $('countryOverview').replaceChildren(el('strong','','Loading '+country.name+'…'),el('p','muted','Retrieving foreign principals, U.S. registrants and filing activity.'));
 $('coverageNote').textContent='Loading the latest published DOJ registry snapshot…';
 $('purposeList').replaceChildren(el('p','muted','Loading reviewed filing summaries…'));
 $('moneyEvidenceList').replaceChildren(el('p','muted','Loading verified filing totals…'));
 $('politicalContactList').replaceChildren(el('p','muted','Loading named political contacts…'));
 $('relationshipList').replaceChildren(el('p','muted','Loading relationships…'));
 $('activityTimeline').replaceChildren(el('p','muted','Loading activity timeline…'));
 $('historicalRecords').replaceChildren();$('historicalSection').hidden=true;$('historicalSection').open=false;
 drawMap();showLabel(country.name,record.principals);
 history.replaceState(null,'','#/country/'+encodeURIComponent(iso));
 try{
  const response=await fetch('assets/data/foreign-influence/countries/'+iso+'.json',{cache:'no-cache'});
  if(!response.ok)throw Error('No published country dataset');
  const json=await response.json();
  if(token!==renderVersion||json.countryCode!==iso)return;
  detail=json;renderCountryIntel();
  $('panelMeta').textContent='DOJ source checked '+new Date(json.checkedAt).toLocaleDateString('en-US');
 }catch(_){
  if(token!==renderVersion)return;
  $('countryOverview').replaceChildren(el('strong','',country.name),el('p','muted','The country summary is available, but the detailed relationship file could not be loaded.'));
  $('coverageNote').textContent=snapshot?.countries?.[iso]?
   'Detailed country records could not be loaded from the latest published snapshot.':
   'No foreign-principal records for this country were indexed in the latest DOJ bulk snapshot.';
  $('purposeList').replaceChildren(el('p','muted','No detailed filing summaries loaded.'));
  $('moneyEvidenceList').replaceChildren(el('p','muted','No detailed filing totals loaded.'));
  $('politicalContactList').replaceChildren(el('p','muted','No detailed political contacts loaded.'));
  $('relationshipList').replaceChildren(el('p','muted','No detailed relationships loaded.'));
  $('activityTimeline').replaceChildren(el('p','muted','No detailed filing activity loaded.'));
 }
}
function reset(){
 selected=null;detail=null;++renderVersion;
 history.replaceState(null,'','#/world');resetSidebar();drawMap();
 $('mapLabel').textContent='Choose a country to inspect DOJ FARA registrations';
}
function initEvents(){
 $('search').addEventListener('input',()=>{
  if(!detail||!selected)return;
  const {modern,historical}=splitHistoricalRecords(detail.principals,selected.iso2);
  renderRelationshipList(modern);renderHistoricalRecords(historical);renderExtractedInsights(modern,renderVersion);
 });
 window.addEventListener('resize',()=>{if(topologyFeatures.length)drawMap();});
 window.addEventListener('keydown',event=>{if(event.key==='Escape')reset();});
}
async function load(){
 initEvents();resetSidebar();
 try{
  const topoResponse=await fetch('assets/vendor/foreign-countries-50m.json',{cache:'force-cache'});
  if(!topoResponse.ok)throw Error('World geography unavailable');
  const topology=await topoResponse.json();
  topologyFeatures=topojson.feature(topology,topology.objects.countries).features;
  $('loading').hidden=true;
  drawMap();
 }catch(_){$('loading').textContent='Could not load world outlines.';}
 try{
  const res=await fetch('assets/data/foreign-influence/latest.json',{cache:'no-cache'});
  if(!res.ok)throw Error('FARA snapshot missing');
  const data=await res.json();
  if(data.schemaVersion!==1||!data.countries)throw Error('Unrecognized FARA schema');
  snapshot=data;
  $('statCountries').textContent=displayNumber(data.countryCount);
  $('statPrincipals').textContent=displayNumber(data.registeredPrincipals);
  $('sourceNote').append(el('span','sourceFreshness',' · DOJ source checked '+new Date(data.checkedAt).toLocaleDateString('en-US')));
 }catch(_){
  $('statCountries').textContent='Pending';
  $('statPrincipals').textContent='Pending';
  $('sourceNote').append(el('span','sourceFreshness',' · Daily registry snapshot has not been published yet.'));
 }
 try{
  const insightRes=await fetch('assets/data/foreign-influence/filing-insights/index.json',{cache:'no-cache'});
  if(insightRes.ok){
   const index=await insightRes.json();
   if(index.schemaVersion===1&&Array.isArray(index.registrations))insightIndex=index;
  }
 }catch(_){insightIndex=null;}
 const route=decodeURIComponent(location.hash.split('/')[2]||'').toUpperCase();
 if(isIso2(route)&&byIso.has(route))choose(route);
}
load();

/* Foreign Influence — POLITICS.
 * Registry directory built from the DOJ FARA bulk registry.
 * The product surface is intentionally narrow: registered foreign principals,
 * U.S. registrants, registration status/dates, and source-verified
 * registrant-level financial totals. */
import {COUNTRIES} from './foreign-world-catalog.js';
import {countryStates} from './foreign-world-colors.js';
import {countrySummary,isIso2,safeFaraDocument} from './foreign-influence-model.mjs';

const $=id=>document.getElementById(id);
const svg=d3.select('#mapSvg');
const countryLayer=svg.append('g').attr('class','countries');
const selectionLayer=svg.append('g').attr('class','foreignMapSelection');
const byNumeric=new Map(COUNTRIES.filter(c=>c.numeric).map(c=>[String(c.numeric).padStart(3,'0'),c]));
const byName=new Map(COUNTRIES.flatMap(c=>[c.name,...(c.atlasNames||[])].map(n=>[n.toLowerCase(),c])));
const byIso=new Map(COUNTRIES.map(c=>[c.iso2,c]));
const millerRaw=(lambda,phi)=>[lambda,1.25*Math.log(Math.tan(Math.PI/4+.4*phi))];
millerRaw.invert=(x,y)=>[x,2.5*Math.atan(Math.exp(.8*y))-.625*Math.PI];
const projection=d3.geoProjection(millerRaw);
const geoPath=d3.geoPath(projection);

let topologyFeatures=[];
let selected=null;
let snapshot=null;
let detail=null;
let insightIndex=null;
let moneyRows=[];
let renderVersion=0;

const displayNumber=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-US'):'—';
const moneyExact=n=>new Intl.NumberFormat('en-US',{
 style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2
}).format(n);

function featureCountry(feature){
 return byNumeric.get(String(feature.id||'').padStart(3,'0'))||
  byName.get(String(feature.properties?.name||'').toLowerCase())||null;
}
function el(tag,className='',content=''){
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(content!==null&&content!==undefined)node.textContent=String(content);
 return node;
}
function sourceAnchor(url,title){
 const link=document.createElement('a');
 link.href=url;link.textContent=title;link.target='_blank';link.rel='noopener noreferrer';
 return link;
}
function safeRegistryUrl(value){
 const raw=String(value||'').trim();
 return /^https:\/\/efile\.fara\.gov\/api\/v1\/RegDocs\/json\/\d{1,6}$/i.test(raw)?raw:null;
}
function searchNeedle(){
 return String($('search').value||'').trim().toLowerCase();
}
function matchesRegistration(row,needle){
 if(!needle)return true;
 return [
  row.principalName,row.registrantName,row.registrationNumber,row.status,
  row.registeredAt,row.terminatedAt
 ].some(value=>String(value||'').toLowerCase().includes(needle));
}
function usDateValue(value){
 const match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value||'').trim());
 if(!match)return 0;
 return Date.UTC(Number(match[3]),Number(match[1])-1,Number(match[2]));
}
function sortRegistrations(a,b){
 if(a.status!==b.status)return a.status==='active'?-1:1;
 return (usDateValue(b.registeredAt)||0)-(usDateValue(a.registeredAt)||0)||
  String(a.principalName||'').localeCompare(String(b.principalName||''));
}
function groupedRegistrations(records=[]){
 const groups=new Map();
 for(const row of records){
  const id=String(row.registrationNumber||'');
  if(!groups.has(id))groups.set(id,{
   registrationNumber:id,
   registrantName:row.registrantName||'Registrant not listed',
   principals:new Set(),
   source:safeRegistryUrl(row.allRegistrantDocumentsUrl)
  });
  groups.get(id).principals.add(row.principalName);
 }
 return groups;
}
function showLabel(name,count){
 $('mapLabel').textContent=name+' · '+displayNumber(count)+' registered foreign principals';
}
function moveTooltip(event){
 const tip=$('tooltip');
 tip.style.left=(event.clientX+18)+'px';
 tip.style.top=(event.clientY+16)+'px';
}

function resetSidebar(){
 $('panelTitle').textContent='World';
 $('panelMeta').textContent='United States · Department of Justice FARA';
 $('countryOverview').replaceChildren(
  el('strong','','Choose a country'),
  el('p','muted','Select a country to see its registered foreign principals and U.S. registrants.')
 );
 $('registrationDirectory').replaceChildren(el('p','muted','Select a country to load registrations.'));
 $('moneyRegistry').replaceChildren(el('p','muted','Select a country to load verified financial totals.'));
 $('registrationCount').textContent='';
 $('moneyCount').textContent='';
 $('search').value='';
 moneyRows=[];
}

function drawMap(){
 const shell=$('mapShell');
 const width=Math.max(320,shell.clientWidth),height=Math.max(300,shell.clientHeight);
 svg.attr('viewBox','0 0 '+width+' '+height);
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
  .attr('aria-label',d=>'Inspect '+(featureCountry(d)?.name||d.properties?.name||'unknown country')+' FARA registrations')
  .on('click',(event,feature)=>{
   const country=featureCountry(feature);
   if(event.detail>0&&event.currentTarget?.blur)event.currentTarget.blur();
   if(country)choose(country.iso2);
  })
  .on('keydown',(event,feature)=>{
   if(event.key==='Enter'||event.key===' '){
    event.preventDefault();
    const country=featureCountry(feature);
    if(country)choose(country.iso2);
   }
  })
  .on('mouseenter',(event,feature)=>{
   const country=featureCountry(feature);if(!country)return;
   const count=snapshot?.countries?.[country.iso2]?.principals;
   const tip=$('tooltip');
   tip.textContent=country.name+(Number.isFinite(count)?' · '+displayNumber(count)+' registered principals':' · no indexed principals');
   tip.style.display='block';moveTooltip(event);
  })
  .on('mousemove',moveTooltip)
  .on('mouseleave',()=>{$('tooltip').style.display='none';});

 selectionLayer.selectAll('*').remove();
 if(selected&&topologyFeatures.length){
  const feature=topologyFeatures.find(item=>featureCountry(item)?.iso2===selected.iso2);
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

function renderCountryOverview(country,summary,records){
 const card=$('countryOverview');
 card.replaceChildren();
 card.style.setProperty('--cardGlow',countryStates(country).glow);
 card.append(el('div','faraSectionLabel','FARA REGISTRY'));
 card.append(el('p','countryNetworkHeadline',
  displayNumber(summary.principals)+' foreign-principal records · '+
  displayNumber(summary.registrants)+' U.S. registrants'
 ));
 const metrics=el('div','faraCountryMetrics');
 const add=(label,value)=>{
  const box=el('div','faraMetric');
  box.append(el('span','',label),el('strong','',value));
  metrics.append(box);
 };
 add('Registered principals',displayNumber(summary.principals));
 add('Active principals',displayNumber(summary.active));
 add('U.S. registrants',displayNumber(summary.registrants));
 add('Terminated records',displayNumber(records.filter(row=>row.status==='terminated').length));
 card.append(metrics);
}

function renderRegistrationDirectory(){
 const container=$('registrationDirectory');
 container.replaceChildren();
 const needle=searchNeedle();
 const records=(Array.isArray(detail?.principals)?detail.principals:[])
  .filter(row=>matchesRegistration(row,needle))
  .slice()
  .sort(sortRegistrations);

 $('registrationCount').textContent=displayNumber(records.length)+' records';
 if(!records.length){
  container.append(el('p','muted','No registrations match this search.'));
  return;
 }

 const head=el('div','registryHeader registrationHeader');
 head.append(
  el('span','','Foreign principal / organization'),
  el('span','','U.S. registered agent / registrant'),
  el('span','','Registration'),
  el('span','','Status')
 );
 container.append(head);

 for(const row of records){
  const item=el('article','registryRow registrationRow');
  const principal=el('div','registryCell principalCell');
  principal.append(el('strong','',row.principalName||'Principal not listed'));

  const registrant=el('div','registryCell registrantCell');
  registrant.append(el('strong','',row.registrantName||'Registrant not listed'));

  const registration=el('div','registryCell registrationCell');
  registration.append(el('strong','','DOJ #'+row.registrationNumber));
  if(row.registeredAt)registration.append(el('span','','Registered '+row.registeredAt));
  const source=safeRegistryUrl(row.allRegistrantDocumentsUrl);
  if(source)registration.append(sourceAnchor(source,'DOJ record ↗'));

  const status=el('div','registryCell statusCell');
  const badge=el('span','registryStatus '+(row.status==='active'?'active':'terminated'),
   row.status==='active'?'Active':'Terminated');
  status.append(badge);
  if(row.terminatedAt)status.append(el('span','','Ended '+row.terminatedAt));

  item.append(principal,registrant,registration,status);
  container.append(item);
 }
}

async function fetchMoneyRows(records,token){
 const groups=groupedRegistrations(records);
 const available=(insightIndex?.registrations||[])
  .filter(item=>groups.has(String(item.registrationNumber||''))&&item.moneyStatus==='verified_filing_totals');

 const loaded=await Promise.all(available.map(async item=>{
  const id=String(item.registrationNumber);
  try{
   const response=await fetch('assets/data/foreign-influence/filing-insights/'+id+'.json',{cache:'no-cache'});
   if(!response.ok)return null;
   const record=await response.json();
   if(record.schemaVersion<2||record.registrationNumber!==id||record.moneyStatus!=='verified_filing_totals')return null;
   if(!safeFaraDocument(record.sourceUrl))return null;
   const group=groups.get(id);
   return {
    registrationNumber:id,
    registrantName:group.registrantName,
    principals:[...group.principals],
    totalReceivedUsd:Number.isFinite(record.totalReceivedUsd)?record.totalReceivedUsd:null,
    totalDisbursedUsd:Number.isFinite(record.totalDisbursedUsd)?record.totalDisbursedUsd:null,
    periodEnd:record.periodEnd||null,
    sourceUrl:record.sourceUrl
   };
  }catch(_){
   return null;
  }
 }));
 if(token!==renderVersion)return;
 moneyRows=loaded.filter(Boolean)
  .filter(row=>row.totalReceivedUsd!==null||row.totalDisbursedUsd!==null)
  .sort((a,b)=>(b.totalDisbursedUsd||0)-(a.totalDisbursedUsd||0)||
   (b.totalReceivedUsd||0)-(a.totalReceivedUsd||0)||
   a.registrantName.localeCompare(b.registrantName));
 renderMoneyRegistry();
 renderCountryOverview(selected,countrySummary(snapshot,selected.iso2),records);
}

function renderMoneyRegistry(){
 const container=$('moneyRegistry');
 container.replaceChildren();
 const needle=searchNeedle();
 const rows=moneyRows.filter(row=>{
  if(!needle)return true;
  return [
   row.registrationNumber,row.registrantName,...row.principals
  ].some(value=>String(value||'').toLowerCase().includes(needle));
 });

 $('moneyCount').textContent=displayNumber(rows.length)+' verified';
 if(!rows.length){
  container.append(el('p','muted',
   moneyRows.length?'No verified financial totals match this search.':
   'No verified registrant-level financial totals are available for this country yet.'
  ));
  return;
 }

 const head=el('div','registryHeader moneyHeader');
 head.append(
  el('span','','U.S. registrant'),
  el('span','','Foreign principals on registration'),
  el('span','','Total received'),
  el('span','','Total disbursed')
 );
 container.append(head);

 for(const row of rows){
  const item=el('article','registryRow moneyRegistryRow');

  const registrant=el('div','registryCell moneyRegistrantCell');
  registrant.append(el('strong','',row.registrantName));
  registrant.append(el('span','','DOJ #'+row.registrationNumber));
  if(row.periodEnd)registrant.append(el('span','','Period ending '+row.periodEnd));
  registrant.append(sourceAnchor(row.sourceUrl,'DOJ financial source ↗'));

  const principals=el('div','registryCell moneyPrincipalCell');
  principals.append(el('span','',
   row.principals.slice(0,4).join(' · ')+(row.principals.length>4?' · +'+(row.principals.length-4)+' more':'')
  ));

  const received=el('div','registryCell moneyValueCell');
  received.append(el('strong','',row.totalReceivedUsd===null?'—':moneyExact(row.totalReceivedUsd)));

  const disbursed=el('div','registryCell moneyValueCell');
  disbursed.append(el('strong','',row.totalDisbursedUsd===null?'—':moneyExact(row.totalDisbursedUsd)));

  item.append(registrant,principals,received,disbursed);
  container.append(item);
 }
}

async function choose(iso){
 if(!isIso2(iso)||!byIso.has(iso))return;
 const country=byIso.get(iso);
 const token=++renderVersion;
 selected=country;detail=null;moneyRows=[];

 $('panelTitle').textContent=country.name;
 $('panelMeta').textContent='Loading DOJ FARA registry…';
 $('search').value='';
 $('countryOverview').replaceChildren(
  el('strong','','Loading '+country.name+'…'),
  el('p','muted','Retrieving registered foreign principals and U.S. registrants.')
 );
 $('registrationDirectory').replaceChildren(el('p','muted','Loading registrations…'));
 $('moneyRegistry').replaceChildren(el('p','muted','Loading verified financial totals…'));
 $('registrationCount').textContent='';
 $('moneyCount').textContent='';
 drawMap();
 const summary=countrySummary(snapshot,iso);
 showLabel(country.name,summary.principals);
 history.replaceState(null,'','#/country/'+encodeURIComponent(iso));

 try{
  const response=await fetch('assets/data/foreign-influence/countries/'+iso+'.json',{cache:'no-cache'});
  if(!response.ok)throw Error('Country registry unavailable');
  const json=await response.json();
  if(token!==renderVersion||json.countryCode!==iso)return;
  detail=json;
  const records=Array.isArray(json.principals)?json.principals:[];
  $('panelMeta').textContent='DOJ registry checked '+new Date(json.checkedAt).toLocaleDateString('en-US');
  renderCountryOverview(country,summary,records);
  renderRegistrationDirectory();
  fetchMoneyRows(records,token);
 }catch(_){
  if(token!==renderVersion)return;
  $('countryOverview').replaceChildren(
   el('strong','',country.name),
   el('p','muted','The country registry could not be loaded from the latest DOJ snapshot.')
  );
  $('registrationDirectory').replaceChildren(el('p','muted','Registration data unavailable.'));
  $('moneyRegistry').replaceChildren(el('p','muted','Verified financial totals unavailable.'));
 }
}

function reset(){
 selected=null;detail=null;moneyRows=[];++renderVersion;
 history.replaceState(null,'','#/world');
 resetSidebar();drawMap();
 $('mapLabel').textContent='Choose a country to inspect FARA registrations';
}

function initEvents(){
 $('search').addEventListener('input',()=>{
  if(!detail)return;
  renderRegistrationDirectory();
  renderMoneyRegistry();
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
  $('loading').hidden=true;drawMap();
 }catch(_){
  $('loading').textContent='Could not load world outlines.';
 }

 try{
  const [summaryResponse,indexResponse]=await Promise.all([
   fetch('assets/data/foreign-influence/latest.json',{cache:'no-cache'}),
   fetch('assets/data/foreign-influence/filing-insights/index.json',{cache:'no-cache'})
  ]);
  if(!summaryResponse.ok)throw Error('FARA registry snapshot missing');
  const data=await summaryResponse.json();
  if(data.schemaVersion!==1||!data.countries)throw Error('Unrecognized FARA schema');
  snapshot=data;
  $('statCountries').textContent=displayNumber(data.countryCount);
  $('statPrincipals').textContent=displayNumber(data.registeredPrincipals);
  if(indexResponse.ok){
   const index=await indexResponse.json();
   if(index.schemaVersion===1&&Array.isArray(index.registrations))insightIndex=index;
  }
  $('sourceNote').append(el('span','sourceFreshness',
   ' · Registry checked '+new Date(data.checkedAt).toLocaleDateString('en-US')));
 }catch(_){
  $('statCountries').textContent='Pending';
  $('statPrincipals').textContent='Pending';
 }

 const route=decodeURIComponent(location.hash.split('/')[2]||'').toUpperCase();
 if(isIso2(route)&&byIso.has(route))choose(route);
}
load();

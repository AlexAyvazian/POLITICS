/* Foreign Influence — POLITICS. Shell, boundaries and country colors derived
 * directly from the existing Healthcare Directory. Data are DOJ FARA registries.
 * No lobbying dollar, campaign contribution or government contact is inferred. */
import {COUNTRIES} from './foreign-world-catalog.js';
import {countryStates} from './foreign-world-colors.js';
import {countrySummary,selectedPrincipalRecords,verifiedSpending,safeFaraDocument,isIso2,documentsForGroup} from './foreign-influence-model.mjs';

const $=id=>document.getElementById(id);
const svg=d3.select('#mapSvg');
const countryLayer=svg.append('g').attr('class','countries');
const byNumeric=new Map(COUNTRIES.filter(c=>c.numeric).map(c=>[String(c.numeric).padStart(3,'0'),c]));
const byName=new Map(COUNTRIES.flatMap(c=>[c.name,...(c.atlasNames||[])].map(n=>[n.toLowerCase(),c])));
const byIso=new Map(COUNTRIES.map(c=>[c.iso2,c]));
const compare=(a,b)=>a.name.localeCompare(b.name);
const countries=COUNTRIES.filter(c=>c.iso2).sort(compare);
const millerRaw=(lambda,phi)=>[lambda,1.25*Math.log(Math.tan(Math.PI/4+.4*phi))];
millerRaw.invert=(x,y)=>[x,2.5*Math.atan(Math.exp(.8*y))-.625*Math.PI];
const projection=d3.geoProjection(millerRaw);
const geoPath=d3.geoPath(projection);
let topologyFeatures=[],selected=null,snapshot=null,detail=null,showCount=24;
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
const displayNumber=n=>Number.isFinite(n)?n.toLocaleString('en-US'):'Not yet available';
function showLabel(name,count){
 const total=count===null?'not indexed':displayNumber(count)+' listed principals';
 $('mapLabel').textContent=name+' · '+total;
}
function resetSidebar(){
 $('panelTitle').textContent='World';
 $('panelMeta').textContent='Department of Justice · FARA';
 $('selectedCard').replaceChildren(el('strong','','Choose a country'),
  el('p','muted','Select a country on the map or from the country list to view its FARA records.'));
 $('facilityList').replaceChildren();
 $('listLabel').textContent='Select a country to explore the source documents.';
 $('loadMore').hidden=true;
 $('search').value='';$('statusFilter').value='all';$('documentFilter').value='all';
}
function renderCountryChips(){
 const term=$('regionFilter').value.toLowerCase().trim();
 const container=$('regionList');container.replaceChildren();
 for(const item of countries.filter(c=>!term||c.name.toLowerCase().includes(term))){
  const button=el('button','chip');
  button.type='button';button.setAttribute('role','listitem');
  button.setAttribute('aria-pressed',String(selected?.iso2===item.iso2));
  const colors=countryStates(item);
  button.style.setProperty('--fill',colors.fill);
  button.style.setProperty('--glow',colors.glow);
  const swatch=el('i','swatch');swatch.setAttribute('aria-hidden','true');
  button.append(swatch,el('span','',item.name));
  if(snapshot?.countries?.[item.iso2]){
   const n=el('small','countryIndexCount',String(snapshot.countries[item.iso2].principals));
   button.append(n);
  }
  if(selected?.iso2===item.iso2)button.classList.add('sel');
  button.addEventListener('click',()=>choose(item.iso2));
  container.append(button);
 }
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
  .on('click',(_event,feature)=>{const c=featureCountry(feature);if(c)choose(c.iso2);})
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
 $('mapSvg').style.setProperty('--k','1');
}
function moveTooltip(event){
 const tip=$('tooltip');tip.style.left=(event.clientX+18)+'px';tip.style.top=(event.clientY+16)+'px';
}
function makeSourceLinks(record,container,group='all'){
 const docs=documentsForGroup(record.documents,group);
 if(docs.length){
  const small=el('div','faraDocsTitle','Original DOJ filing documents');
  container.append(small);
  for(const doc of docs){
   const url=safeFaraDocument(doc.url);if(!url)continue;
   const link=sourceAnchor(url,(doc.type||'FARA document')+(doc.filed?' · '+doc.filed:'')+' ↗');
   link.className='faraDocumentLink';
   container.append(link);
  }
 }
 const url=safeFaraDocument(record.allRegistrantDocumentsUrl);
 if(url)container.append(sourceAnchor(url,'All DOJ filings for this registrant ↗'));
}
function renderPrincipals(){
 const list=$('facilityList');list.replaceChildren();
 $('loadMore').hidden=true;
 if(!detail||!selected)return;
 const status=$('statusFilter').value;
 const group=$('documentFilter').value;
 const filtered=selectedPrincipalRecords(detail,$('search').value)
  .filter(p=>status==='all'||p.status===status)
  .filter(p=>group==='all'||documentsForGroup(p.documents,group).length>0);
 $('listLabel').textContent=displayNumber(filtered.length)+(group==='all'?' principal records':' records with matching indexed filing links')+' · Showing '+Math.min(showCount,filtered.length);
 for(const entry of filtered.slice(0,showCount)){
  const card=el('article','facility faraPrincipal');
  const badge=el('span','badge',entry.status==='active'?'Active in registry':'Terminated');
  const title=el('h3','',entry.principalName);
  const registrant=el('p','faraAgent','Registrant: '+entry.registrantName);
  const meta=el('p','faraDates','DOJ registration #'+entry.registrationNumber+
    (entry.registeredAt?' · First registered '+entry.registeredAt:'')+
    (entry.terminatedAt?' · Terminated '+entry.terminatedAt:''));
  card.append(badge,title,registrant,meta);
  makeSourceLinks(entry,card,group);
  list.append(card);
 }
 $('loadMore').hidden=filtered.length<=showCount;
 if(!filtered.length){
  list.append(el('p','muted',group==='all'?'No entries match these filters in the available DOJ registry snapshot.':'No matching links in the displayed filing sample. This does not mean no such filings exist. Use each registrant’s complete DOJ filing index.'));
 }
}
async function choose(iso){
 if(!isIso2(iso)||!byIso.has(iso))return;
 const country=byIso.get(iso),token=++renderVersion;
 selected=country;detail=null;showCount=24;
 const record=countrySummary(snapshot,iso);
 $('panelTitle').textContent=country.name;
 $('panelMeta').textContent='Foreign principals registered under U.S. FARA';
 const card=$('selectedCard');card.replaceChildren();
 card.style.setProperty('--cardGlow',countryStates(country).glow);
 card.append(el('div','faraSectionLabel','DOJ FARA registry snapshot'));
 const metrics=el('div','faraCountryMetrics');
 const addStat=(title,value)=>{const x=el('div','faraMetric');x.append(el('span','',title),el('strong','',value));metrics.append(x);};
 addStat('Principals indexed',displayNumber(record.principals));
 addStat('Current in registry',displayNumber(record.active));
 addStat('Registrant entities',displayNumber(record.registrants));
 card.append(metrics);
 const moneyValue=verifiedSpending(snapshot?.countries?.[iso]||{});
 const cash=el('p','faraMoney','Disclosed financial totals: '+moneyValue.text);
 card.append(cash);
 $('facilityList').replaceChildren(el('p','muted','Retrieving documented foreign-principal relationships…'));
 $('listLabel').textContent='Loading records for '+country.name+'…';
 $('statusFilter').value='all';$('documentFilter').value='all';$('search').value='';
 $('countryChooser').open=false;
 renderCountryChips();
 drawMap();showLabel(country.name,record.principals);
 history.replaceState(null,'','#/country/'+encodeURIComponent(iso));
 try{
  const response=await fetch('assets/data/foreign-influence/countries/'+iso+'.json',{cache:'no-cache'});
  if(!response.ok)throw Error('No published country dataset');
  const json=await response.json();
  if(token!==renderVersion||json.countryCode!==iso)return;
  detail=json;renderPrincipals();
  $('panelMeta').textContent='DOJ source checked '+new Date(json.checkedAt).toLocaleDateString('en-US');
 }catch(_){
  if(token!==renderVersion)return;
  $('facilityList').replaceChildren(el('p','muted',snapshot?.countries?.[iso]?
   'This country’s latest registry detail could not be loaded. The country summary remains available.':
   'No foreign-principal records for this country were indexed in the latest available FARA bulk snapshot. This is not proof of no foreign lobbying.'));
  $('listLabel').textContent='No verified country records loaded';
 }
}
function reset(){
 selected=null;detail=null;++renderVersion;
 history.replaceState(null,'','#/world');resetSidebar();$('countryChooser').open=true;renderCountryChips();drawMap();
 $('mapLabel').textContent='Choose a country to inspect DOJ FARA registrations';
}
function initEvents(){
 $('regionFilter').addEventListener('input',renderCountryChips);
 $('statusFilter').addEventListener('change',()=>{showCount=24;renderPrincipals();});
 $('documentFilter').addEventListener('change',()=>{showCount=24;renderPrincipals();});
 $('search').addEventListener('input',()=>{showCount=24;renderPrincipals();});
 $('loadMore').addEventListener('click',()=>{showCount+=24;renderPrincipals();});
 window.addEventListener('resize',()=>{if(topologyFeatures.length)drawMap();});
 window.addEventListener('keydown',event=>{if(event.key==='Escape')reset();});
}
async function load(){
 initEvents();resetSidebar();$('countryChooser').open=true;
 try{
  const topoResponse=await fetch('assets/vendor/foreign-countries-50m.json',{cache:'force-cache'});
  if(!topoResponse.ok)throw Error('World geography unavailable');
  const topology=await topoResponse.json();
  topologyFeatures=topojson.feature(topology,topology.objects.countries).features;
  $('loading').hidden=true;
  drawMap();
 }catch(_){$('loading').textContent='Could not load world outlines. You can still browse countries by name.';}
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
 renderCountryChips();
 const route=decodeURIComponent(location.hash.split('/')[2]||'').toUpperCase();
 if(isIso2(route)&&byIso.has(route))choose(route);
}
load();

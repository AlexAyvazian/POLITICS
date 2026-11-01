/* Separate Congressional Atlas. Does not depend on or modify County Atlas. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const geo=window.CONGRESSIONAL_MODEL,states=window.GEO_STATES,colors=window.GEO_COLORS;
const stateByAbbr=Object.fromEntries(states.map(s=>[s.abbr,s]));
const stateByFips=Object.fromEntries(states.map(s=>[s.fips,s]));
const stateShapes=new Map();
const topo=window.US_ATLAS;
const D3=window.d3;
const svg=D3.select('#districtMap'), panel=$('districtPanel'),tooltip=$('congressTooltip');
const GATEWAY='https://crimson-mud-d254.alxayvazian.workers.dev';
const READER='https://politics-daily-snapshot.alxayvazian.workers.dev';
const FEDERAL='https://unitedstates.github.io/congress-legislators/legislators-current.json';
const boundaryCache=new Map(),lawmakersCache=new Map();
let usFeatures=[],currentState=null,currentLayer='house',currentDistrict=null;
let federalPeople=null,federalStatus='loading',statePeople=[],statePeopleStatus='idle',boundsError='';
let renderToken=0,loadToken=0;
const clean=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const stateShape=()=>stateShapes.get(currentState);
const current=()=>stateByAbbr[currentState];
const isDistrictLayer=()=>Object.hasOwn(geo.LAYERS,currentLayer);
const dateOfSnapshot='2026-11-01';
function status(text){$('congressLoading').hidden=!text;if(text)$('congressLoading').textContent=text;}
function viewSize(){const wrap=document.querySelector('.congressMapWrap');const w=Math.max(200,wrap.clientWidth),h=Math.max(250,wrap.clientHeight);svg.attr('viewBox','0 0 '+w+' '+h);return {w,h};}
function showTip(e,content){tooltip.textContent=content;tooltip.hidden=false;tooltip.style.left=Math.max(5,Math.min(innerWidth-255,e.clientX+14))+'px';tooltip.style.top=Math.max(5,Math.min(innerHeight-72,e.clientY+12))+'px';}
function hideTip(){tooltip.hidden=true;}
function partyLabel(value){return ({D:'Democratic',R:'Republican',S:'Divided', 'N/A':'Not applicable',Nonpartisan:'Nonpartisan'}[value]||value||'Not reported');}
function stateControl(){
 const record=window.POLITICS_NCSL?.states?.[currentState];
 if(!record)return currentState==='DC'?'<div class="empty">Washington, D.C. has no governor or state legislature.</div>':'';
 const row=(name,value)=>'<div class="controlItem"><small>'+clean(name)+'</small><strong>'+clean(value)+'</strong></div>';
 const seat=c=>'Dem '+c.dem+' · Rep '+c.rep+(c.other?' · Other '+c.other:'')+(c.vacant?' · Vacant '+c.vacant:'');
 return '<h2>State government control</h2><div class="facts">'+
  row('Governor party',partyLabel(record.governor))+row('Legislature',partyLabel(record.legislature))+
  row('Overall control',partyLabel(record.stateControl))+
  row(currentState==='NE'?'Unicameral seats':'State Senate seats',seat(record.senate))+
  (currentState==='NE'?'':row('State House seats',seat(record.house)))+
  '</div><p class="sourceNote">NCSL party-composition snapshot, updated October 6, 2026. <a target="_blank" rel="noopener noreferrer" href="'+clean(window.POLITICS_NCSL.sourceUrl)+'">NCSL source</a>.</p>';
}
function repCard(person){
 const name=clean(person.name),party=clean(person.party||'Party not listed');
 const link=person.bioguide?'https://bioguide.congress.gov/search/bio/'+encodeURIComponent(person.bioguide):'';
 return '<div class="repItem"><small>'+party+'</small><strong>'+(link?'<a href="'+clean(link)+'" target="_blank" rel="noopener noreferrer">'+name+'</a>':name)+'</strong></div>';
}
function lawmakerCard(person){
 const name=clean(person.name),role=person.current_role||{},party=clean(person.party||'Party not reported');
 const url=String(person.openstates_url||'');
 const isSafe=/^https:\/\/(open\.pluralpolicy\.com|openstates\.org)\//.test(url);
 return '<div class="repItem"><small>'+party+' · '+clean(role.title||'State lawmaker')+' · District '+clean(role.district||'unspecified')+'</small><strong>'+
 (isSafe?'<a href="'+clean(url)+'" target="_blank" rel="noopener noreferrer">'+name+'</a>':name)+'</strong></div>';
}
function sectionMembers(title,people,kind){
 if(!people?.length)return '<h2>'+clean(title)+'</h2><p class="empty">'+
 (kind==='federal'&&federalStatus==='loading'?'Loading federal officeholder records…':
 kind==='state'&&statePeopleStatus==='loading'?'Loading state legislator records…':
 'No verified matching officeholder record in the connected sources.')+'</p>';
 return '<h2>'+clean(title)+'</h2><div class="representationList">'+
 people.map(p=>kind==='state'?lawmakerCard(p):repCard(p)).join('')+'</div>';
}
function officePanel(){
 if(!currentState){
  return '<h1>United States</h1><p class="sub">Choose a state on the map. Then switch among federal House districts, U.S. senators, state House/Assembly districts, state Senate districts and statewide executives. Each layer has its own real geography.</p>'+
  '<div class="empty">County boundaries belong only to the separate <a href="index.html#map">County Atlas</a>.</div>'+
  (currentLayer==='president'?'<h2>Federal executive branch</h2>'+
   '<div class="representationList"><div class="repItem"><small>President of the United States · Republican</small><strong><a href="https://www.usa.gov/presidents" target="_blank" rel="noopener noreferrer">Donald J. Trump</a></strong></div>'+
   '<div class="repItem"><small>Vice President · Republican</small><strong>JD Vance</strong></div></div>'+
   '<p class="sourceNote">As of November 1, 2026 · <a href="https://www.usa.gov/presidents" target="_blank" rel="noopener noreferrer">USAGov official officeholder list</a>.</p>':'');
 }
 const state=current();
 let html='<h1>'+clean(state.name)+'</h1><p class="sub">'+clean(geo.LAYERS[currentLayer]?.label||{
 senate:'U.S. Senate · statewide',governor:'Governor · statewide',president:'President · nationwide'
 }[currentLayer])+'</p>';
 html+=stateControl();
 if(currentLayer==='president')return html+'<h2>Federal executive branch</h2>'+
  '<div class="repItem"><small>President of the United States · Republican</small><strong>Donald J. Trump</strong></div>'+
  '<div class="repItem"><small>Vice President · Republican</small><strong>JD Vance</strong></div>'+
  '<p class="sourceNote">Federal executive authority is nationwide, not divided into state or legislative districts. <a href="https://www.usa.gov/presidents" target="_blank" rel="noopener noreferrer">USAGov source</a>.</p>';
 if(currentLayer==='governor')return html+'<h2>Governor</h2>'+
  '<div class="repItem"><small>Statewide elected executive · '+clean(partyLabel(window.POLITICS_NCSL?.states?.[currentState]?.governor))+'</small>'+
  '<strong>Governor of '+clean(state.name)+'</strong></div>'+
  '<p class="sourceNote">The party is sourced from NCSL; the governor\'s name is not supplied by the connected dataset. <a href="https://www.nga.org/governors/" target="_blank" rel="noopener noreferrer">Find the current governor at NGA</a>.</p>';
 if(currentLayer==='senate'){
  html+=sectionMembers('U.S. senators',geo.federalMembers(federalPeople,currentState,'sen',null,dateOfSnapshot),'federal');
  return html+'<p class="sourceNote">U.S. senators represent the entire state. <a href="https://www.senate.gov/senators/" target="_blank" rel="noopener noreferrer">Official Senate directory</a>.</p>';
 }
 if(!currentDistrict){
  html+='<h2>District boundaries</h2><p class="hint">Select a district polygon to see its representative and party.</p>';
  html+='<p class="sourceNote">'+clean(geo.LAYERS[currentLayer].vintage)+'. Boundaries are Census Bureau data, not 2026 election returns. District data is separate from the County Atlas.</p>';
  if(boundsError)html+='<div class="empty">'+clean(boundsError)+'</div>';
  return html;
 }
 const code=geo.districtCode(currentDistrict.properties,currentLayer);
 const districtName=currentLayer==='house'?'U.S. House District '+Number(code):
 (currentLayer==='stateSenate'?'State Senate District ':'State House / Assembly District ')+Number(code);
 html+='<h2>'+clean(districtName)+'</h2>';
 if(currentLayer==='house'){
  html+=sectionMembers('Current U.S. representative',geo.federalMembers(federalPeople,currentState,'house',code,dateOfSnapshot),'federal');
  html+='<p class="sourceNote">119th Congress, serving until January 2027. The 2026 election may use different district boundaries in some states. <a href="https://www.house.gov/representatives" target="_blank" rel="noopener noreferrer">Official House directory</a>.</p>';
 }else{
  const matched=geo.stateLawmakerMatches(statePeople,currentLayer,code);
  html+=sectionMembers('State legislator',matched,'state');
  html+='<p class="sourceNote">State district shapes: 2024 Census vintage. Lawmaker entries: Open States / Plural public API; district/term mapping should be checked against the <a href="https://open.pluralpolicy.com/" target="_blank" rel="noopener noreferrer">state legislative directory</a> before attributing votes.</p>';
  if(statePeopleStatus==='partial')html+='<p class="sourceNote">The public API did not return a complete state roster; absence here does not mean this district is vacant.</p>';
 }
 return html;
}
function renderSide(){panel.innerHTML=officePanel();}
function hashState(){
 const bits=[currentState||'',currentLayer,currentDistrict?geo.districtCode(currentDistrict.properties,currentLayer):''].filter(Boolean);
 try{history.replaceState(null,'','#'+bits.join('/'));}catch{}
}
function nationalMap(){
 const {w,h}=viewSize();svg.selectAll('*').remove();
 const path=D3.geoPath();
 const bb=path.bounds({type:'FeatureCollection',features:usFeatures});
 const k=Math.min((w-36)/(bb[1][0]-bb[0][0]),(h-36)/(bb[1][1]-bb[0][1]));
 const x=w/2-k*(bb[0][0]+bb[1][0])/2,y=h/2-k*(bb[0][1]+bb[1][1])/2;
 const grp=svg.append('g').attr('transform','translate('+x+','+y+') scale('+k+')');
 grp.selectAll('path').data(usFeatures).join('path').attr('d',path)
  .attr('class','congressState').style('--geo-fill',d=>colors.state(String(d.id).padStart(2,'0')).fill)
  .style('--geo-hover',d=>colors.state(String(d.id).padStart(2,'0')).hover)
  .attr('tabindex',0).attr('role','button').attr('aria-label',d=>'Explore '+d.properties.name+' political representation')
  .on('mousemove',(ev,d)=>showTip(ev,d.properties.name))
  .on('mouseleave',hideTip).on('click',(_ev,d)=>selectState(stateByFips[String(d.id).padStart(2,'0')]?.abbr))
  .on('keydown',(ev,d)=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();selectState(stateByFips[String(d.id).padStart(2,'0')]?.abbr);}});
 $('districtMapLabel').textContent='United States · select a state to explore political districts';
 $('districtVintage').textContent='Federal House: 119th Congress · State legislature: 2024 boundaries';
}
function selectedStateOutline(){
 const {w,h}=viewSize(),feature=stateShape();
 svg.selectAll('*').remove();
 if(!feature)return;
 const projection=D3.geoIdentity().fitExtent([[22,22],[w-22,h-22]],feature);
 const path=D3.geoPath(projection);
 svg.append('path').datum(feature).attr('d',path).attr('class','congressState')
  .style('--geo-fill',colors.state(current().fips).fill).style('pointer-events','none');
 svg.append('path').datum(feature).attr('d',path).attr('class','congressSelectedOutline');
}
function polygonMap(fc){
 const {w,h}=viewSize();svg.selectAll('*').remove();
 const proj=currentState==='AK'?D3.geoAlbersUsa().fitExtent([[24,24],[w-24,h-24]],fc):
 D3.geoMercator().fitExtent([[24,24],[w-24,h-24]],fc);
 const path=D3.geoPath(proj),state=current();
 const accent=colors.state(state.fips);
 const root=svg.append('g');
 root.selectAll('path').data(fc.features).join('path')
 .attr('class',d=>'congressDistrict'+(currentDistrict&&d.properties.GEOID===currentDistrict.properties.GEOID?' selected':''))
 .attr('d',path)
 .style('--district-fill',d=>colors.county(state.fips,String(d.properties.GEOID||'').padEnd(5,'0')).fill)
 .style('--district-hover',accent.hover).style('--district-selected',accent.glow)
 .attr('role','button').attr('tabindex',0)
 .attr('aria-label',d=>geo.LAYERS[currentLayer].label+' '+(d.properties.BASENAME||d.properties.GEOID))
 .on('mousemove',(e,d)=>showTip(e,(d.properties.BASENAME||d.properties.GEOID)+' · '+state.name))
 .on('mouseleave',hideTip)
 .on('click',(_e,d)=>{currentDistrict=d;renderMap();renderSide();hashState();})
 .on('keydown',(e,d)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();currentDistrict=d;renderMap();renderSide();hashState();}});
 $('districtMapLabel').textContent=state.name+' · '+fc.features.length+' '+geo.LAYERS[currentLayer].label.toLowerCase();
 $('districtVintage').textContent=geo.LAYERS[currentLayer].vintage;
}
async function fetchData(url){
 const resp=await fetch(url,{credentials:'omit',headers:{Accept:'application/json'},signal:AbortSignal.timeout(25000)});
 if(!resp.ok)throw Error('HTTP '+resp.status);
 return resp.json();
}
async function loadGeometry(){
 if(!currentState||!isDistrictLayer())return;
 const state=current(),key=currentLayer+'|'+state.fips;
 if(boundaryCache.has(key))return;
 const url=GATEWAY+'/api/district-geometry?state='+encodeURIComponent(state.fips)+'&layer='+encodeURIComponent(currentLayer);
 const result=await fetchData(url);
 if(result?.data?.type!=='FeatureCollection'||!Array.isArray(result.data.features))throw Error('Invalid polygon collection');
 const features=result.data.features.filter(f=>f.geometry?.coordinates?.length&&geo.districtCode(f.properties,currentLayer)!==null);
 if(!features.length)throw Error('Census boundary service returned no district polygons');
 boundaryCache.set(key,{type:'FeatureCollection',features});
}
async function loadFederal(){
 if(federalPeople!==null||federalStatus==='ready')return;
 try{
  const raw=await fetchData(FEDERAL);
  if(!Array.isArray(raw)||raw.length<400)throw Error('Federal membership source is incomplete');
  federalPeople=raw;federalStatus='ready';
 }catch(e){
  try{
   const backup=await fetchData(READER+'/api/congress-snapshot');
   if(!backup?.states)throw Error('No usable backup');
   federalPeople=[];
   federalStatus='unavailable';
  }catch{federalStatus='unavailable';}
 }
 renderSide();
}
async function loadStateLawmakers(){
 if(!currentState)return;
 const abbr=currentState;
 if(lawmakersCache.has(abbr)){
  const saved=lawmakersCache.get(abbr);statePeople=saved.people;statePeopleStatus=saved.partial?'partial':'ready';renderSide();return;
 }
 const token=++loadToken;
 statePeople=[];statePeopleStatus='loading';renderSide();
 try{
  const base=GATEWAY+'/api/openstates?record=people&jurisdiction='+abbr.toLowerCase()+'&limit=25';
  const first=await fetchData(base+'&page=1');
  const list=first?.data?.results;
  if(!Array.isArray(list))throw Error('Open States unavailable');
  const total=Number(first?.data?.pagination?.total_items||list.length);
  const pages=Math.min(12,Math.max(1,Math.ceil(total/25)));
  const pending=Array.from({length:pages-1},(_,i)=>fetchData(base+'&page='+(i+2)).catch(()=>null));
  const rest=await Promise.all(pending);
  const all=list.concat(rest.flatMap(x=>Array.isArray(x?.data?.results)?x.data.results:[]));
  const people=[...new Map(all.filter(x=>x?.id).map(x=>[x.id,x])).values()];
  const partial=rest.some(x=>!Array.isArray(x?.data?.results))||total>pages*25;
  lawmakersCache.set(abbr,{people,partial});
  if(token!==loadToken||abbr!==currentState)return;
  statePeople=people;statePeopleStatus=partial?'partial':'ready';
 }catch(e){
  if(token!==loadToken||abbr!==currentState)return;
  statePeopleStatus='error';
 }
 renderSide();
}
function renderMap(){
 hideTip();
 if(!currentState){status('');nationalMap();return;}
 const state=current();
 if(!state){currentState=null;nationalMap();return;}
 if(isDistrictLayer()){
  const value=boundaryCache.get(currentLayer+'|'+state.fips);
  if(value){status('');polygonMap(value);}
  else{
   selectedStateOutline();
   $('districtMapLabel').textContent=state.name+' · district boundaries loading';
   $('districtVintage').textContent=geo.LAYERS[currentLayer].vintage;
  }
 }else{
  status('');selectedStateOutline();
  $('districtMapLabel').textContent=state.name+' · '+({senate:'U.S. Senate',president:'Federal executive',governor:'State governor'}[currentLayer]);
  $('districtVintage').textContent='Statewide office: no separate district boundaries';
 }
}
async function update(){
 const serial=++renderToken;
 boundsError='';
 renderMap();renderSide();hashState();
 const jobs=[];
 if(isDistrictLayer()&&currentState&&!boundaryCache.has(currentLayer+'|'+current().fips)){
  status('Loading official Census district boundaries…');
  jobs.push(loadGeometry().catch(e=>{if(serial===renderToken)boundsError='District polygons unavailable: '+e.message;})
   .finally(()=>{if(serial===renderToken){status('');renderMap();renderSide();}}));
 }
 if(['house','senate'].includes(currentLayer))jobs.push(loadFederal());
 if(['stateHouse','stateSenate'].includes(currentLayer))jobs.push(loadStateLawmakers());
 await Promise.allSettled(jobs);
}
function selectState(abbr){
 if(!abbr||!stateByAbbr[abbr]){currentState=null;currentDistrict=null;$('congressState').value='';$('congressBack').hidden=true;update();return;}
 if(currentState!==abbr){currentDistrict=null;statePeople=[];statePeopleStatus='idle';loadToken++;}
 currentState=abbr;$('congressState').value=abbr;$('congressBack').hidden=false;update();
}
$('congressState').innerHTML='<option value="">United States — choose a state</option>'+states
 .slice().sort((a,b)=>a.name.localeCompare(b.name)).map(s=>'<option value="'+clean(s.abbr)+'">'+clean(s.name)+'</option>').join('');
const query=location.hash.replace(/^#/,'').split('/');
if(stateByAbbr[query[0]])currentState=query[0];
if(['house','senate','president','stateHouse','stateSenate','governor'].includes(query[1]))currentLayer=query[1];
$('congressState').value=currentState||'';
$('districtLayer').value=currentLayer;
$('congressBack').hidden=!currentState;
$('congressState').addEventListener('change',e=>selectState(e.target.value));
$('districtLayer').addEventListener('change',e=>{currentLayer=e.target.value;currentDistrict=null;update();});
$('congressBack').addEventListener('click',()=>selectState(null));
usFeatures=topojson.feature(topo,topo.objects.states).features;
for(const f of usFeatures){const abbr=stateByFips[String(f.id).padStart(2,'0')]?.abbr;if(abbr)stateShapes.set(abbr,f);}
if(currentState&&query[2]&&geo.LAYERS[currentLayer]){
 const target=query[2];
 // Deep-link selected district is resolved only after real polygon geometry arrives.
 const originalLoad=loadGeometry;
 loadGeometry=async function(){await originalLoad();const collection=boundaryCache.get(currentLayer+'|'+current().fips);
 if(collection)currentDistrict=collection.features.find(f=>geo.districtCode(f.properties,currentLayer)===target)||null;};
}
window.addEventListener('resize',()=>renderMap());
update();
})();

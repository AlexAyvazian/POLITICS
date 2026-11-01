/* POLITICS Congressional Atlas — wholly independent Leaflet / Census web map.
   Does not import the County Atlas or prior congressional SVG implementation.
   Existing geographic basemap: OpenStreetMap + Leaflet.
   Existing legislative map: U.S. Census TIGERweb ArcGIS MapServer.
   Feature geometry and selection are managed by Esri Leaflet (never D3/SVG). */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const STATES=[{"abbr":"AL","name":"Alabama","fips":"01"},{"abbr":"AK","name":"Alaska","fips":"02"},{"abbr":"AZ","name":"Arizona","fips":"04"},{"abbr":"AR","name":"Arkansas","fips":"05"},{"abbr":"CA","name":"California","fips":"06"},{"abbr":"CO","name":"Colorado","fips":"08"},{"abbr":"CT","name":"Connecticut","fips":"09"},{"abbr":"DE","name":"Delaware","fips":"10"},{"abbr":"FL","name":"Florida","fips":"12"},{"abbr":"GA","name":"Georgia","fips":"13"},{"abbr":"HI","name":"Hawaii","fips":"15"},{"abbr":"ID","name":"Idaho","fips":"16"},{"abbr":"IL","name":"Illinois","fips":"17"},{"abbr":"IN","name":"Indiana","fips":"18"},{"abbr":"IA","name":"Iowa","fips":"19"},{"abbr":"KS","name":"Kansas","fips":"20"},{"abbr":"KY","name":"Kentucky","fips":"21"},{"abbr":"LA","name":"Louisiana","fips":"22"},{"abbr":"ME","name":"Maine","fips":"23"},{"abbr":"MD","name":"Maryland","fips":"24"},{"abbr":"MA","name":"Massachusetts","fips":"25"},{"abbr":"MI","name":"Michigan","fips":"26"},{"abbr":"MN","name":"Minnesota","fips":"27"},{"abbr":"MS","name":"Mississippi","fips":"28"},{"abbr":"MO","name":"Missouri","fips":"29"},{"abbr":"MT","name":"Montana","fips":"30"},{"abbr":"NE","name":"Nebraska","fips":"31"},{"abbr":"NV","name":"Nevada","fips":"32"},{"abbr":"NH","name":"New Hampshire","fips":"33"},{"abbr":"NJ","name":"New Jersey","fips":"34"},{"abbr":"NM","name":"New Mexico","fips":"35"},{"abbr":"NY","name":"New York","fips":"36"},{"abbr":"NC","name":"North Carolina","fips":"37"},{"abbr":"ND","name":"North Dakota","fips":"38"},{"abbr":"OH","name":"Ohio","fips":"39"},{"abbr":"OK","name":"Oklahoma","fips":"40"},{"abbr":"OR","name":"Oregon","fips":"41"},{"abbr":"PA","name":"Pennsylvania","fips":"42"},{"abbr":"RI","name":"Rhode Island","fips":"44"},{"abbr":"SC","name":"South Carolina","fips":"45"},{"abbr":"SD","name":"South Dakota","fips":"46"},{"abbr":"TN","name":"Tennessee","fips":"47"},{"abbr":"TX","name":"Texas","fips":"48"},{"abbr":"UT","name":"Utah","fips":"49"},{"abbr":"VT","name":"Vermont","fips":"50"},{"abbr":"VA","name":"Virginia","fips":"51"},{"abbr":"WA","name":"Washington","fips":"53"},{"abbr":"WV","name":"West Virginia","fips":"54"},{"abbr":"WI","name":"Wisconsin","fips":"55"},{"abbr":"WY","name":"Wyoming","fips":"56"},{"abbr":"DC","name":"District of Columbia","fips":"11"}];
const byAbbr=Object.fromEntries(STATES.map(x=>[x.abbr,x]));
const byFips=Object.fromEntries(STATES.map(x=>[x.fips,x]));
const MAP_SERVICE='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer';
const FEATURE_SERVICE='https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2025/Legislative/MapServer';
const STATE_SERVICE='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/USLandmass/MapServer/0/query';
const FEDERAL_SOURCE='https://unitedstates.github.io/congress-legislators/legislators-current.json';
const OPENSTATES='https://crimson-mud-d254.alxayvazian.workers.dev/api/openstates';
const OFFICES={
 house:{map:8,feature:5,title:'U.S. House districts',vintage:'119th Congress · January 2025'},
 stateSenate:{map:9,feature:8,title:'State Senate districts',vintage:'2024 state legislative district boundaries'},
 stateHouse:{map:10,feature:9,title:'State House / Assembly districts',vintage:'2024 state legislative district boundaries'}
};
const date='2026-11-01';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const encode=encodeURIComponent;
const element=$('districtPanel');
const map=L.map('legislativeMap',{minZoom:2,maxZoom:17,zoomControl:true,scrollWheelZoom:true,preferCanvas:true})
 .setView([39.3,-98.1],4);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
 maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
}).addTo(map);
L.control.scale({imperial:true,metric:false,position:'bottomleft'}).addTo(map);
let currentState=null,layerName='house',selectedDistrict=null,serverLayer=null,featureLayer=null;
let federalPeople=null,federalLoad=null,statePeople=[],statePeopleMode='not-loaded',stateFetchNumber=0;
let selectionNumber=0,loadCount=0;
const statePeopleCache=new Map(),extentCache=new Map();
let mapNote='';
function showBusy(text){$('congressLoading').hidden=!text;if(text)$('congressLoading').textContent=text}
function party(v){return ({D:'Democratic',R:'Republican',S:'Divided',Nonpartisan:'Nonpartisan','N/A':'Not applicable'}[v]||v||'Not reported')}
function apiGet(base,params){
 const url=new URL(base);
 for(const [name,value] of Object.entries(params))url.searchParams.set(name,String(value));
 return url.toString();
}
async function readJSON(url){
 const r=await fetch(url,{headers:{Accept:'application/json'}});
 if(!r.ok)throw Error('HTTP '+r.status);
 const value=await r.json();
 if(value.error)throw Error(typeof value.error==='string'?value.error:JSON.stringify(value.error));
 return value;
}
function getLayer(){return OFFICES[layerName]||null}
function districtCode(geoId){
 const id=String(geoId||'');
 const digits=layerName==='house'?4:5;
 return /^\d+$/.test(id)&&id.length===digits?id.slice(2):null;
}
function saveHash(){
 const bits=[currentState||'US',layerName,selectedDistrict?districtCode(selectedDistrict.GEOID):''].filter(Boolean);
 try{history.replaceState(null,'','#'+bits.join('/'));}catch{}
}
function personCards(people,source='federal'){
 if(!people?.length)return '<p class="empty">No independently verified officeholder match is available for this selection.</p>';
 return '<div class="representationList">'+people.slice(0,6).map(p=>{
  const name=esc(p.name),part=esc(p.party||'Party not listed');
  const url=source==='federal'&&p.bioguide?'https://bioguide.congress.gov/search/bio/'+encode(p.bioguide):
   source==='state'&&/^https:\/\/(open\.pluralpolicy\.com|openstates\.org)\//.test(p.url||'')?p.url:null;
  return '<div class="repItem"><small>'+part+'</small><strong>'+
   (url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+name+'</a>':name)+'</strong></div>';
 }).join('')+'</div>';
}
function getActiveFederal(){
 if(!Array.isArray(federalPeople)||!currentState)return [];
 const type=layerName==='house'?'rep':'sen';
 const district=selectedDistrict?districtCode(selectedDistrict.GEOID):null;
 return federalPeople.map(p=>{
  const t=[...(p.terms||[])].reverse().find(x=>x.start<=date&&(!x.end||date<x.end));
  if(!t||t.type!==type||t.state!==currentState)return null;
  if(type==='rep'&&(district===null||Number(t.district)!==Number(district)))return null;
  const name=p.name?.official_full||[p.name?.first,p.name?.last].filter(Boolean).join(' ');
  return name?{name,party:t.party,bioguide:p.id?.bioguide}:null;
 }).filter(Boolean);
}
function getStateRepresentatives(){
 const code=selectedDistrict?districtCode(selectedDistrict.GEOID):null;
 if(code===null)return [];
 const upper=layerName==='stateSenate',wanted=Number(code);
 return statePeople.filter(p=>{
  const role=p.current_role||{};
  const title=String(role.title||'').toLowerCase();
  const chamber=String(role.org_classification||'').toLowerCase();
  const correctChamber=upper?(chamber==='upper'||/senator|senate/.test(title)):(chamber==='lower'||/assembly|representative|delegate/.test(title));
  return Number(role.district)===wanted&&correctChamber;
 }).map(p=>({name:p.name,party:p.party,url:p.openstates_url}));
}
function controlSection(){
 const c=window.POLITICS_NCSL?.states?.[currentState];
 if(!c)return '';
 const item=(label,value)=>'<div class="controlItem"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>';
 const seats=a=>'Dem '+a.dem+' · Rep '+a.rep+(a.other?' · Other '+a.other:'')+(a.vacant?' · Vacant '+a.vacant:'');
 return '<h2>State government control</h2><div class="facts">'+
 item('Governor',party(c.governor))+item('Legislature',party(c.legislature))+
 item('Overall control',party(c.stateControl))+
 item(currentState==='NE'?'Unicameral seats':'State Senate',seats(c.senate))+
 (currentState==='NE'?'':item('State House',seats(c.house)))+'</div>'+
 '<p class="sourceNote">NCSL composition as of October 6, 2026. <a href="https://www.ncsl.org/about-state-legislatures/state-partisan-composition" target="_blank" rel="noopener noreferrer">Official source</a>.</p>';
}
function renderPanel(){
 if(!currentState){
  element.innerHTML='<h1>United States</h1><p class="sub">This is a separate, existing geographic map, using Census Bureau legislative boundaries. Select a state on the map or above.</p>'+
   '<div class="empty">Choose U.S. House, U.S. Senate, state House, state Senate, Governor, or President. Only the active district system is displayed; county boundaries are not overlaid.</div>';
  return;
 }
 const state=byAbbr[currentState];
 let html='<h1>'+esc(state.name)+'</h1><p class="sub">'+esc(getLayer()?.title||
  ({senate:'U.S. Senate — statewide',governor:'State governor',president:'President — nationwide'}[layerName]))+'</p>';
 html+=controlSection();
 if(layerName==='governor'){
  const g=window.GOVERNORS_2026;
  html+='<h2>Governor</h2>'+personCards([{name:g?.states?.[currentState]||'Name unavailable',party:party(window.POLITICS_NCSL?.states?.[currentState]?.governor)}])+
   '<p class="sourceNote">Governor name: <a href="https://www.nga.org/governors/" target="_blank" rel="noopener noreferrer">National Governors Association</a>, roster dated '+esc(g?.asOf||'not listed')+'.</p>';
 }else if(layerName==='president'){
  html+='<h2>Federal executive</h2>'+personCards([{name:'Donald J. Trump',party:'Republican'},{name:'JD Vance',party:'Republican'}])+
   '<p class="sourceNote">President and Vice President serve nationally, not in congressional districts. <a href="https://www.usa.gov/presidents" target="_blank" rel="noopener noreferrer">USAGov</a>.</p>';
 }else if(layerName==='senate'){
  html+='<h2>U.S. senators</h2>';
  if(!federalPeople)html+='<p class="empty">Loading or unavailable federal directory.</p>';
  else html+=personCards(getActiveFederal());
  html+='<p class="sourceNote">Statewide Senate representation · <a href="https://www.senate.gov/senators/" target="_blank" rel="noopener noreferrer">Official Senate directory</a>.</p>';
 }else if(getLayer()){
  if(selectedDistrict){
   const code=districtCode(selectedDistrict.GEOID)||'';
   html+='<h2>'+esc(getLayer().title)+' · '+esc(code==='00'?'At large':Number(code))+'</h2>';
   const people=layerName==='house'?getActiveFederal():getStateRepresentatives();
   if(layerName==='house'&&!federalPeople||layerName!=='house'&&statePeopleMode==='loading'){
    html+='<p class="empty">Checking current officeholders…</p>';
   }else html+=personCards(people,layerName==='house'?'federal':'state');
   html+='<p class="sourceNote">'+esc(getLayer().vintage)+
    '. A district without a verified match is not necessarily vacant. '+(layerName==='house'?
    '<a href="https://www.house.gov/representatives" target="_blank" rel="noopener noreferrer">U.S. House</a>.':
    '<a href="https://docs.openstates.org/api-v3/" target="_blank" rel="noopener noreferrer">Open States</a>.')+'</p>';
  }else html+='<h2>Select a district</h2><p class="hint">Click one of the actual district boundaries to display its representative. Use the map zoom controls for greater detail.</p>';
  if(statePeopleMode==='partial'&&layerName!=='house')html+='<p class="sourceNote">State legislative roster is incomplete; missing representatives are not shown as vacancies.</p>';
 }
 if(mapNote)html+='<p class="sourceNote">'+esc(mapNote)+'</p>';
 element.innerHTML=html;
}
function removeDistrictLayers(){
 if(featureLayer){map.removeLayer(featureLayer);featureLayer=null}
 if(serverLayer){map.removeLayer(serverLayer);serverLayer=null}
}
function layerVisible(){
 if(!currentState||!getLayer())return;
 const id=getLayer(),state=byAbbr[currentState],where="STATE='"+state.fips+"'";
 // This layer is the real Census-hosted map image. The server draws its boundaries.
 serverLayer=L.esri.dynamicMapLayer({url:MAP_SERVICE,layers:[id.map],
  layerDefs:{[id.map]:where},format:'png32',transparent:true,opacity:0.82,
  attribution:'District lines &copy; U.S. Census Bureau'}).addTo(map);
 // Native Leaflet/Esri feature layer adds reliable outlines and click-hit testing,
 // including at zooms where the server does not draw small-scale legislatures.
 featureLayer=L.esri.featureLayer({url:FEATURE_SERVICE+'/'+id.feature,
  where,precision:4,simplifyFactor:0.48,
  style:()=>({color:'#85dadb',weight:1.45,opacity:0.91,fillColor:'#6bdccc',fillOpacity:0.045}),
  attribution:'Political districts &copy; U.S. Census Bureau'}).addTo(map);
 featureLayer.on('click',e=>{
  const code=e.layer?.feature?.properties?.GEOID;
  if(!code)return;
  selectedDistrict={GEOID:code,NAME:e.layer.feature.properties.BASENAME};
  featureLayer.setStyle(layer=>({
    color:layer?.feature?.properties?.GEOID===code?'#ffe1a6':'#85dadb',
    weight:layer?.feature?.properties?.GEOID===code?3:1.45,
    opacity:1,fillColor:'#6bdccc',fillOpacity:layer?.feature?.properties?.GEOID===code?.18:.045
  }));
  renderPanel();saveHash();
 });
 featureLayer.on('load',()=>{showBusy('');$('districtMapLabel').textContent=state.name+' · '+id.title;});
 featureLayer.on('requesterror',()=>{mapNote='District service unavailable at this zoom; check the official Census link.';showBusy('');renderPanel()});
}
async function fitState(){
 const state=byAbbr[currentState],id=getLayer()?.map??8;
 if(!state)return;
 if(state.abbr==='AK'){map.setView([63.5,-151.2],5);return;}
 if(state.abbr==='HI'){map.setView([20.8,-157.3],7);return;}
 if(extentCache.has(state.fips)){map.fitBounds(extentCache.get(state.fips),{padding:[28,28],maxZoom:8});return;}
 const url=apiGet(MAP_SERVICE+'/'+id+'/query',{
  where:"STATE='"+state.fips+"'",returnExtentOnly:'true',outSR:4326,f:'json'
 });
 try{
  const data=await readJSON(url);
  const ext=data?.extent;
  if(!ext||![ext.xmin,ext.ymin,ext.xmax,ext.ymax].every(Number.isFinite))throw Error('No state extent returned');
  const bounds=L.latLngBounds([ext.ymin,ext.xmin],[ext.ymax,ext.xmax]);
  extentCache.set(state.fips,bounds);
  map.fitBounds(bounds,{padding:[28,28],maxZoom:8});
 }catch(e){mapNote='Official state extent could not load; manually zoom to inspect districts.';renderPanel();}
}
async function loadFederal(){
 if(federalPeople)return;
 if(federalLoad)return federalLoad;
 federalLoad=readJSON(FEDERAL_SOURCE).then(raw=>{
  if(!Array.isArray(raw)||raw.length<400)throw Error('Incomplete federal roster');
  federalPeople=raw;
 }).catch(()=>{mapNote='Federal member directory is temporarily unavailable.';})
 .finally(()=>{federalLoad=null;renderPanel()});
 return federalLoad;
}
async function loadLawmakers(){
 if(!currentState||!['stateHouse','stateSenate'].includes(layerName))return;
 const state=currentState;
 if(statePeopleCache.has(state)){
  const d=statePeopleCache.get(state);statePeople=d.people;statePeopleMode=d.partial?'partial':'ready';renderPanel();return;
 }
 const token=++loadCount;statePeople=[];statePeopleMode='loading';renderPanel();
 try{
  const base=apiGet(OPENSTATES,{jurisdiction:state.toLowerCase(),record:'people',limit:25});
  const first=await readJSON(base+'&page=1');
  if(!Array.isArray(first?.data?.results))throw Error('No state legislature roster');
  const total=Number(first.data.pagination?.total_items||first.data.results.length);
  const pages=Math.min(12,Math.ceil(total/25));
  const rest=await Promise.all(Array.from({length:pages-1},(_,i)=>readJSON(base+'&page='+(i+2)).catch(()=>null)));
  const people=[...new Map(first.data.results.concat(rest.flatMap(x=>x?.data?.results||[])).filter(p=>p?.id).map(p=>[p.id,p])).values()];
  const partial=rest.some(r=>!Array.isArray(r?.data?.results))||total>pages*25;
  statePeopleCache.set(state,{people,partial});
  if(token!==loadCount||currentState!==state)return;
  statePeople=people;statePeopleMode=partial?'partial':'ready';
 }catch(e){
  if(token!==loadCount||currentState!==state)return;
  statePeopleMode='error';mapNote='Unable to fetch complete state legislative roster.';
 }renderPanel();
}
async function reload(){
 const serial=++selectionNumber;
 removeDistrictLayers();selectedDistrict=null;
 mapNote='';showBusy('');
 $('districtVintage').textContent=getLayer()?.vintage||'Statewide or national office · no district boundaries';
 if(currentState&&getLayer()){
  const state=byAbbr[currentState];
  $('districtMapLabel').textContent='Loading official Census '+getLayer().title+' for '+state.name+'…';
  showBusy('Loading Census district lines…');
  // Wait for the Leaflet basemap and official extent, then layer boundaries.
  await fitState();
  if(serial!==selectionNumber)return;
  layerVisible();
 }else if(currentState){
  await fitState();
  $('districtMapLabel').textContent=byAbbr[currentState].name+' · statewide political representation';
 }else{
  map.setView([39.3,-98.1],4);
  $('districtMapLabel').textContent='United States · choose a state on this map or above';
 }
 renderPanel();saveHash();
 if(['house','senate'].includes(layerName))loadFederal();
 if(['stateHouse','stateSenate'].includes(layerName))loadLawmakers();
}
function chooseState(abbr){
 currentState=byAbbr[abbr]?abbr:null;
 $('congressState').value=currentState||'';
 $('congressBack').hidden=!currentState;
 loadCount++;statePeople=[];statePeopleMode='not-loaded';
 reload();
}
map.on('click',async event=>{
 // On the nationwide basemap, click a state to open it. No county atlas involved.
 if(currentState)return;
 try{
  const data=await readJSON(apiGet(STATE_SERVICE,{
   geometry:event.latlng.lng+','+event.latlng.lat,
   geometryType:'esriGeometryPoint',inSR:4326,spatialRel:'esriSpatialRelIntersects',
   outFields:'STATE,GEOID',returnGeometry:'false',f:'json'
  }));
  const fips=data?.features?.[0]?.attributes?.STATE;
  if(byFips[fips])chooseState(byFips[fips].abbr);
 }catch{}
});
$('congressState').innerHTML='<option value="">United States — choose a state</option>'+
 STATES.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(s=>'<option value="'+s.abbr+'">'+esc(s.name)+'</option>').join('');
const parts=location.hash.replace(/^#/,'').split('/');
if(byAbbr[parts[0]])currentState=parts[0];
if([...Object.keys(OFFICES),'senate','governor','president'].includes(parts[1]))layerName=parts[1];
$('congressState').value=currentState||'';
$('districtLayer').value=layerName;
$('congressBack').hidden=!currentState;
$('congressState').addEventListener('change',e=>chooseState(e.target.value));
$('congressBack').addEventListener('click',()=>chooseState(null));
$('districtLayer').addEventListener('change',e=>{layerName=e.target.value;statePeopleMode='not-loaded';reload()});
renderPanel();reload();
})();

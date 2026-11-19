/* Standalone Congressional Atlas: geographic boundaries and election-result interactions. */
(function(){
'use strict';
const $=id=>document.getElementById(id),d3=window.d3,states=window.GEO_STATES,model=window.CONGRESSIONAL_MODEL,partyModel=window.CONGRESSIONAL_POLITICAL_MODEL;
const byFips=Object.fromEntries(states.map(s=>[s.fips,s])),byCode=Object.fromEntries(states.map(s=>[s.abbr,s]));
const layers={
 house:{title:'U.S. House districts',type:'district',id:5,vintage:'119th Congress · January 2025 Census boundaries'},
 stateSenate:{title:'State Senate districts',type:'district',id:8,vintage:'2024 Census legislative boundaries'},
 stateHouse:{title:'State House / Assembly districts',type:'district',id:9,vintage:'2024 Census legislative boundaries'},
 senate:{title:'U.S. Senate',type:'countyElection',vintage:'County election results'},
 governor:{title:'Governors',type:'countyElection',vintage:'County election results'},
 president:{title:'President',type:'countyElection',vintage:'County election results'}
};
const BOUNDARY_ASSETS='assets/data/congressional';
const svg=d3.select('#districtMap'),tip=$('congressTooltip'),cache=new Map();
const us=window.topojson.feature(window.US_ATLAS,window.US_ATLAS.objects.states).features.filter(f=>byFips[String(f.id).padStart(2,'0')]);
const countyFeatures=window.topojson.feature(window.US_ATLAS,window.US_ATLAS.objects.counties).features;
const outlines=new Map(us.map(f=>[String(f.id).padStart(2,'0'),f]));
let state=null,layer='house',district=null,selectedCounty=null,pendingCode=null,pendingGeoid=null,seq=0,root,zoom,home=d3.zoomIdentity,chosen=null,partyResolver=null;
const stateName=()=>byCode[state]?.name||'United States';
const digits=()=>layer==='house'?2:3;
const currentCode=f=>model.districtCode(f.properties,layer);
const meta=(feature,fips)=>{
 const p=feature?.properties||{},code=feature?currentCode(feature):null;
 const id=fips||p.STATE||byCode[state]?.fips||null;
 return {scope:code===null?'state':'district',layer,state:byFips[id]?.abbr||null,stateFips:id,
  district:code,geoid:code===null?id:String(p.GEOID),vintage:layers[layer].vintage};
};
function electionFor(which,stateCode){
 if(stateCode==='AK')return window.AK_STATEWIDE_ELECTION_RESULTS?.[which]||null;
 if(stateCode!=='CA')return null;
 if(which==='governor')return window.CA_GOVERNOR_2026_RESULTS||null;
 return window.STATEWIDE_ELECTION_RESULTS?.states?.CA?.[which]||null;
}
function countyElectionResult(which,stateCode,countyFips){
 return electionFor(which,stateCode)?.counties?.[countyFips]||null;
}
function nationalStateParty(which,stateCode){
 if(which==='president')return window.US_PRESIDENT_2024_STATE_WINNERS?.states?.[stateCode]||'unknown';
 if(typeof partyResolver!=='function')return 'unknown';
 const result=partyResolver({layer:which,state:stateCode,scope:'state',district:null});
 return ['democratic','republican','other','split','vacant'].includes(result)?result:'unknown';
}
function status(text){$('congressLoading').hidden=!text;$('congressLoading').textContent=text||'';}
function tipOff(){tip.hidden=true;}
function tipOn(e,text){tip.textContent=text;tip.hidden=false;tip.style.left=Math.max(6,Math.min(innerWidth-300,e.clientX+12))+'px';tip.style.top=Math.max(6,Math.min(innerHeight-75,e.clientY+12))+'px';}
function announce(data){chosen=data;window.dispatchEvent(new CustomEvent('congressional-atlas:selection',{detail:data}));}
function deselect(emit=false){
 district=null;selectedCounty=null;chosen=null;$('districtSelection').hidden=true;
 if(root)root.selectAll('.atlasFeature').attr('data-active',null);
 if(emit)announce(null);
}
function selectFeature(feature){
 district=feature;selectedCounty=null;
 root.selectAll('.atlasFeature').attr('data-active',f=>f.properties?.GEOID===feature.properties.GEOID?'true':null);
 display(meta(feature));hash();
}
function countyMeta(feature,result,race){
 const countyFips=String(feature.id).padStart(5,'0');
 return {
  scope:'county',layer,state,stateFips:byCode[state]?.fips||null,countyFips,
  countyName:result?.name||('County '+countyFips),geoid:countyFips,
  electionDate:race?.electionDate||null,electionStatus:race?.status||'unavailable',
  sourceUrl:race?.sourceUrl||null,electionTitle:race?.title||layers[layer].title,
  electionResult:result||null,vintage:layers[layer].vintage
 };
}
function selectCounty(feature,result,race){
 selectedCounty=feature;district=null;
 const id=String(feature.id).padStart(5,'0');
 root.selectAll('.atlasFeature').attr('data-active',f=>String(f.id).padStart(5,'0')===id?'true':null);
 display(countyMeta(feature,result,race));hash();
}
function electionDistrictMeta(feature,result,race){
 const code=model.districtCode(feature.properties,'stateHouse');
 return {
  scope:'electionDistrict',layer,state,stateFips:byCode[state]?.fips||null,
  district:code,geoid:String(feature.properties?.GEOID||''),
  electionDate:race?.electionDate||null,electionStatus:race?.status||'unavailable',
  sourceUrl:race?.sourceUrl||null,electionTitle:race?.title||layers[layer].title,
  electionResult:result||null,vintage:'Alaska State House district election geography'
 };
}
function selectElectionDistrict(feature,result,race){
 selectedCounty=null;district=null;
 const id=String(feature.properties?.GEOID||'');
 root.selectAll('.atlasFeature').attr('data-active',f=>String(f.properties?.GEOID||'')===id?'true':null);
 display(electionDistrictMeta(feature,result,race));hash();
}
function display(data){
 $('districtSelection').hidden=false;
 const delegate=data.scope==='district'&&layer==='house'&&data.state==='DC'&&data.district==='98';
 const atLarge=data.scope==='district'&&layer==='house'&&(data.district==='00'||delegate);
 const county=data.scope==='county';
 const electionDistrict=data.scope==='electionDistrict';
 $('selectionType').textContent=electionDistrict?
  ('HOUSE DISTRICT RESULT · '+String(data.electionTitle||layers[layer].title).toUpperCase()):
  county?
  ('COUNTY RESULT · '+String(data.electionTitle||layers[layer].title).toUpperCase()):
  delegate?'AT-LARGE D.C. DELEGATE DISTRICT':
  atLarge?'AT-LARGE U.S. HOUSE DISTRICT':
  data.scope==='district'?layers[layer].title.toUpperCase():'STATEWIDE GEOGRAPHY';
 $('selectionName').textContent=electionDistrict?
  (byCode[data.state]?.name+' · House District '+data.district):
  county?
  (byCode[data.state]?.name+' · '+data.countyName+' County'):
  byCode[data.state]?.name+(data.scope==='district'?' · '+model.districtDisplayName(layer,data.district):'');
 const result=data.electionResult;
 $('selectionGeoid').textContent=electionDistrict?
  ('House District '+data.district+(result?.winner?' · '+result.winner+' won this district':' · Result unavailable')):
  county?
  ('County FIPS: '+data.countyFips+(result?.winner?' · '+result.winner+' won this county':' · County result unavailable')):
  'GEOID: '+data.geoid+(delegate?' · D.C. elects a non-voting delegate.':atLarge?' · The entire state is one congressional district.':'');
 announce(data);
}
function hash(){try{history.replaceState(null,'','#'+[state||'US',layer,district?currentCode(district):null].filter(Boolean).join('/'));}catch{}}
function updateLegend(){
 const legend=$('atlasPartyLegend');
 if(!legend)return;
 if(layers[layer].type==='countyElection'&&!state){
  if(layer==='president'){
   legend.setAttribute('aria-label','2024 presidential statewide winner color key');
   legend.innerHTML=
    '<span class="atlasLegendPair"><i class="atlasPartySwatch dem" aria-hidden="true"></i> Democratic 2024 state winner</span>'+
    '<span class="atlasLegendPair"><i class="atlasPartySwatch rep" aria-hidden="true"></i> Republican 2024 state winner</span>'+
    '<span class="atlasLegendPair"><i class="atlasPartySwatch vacant" aria-hidden="true"></i> Result unavailable</span>';
  }else if(layer==='governor'){
   legend.setAttribute('aria-label','Current governor party color key');
   legend.innerHTML=
    '<span class="atlasLegendPair"><i class="atlasPartySwatch dem" aria-hidden="true"></i> Democratic governor</span>'+
    '<span class="atlasLegendPair"><i class="atlasPartySwatch rep" aria-hidden="true"></i> Republican governor</span>'+
    '<span class="atlasLegendPair"><i class="atlasPartySwatch other" aria-hidden="true"></i> Other / nonpartisan</span>'+
    '<span class="atlasLegendPair"><i class="atlasPartySwatch vacant" aria-hidden="true"></i> Party unavailable</span>';
  }else{
   legend.setAttribute('aria-label','Current U.S. Senate delegation color key');
   legend.innerHTML=
    '<span class="atlasLegendPair"><i class="atlasPartySwatch dem" aria-hidden="true"></i> Democratic delegation</span>'+
    '<span class="atlasLegendPair"><i class="atlasPartySwatch rep" aria-hidden="true"></i> Republican delegation</span>'+
    '<span class="atlasLegendPair"><i class="atlasPartySwatch split" aria-hidden="true"></i> Split delegation</span>'+
    '<span class="atlasLegendPair"><i class="atlasPartySwatch vacant" aria-hidden="true"></i> Delegation unavailable</span>';
  }
 }else if(layers[layer].type==='countyElection'){
  const unit=state==='AK'?'House district':'county';
  legend.setAttribute('aria-label',unit+' election winner color key');
  legend.innerHTML=
   '<span class="atlasLegendPair"><i class="atlasPartySwatch dem" aria-hidden="true"></i> Democratic '+unit+' winner</span>'+
   '<span class="atlasLegendPair"><i class="atlasPartySwatch rep" aria-hidden="true"></i> Republican '+unit+' winner</span>'+
   '<span class="atlasLegendPair"><i class="atlasPartySwatch vacant" aria-hidden="true"></i> Result unavailable</span>';
 }else{
  legend.setAttribute('aria-label','Current political party color key');
  legend.innerHTML=
   '<span class="atlasLegendPair"><i class="atlasPartySwatch dem" aria-hidden="true"></i> Democratic</span>'+
   '<span class="atlasLegendPair"><i class="atlasPartySwatch rep" aria-hidden="true"></i> Republican</span>'+
   '<span class="atlasLegendPair"><i class="atlasPartySwatch vacant" aria-hidden="true"></i> Vacant</span>';
 }
}
function ui(){
 updateLegend();
 $('congressState').value=state||'';
 $('congressBack').hidden=!state;
 $('districtMapLabel').textContent=stateName()+' · '+layers[layer].title;
 if(!state&&layer==='senate')$('districtVintage').textContent='Current U.S. Senate delegation';
 else if(!state&&layer==='governor')$('districtVintage').textContent='Current governor party';
 else if(!state&&layer==='president')$('districtVintage').textContent='2024 presidential statewide winner';
 else $('districtVintage').textContent=layers[layer].vintage;
 $('atlasHint').textContent=state?
  (layers[layer].type==='countyElection'?(state==='AK'?'Select a House district · Scroll to zoom · Drag to move':'Select a county · Scroll to zoom · Drag to move'):'Select a district · Scroll to zoom · Drag to move'):
  (layers[layer].type==='countyElection'?'Select a state to drill into election results · Scroll to zoom · Drag to move':'Select a state · Scroll to zoom · Drag to move');
 document.querySelectorAll('[data-atlas-layer]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.atlasLayer===layer)));
}
function syncDistrictLabels(k){
 if(!root)return;
 const inv=1/Math.max(.001,k);
 root.selectAll('.atlasDistrictLabel')
  .attr('transform',function(){return 'translate('+this.getAttribute('data-x')+','+this.getAttribute('data-y')+') scale('+inv+')';});
}
function partyForFeature(feature){
 const props=feature?.properties||{};
 const isState=feature?.id!==undefined&&!props.GEOID;
 const fips=isState?String(feature.id).padStart(2,'0'):String(props.STATE||'').padStart(2,'0');
 const code=byFips[fips]?.abbr;
 if(!code)return 'unknown';
 if(layers[layer].type==='countyElection'&&isState)return nationalStateParty(layer,code);
 if(typeof partyResolver!=='function')return 'unknown';
 const result=partyResolver({layer,state:code,scope:isState?'state':'district',district:isState?null:currentCode(feature)});
 return ['democratic','republican','other','split','vacant'].includes(result)?result:'unknown';
}
function paintPartyColors(){
 if(!root)return;
 root.selectAll('.atlasFeature:not(.atlasCounty):not(.atlasElectionDistrict)').attr('data-party',partyForFeature);
}
function canvas(){
 const el=$('atlasViewport'),w=Math.max(250,el.clientWidth),h=Math.max(240,el.clientHeight);
 svg.attr('viewBox','0 0 '+w+' '+h).selectAll('*').remove();root=svg.append('g');
 zoom=d3.zoom().scaleExtent([1,12]).on('zoom',e=>{root.attr('transform',e.transform);syncDistrictLabels(e.transform.k);});
 svg.call(zoom).on('dblclick.zoom',null);
 home=d3.zoomIdentity;svg.call(zoom.transform,home);
 return {w,h};
}
function name(f,isState){
 const s=byFips[String(isState?f.id:f.properties?.STATE).padStart(2,'0')];
 return isState?(s?.name||'State'):(s?.name||stateName())+' · '+layers[layer].title+' · '+model.districtDisplayName(layer,currentCode(f));
}
function plot(features,path,isState,group=root){
 group.selectAll('path').data(features,f=>f.properties?.GEOID||f.id).join('path')
  .attr('d',path).attr('class','atlasFeature'+(isState?' atlasState':''))
  .attr('data-party',partyForFeature)
  .attr('role','button').attr('tabindex',0)
  .attr('aria-label',f=>name(f,isState))
  .on('mousemove',(e,f)=>tipOn(e,name(f,isState))).on('mouseleave',tipOff)
  .on('click',(e,f)=>pick(f,isState))
  .on('keydown',(e,f)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(f,isState);}});
}
function pick(f,isState){
 if(isState){
  const s=byFips[String(f.id).padStart(2,'0')];if(!s)return;
  if(state===s.abbr){display(meta(null,s.fips));return;}
  chooseState(s.abbr);return;
 }
 const s=byFips[String(f.properties?.STATE).padStart(2,'0')];if(!s)return;
 if(!state){chooseState(s.abbr,{geoid:f.properties.GEOID});return;}
 selectFeature(f);
}
function nationalStates(){
 const {w,h}=canvas(),path=d3.geoPath();
 const box=path.bounds({type:'FeatureCollection',features:us});
 const scale=Math.min((w-48)/(box[1][0]-box[0][0]),(h-48)/(box[1][1]-box[0][1]));
 const tx=w/2-scale*(box[0][0]+box[1][0])/2,ty=h/2-scale*(box[0][1]+box[1][1])/2;
 home=d3.zoomIdentity.translate(tx,ty).scale(scale);
 zoom.scaleExtent([scale,Math.max(scale*12,12)]);svg.call(zoom.transform,home);
 plot(us,path,true);
}
function stateOutline(){
 const f=outlines.get(byCode[state]?.fips);if(!f){nationalStates();return;}
 const {w,h}=canvas();
 const projection=d3.geoIdentity().fitExtent([[33,33],[w-33,h-33]],f);
 plot([f],d3.geoPath(projection),true);
}
function countyElectionMap(){
 const stateRecord=byCode[state],outline=outlines.get(stateRecord?.fips);
 if(!stateRecord||!outline){nationalStates();return;}
 const race=electionFor(layer,state);
 const features=countyFeatures.filter(f=>String(f.id).padStart(5,'0').startsWith(stateRecord.fips));
 const {w,h}=canvas();
 const projection=d3.geoIdentity().fitExtent([[33,33],[w-33,h-33]],outline);
 const path=d3.geoPath(projection);
 root.selectAll('path.atlasCounty').data(features,f=>String(f.id).padStart(5,'0')).join('path')
  .attr('d',path)
  .attr('class','atlasFeature atlasCounty')
  .attr('data-party',f=>countyElectionResult(layer,state,String(f.id).padStart(5,'0'))?.party||'unknown')
  .attr('data-election-party',f=>countyElectionResult(layer,state,String(f.id).padStart(5,'0'))?.party||'unknown')
  .attr('role','button').attr('tabindex',0)
  .attr('aria-label',f=>{
   const result=countyElectionResult(layer,state,String(f.id).padStart(5,'0'));
   return (result?.name||'County')+' County'+(result?.winner?' · county winner '+result.winner:' · result unavailable');
  })
  .on('mousemove',(e,f)=>{
   const result=countyElectionResult(layer,state,String(f.id).padStart(5,'0'));
   tipOn(e,(result?.name||'County')+' County'+(result?.winner?' · '+result.winner+' won':' · result unavailable'));
  })
  .on('mouseleave',tipOff)
  .on('click',(e,f)=>selectCounty(f,countyElectionResult(layer,state,String(f.id).padStart(5,'0')),race))
  .on('keydown',(e,f)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectCounty(f,countyElectionResult(layer,state,String(f.id).padStart(5,'0')),race);}});
 if(race){
  const date=race.electionDate||'date unavailable';
  const statusLabel=race.status==='certified'?'Certified':race.status==='unofficial'?'Current unofficial':'Pending';
  $('districtMapLabel').textContent=stateName()+' · '+race.title+' · County results';
  $('districtVintage').textContent=date+' · '+statusLabel+' county results';
  $('atlasHint').textContent='Select a county to see who won · Scroll to zoom · Drag to move';
  if(race.status==='pending'||!Object.keys(race.counties||{}).length)
   status('County election results have not been published to this map yet.');
  else status('');
 }else{
  $('districtMapLabel').textContent=stateName()+' · '+layers[layer].title+' · County results unavailable';
  $('districtVintage').textContent='County boundaries shown · Election results unavailable for this state';
  $('atlasHint').textContent='County outlines shown · results are not loaded for this state';
  status('County election results are not yet available for '+stateName()+'.');
 }
 display(meta(null,stateRecord.fips));
}
function alaskaProjection(w,h,fc,count){
 return d3.geoConicEqualArea()
  .parallels([55,65])
  .rotate([154,0])
  .center([0,58.5])
  .fitExtent(model.districtViewport(w,h,count),fc);
}
async function alaskaStatewideElectionMap(turn){
 const race=electionFor(layer,'AK');
 const key='stateHouse|AK-election';
 try{
  let data=cache.get(key);
  if(!data){
   data=await geojson(BOUNDARY_ASSETS+'/stateHouse/02.geojson');
   const valid=data.features.filter(f=>f.geometry?.coordinates?.length&&String(f.properties?.STATE)==='02');
   data=model.rewindForD3({type:'FeatureCollection',features:valid});
   cache.set(key,data);
  }
  if(turn!==seq)return;
  const features=data.features;
  const {w,h}=canvas();
  const fc={type:'FeatureCollection',features};
  const projection=alaskaProjection(w,h,fc,features.length);
  const path=d3.geoPath(projection);
  root.selectAll('path.atlasElectionDistrict').data(features,f=>String(f.properties?.GEOID||'')).join('path')
   .attr('d',path)
   .attr('class','atlasFeature atlasElectionDistrict')
   .attr('data-party',f=>race?.districts?.[model.electionDistrictKey(model.districtCode(f.properties,'stateHouse'))]?.party||'unknown')
   .attr('data-election-party',f=>race?.districts?.[model.electionDistrictKey(model.districtCode(f.properties,'stateHouse'))]?.party||'unknown')
   .attr('role','button').attr('tabindex',0)
   .attr('aria-label',f=>{
    const code=model.districtCode(f.properties,'stateHouse');
    const result=race?.districts?.[model.electionDistrictKey(code)];
    return 'House District '+code+(result?.winner?' · '+result.winner+' won':' · result unavailable');
   })
   .on('mousemove',(e,f)=>{
    const code=model.districtCode(f.properties,'stateHouse');
    const result=race?.districts?.[model.electionDistrictKey(code)];
    tipOn(e,'House District '+code+(result?.winner?' · '+result.winner+' won':' · result unavailable'));
   })
   .on('mouseleave',tipOff)
   .on('click',(e,f)=>{
    const code=model.districtCode(f.properties,'stateHouse');
    selectElectionDistrict(f,race?.districts?.[model.electionDistrictKey(code)],race);
   })
   .on('keydown',(e,f)=>{
    if(e.key==='Enter'||e.key===' '){
     e.preventDefault();
     const code=model.districtCode(f.properties,'stateHouse');
     selectElectionDistrict(f,race?.districts?.[model.electionDistrictKey(code)],race);
    }
   });
  root.selectAll('.atlasDistrictLabel').data(features.filter(f=>path.area(f)>190)).join('text')
   .attr('class','atlasDistrictLabel').attr('data-x',f=>path.centroid(f)[0]).attr('data-y',f=>path.centroid(f)[1])
   .text(f=>model.districtCode(f.properties,'stateHouse'));
  syncDistrictLabels(d3.zoomTransform(svg.node()).k);
  if(race){
   const statusLabel=race.status==='certified'?'Certified':race.status==='unofficial'?'Current unofficial':'Current';
   $('districtMapLabel').textContent='Alaska · '+race.title+' · House district results';
   $('districtVintage').textContent=race.electionDate+' · '+statusLabel+' House district results';
   $('atlasHint').textContent='Select a House district to see who won · Scroll to zoom · Drag to move';
   status('');
  }else{
   $('districtMapLabel').textContent='Alaska · '+layers[layer].title+' · House district results unavailable';
   $('districtVintage').textContent='Alaska State House district boundaries shown';
   status('House district results are not yet available for this Alaska race.');
  }
  display(meta(null,'02'));
 }catch(error){
  if(turn===seq)status('Alaska House district election geography could not be loaded.');
 }
}
function polygons(data,national){
 const {w,h}=canvas();
 const features=data.features.filter(f=>f.geometry?.coordinates?.length&&byFips[String(f.properties?.STATE)]);
 if(!features.length){status('No districts exist for this legislative chamber in the selected state.');return;}
 const fc={type:'FeatureCollection',features};
 let path,labelFeatures=features;
 if(state==='HI'&&!national){
  const {main,northwest}=model.splitHawaiiIslands(fc);
  if(main.features.length&&northwest.features.length){
   const mainProjection=d3.geoMercator().fitExtent(
    [[Math.max(50,w*.085),Math.max(72,h*.13)],[w-Math.max(50,w*.085),h-Math.max(57,h*.11)]],main);
   path=d3.geoPath(mainProjection);
   const mainGroup=root.append('g').attr('class','atlasHawaiiMain');
   plot(main.features,path,false,mainGroup);labelFeatures=main.features;
   const insetWidth=Math.min(285,Math.max(92,w*.27));
   const ix=w-insetWidth-23,iy=64,ih=Math.min(125,Math.max(74,h*.22));
   const insetGroup=root.append('g').attr('class','atlasHawaiiInset');
   insetGroup.append('rect').attr('class','atlasHawaiiInsetFrame')
    .attr('x',ix-9).attr('y',iy-25).attr('width',insetWidth+18).attr('height',ih+35).attr('rx',12);
   insetGroup.append('text').attr('class','atlasHawaiiInsetLabel').attr('x',ix).attr('y',iy-9).text('NORTHWESTERN ISLANDS');
   const remoteProjection=d3.geoMercator().fitExtent([[ix+9,iy+9],[ix+insetWidth-9,iy+ih-9]],northwest);
   plot(northwest.features,d3.geoPath(remoteProjection),false,insetGroup);
  }
 }
 if(!path){
  const projection=national?d3.geoAlbersUsa():state==='AK'?alaskaProjection(w,h,fc,features.length):d3.geoMercator();
  if(national||state!=='AK')projection.fitExtent(national?[[24,25],[w-24,h-25]]:model.districtViewport(w,h,features.length),fc);
  path=d3.geoPath(projection);plot(features,path,false);
 }
 if(!national){
  root.selectAll('.atlasDistrictLabel').data(labelFeatures.filter(f=>path.area(f)>190)).join('text')
   .attr('class','atlasDistrictLabel').attr('data-x',f=>path.centroid(f)[0]).attr('data-y',f=>path.centroid(f)[1])
   .text(f=>partyModel.districtMarker(layer,currentCode(f)));
  syncDistrictLabels(d3.zoomTransform(svg.node()).k);
 }
 if(!national&&features.length===1){
  $('districtMapLabel').textContent=stateName()+(state==='DC'?' · 1 at-large delegate district':' · 1 at-large U.S. House district');
  $('atlasHint').textContent=state==='DC'?'No internal district boundaries — D.C. elects one delegate.':'No internal district boundaries — one representative district covers the entire state.';
  selectFeature(features[0]);return;
 }
 if(!national&&(pendingCode||pendingGeoid)){
  const match=features.find(f=>currentCode(f)===pendingCode||String(f.properties.GEOID)===pendingGeoid);
  pendingCode=null;pendingGeoid=null;if(match){selectFeature(match);return;}
 }
 if(!national&&state){
  if(district){
   const match=features.find(f=>f.properties?.GEOID===district.properties?.GEOID);
   if(match){selectFeature(match);return;}
  }
  display(meta(null,byCode[state].fips));
 }
}
function boundaryAsset(fips){return fips?BOUNDARY_ASSETS+'/'+layer+'/'+fips+'.geojson':BOUNDARY_ASSETS+'/US-house.geojson';}
async function geojson(url){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),30000);
 try{
  const r=await fetch(url,{credentials:'same-origin',cache:'default',headers:{Accept:'application/json'},signal:c.signal});
  if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json();
  if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('Bad geographic response');
  return data;
 }finally{clearTimeout(timer);}
}
async function refresh(){
 const turn=++seq;ui();tipOff();deselect();
 if(layers[layer].type==='countyElection'){
  if(state==='AK'){await alaskaStatewideElectionMap(turn);hash();return;}
  if(state){countyElectionMap();hash();return;}
  nationalStates();status('');hash();return;
 }
 if(state)stateOutline();else nationalStates();
 if(!state&&layer!=='house'){status('Choose a state to view its '+layers[layer].title.toLowerCase()+'.');hash();return;}
 const key=layer+'|'+(state||'US');
 if(cache.has(key)){status('');polygons(cache.get(key),!state);hash();return;}
 status(state?'Loading official '+layers[layer].title+'…':'Loading national congressional district boundaries…');
 try{
  const fips=state?byCode[state].fips:null;
  const data=await geojson(boundaryAsset(fips));
  if(turn!==seq)return;
  const valid=data.features.filter(f=>f.geometry?.coordinates?.length&&byFips[String(f.properties?.STATE)]);
  if(!valid.length){
   if(data.features.length===0&&state){status('No '+layers[layer].title.toLowerCase()+' exist in '+stateName()+'.');return;}
   throw Error('Missing district GEOIDs');
  }
  const collection=model.rewindForD3({type:'FeatureCollection',features:valid});
  cache.set(key,collection);status('');polygons(collection,!state);
 }catch(error){if(turn===seq)status('Cached map boundaries are temporarily unavailable. Please try again after the next snapshot update.');}
 finally{if(turn===seq)hash();}
}
function chooseState(code,opts={}){
 if(code&&!byCode[code])return;
 state=code||null;pendingCode=opts.code||null;pendingGeoid=opts.geoid||null;refresh();
}
function chooseLayer(value){
 if(!layers[value]||value===layer)return;
 layer=value;pendingCode=null;pendingGeoid=null;refresh();
}
function find(){
 const text=$('districtSearch').value.trim();if(!text)return;
 const found=states.find(s=>s.abbr.toLowerCase()===text.toLowerCase()||s.name.toLowerCase()===text.toLowerCase());
 if(found){chooseState(found.abbr);return;}
 const m=text.match(/^([a-z]{2})[ -]?0*(\d{1,3})$/i)||text.match(/^(0*\d{1,3})$/);
 if(m&&layers[layer].type==='district'){
  const abbreviation=m.length===3?m[1].toUpperCase():state;
  const n=m.length===3?m[2]:m[1];
  if(abbreviation&&byCode[abbreviation]){
   const code=String(Number(n)).padStart(digits(),'0');
   if(abbreviation===state&&cache.has(layer+'|'+state)){pendingCode=code;polygons(cache.get(layer+'|'+state),false);}
   else chooseState(abbreviation,{code});
   return;
  }
 }
 status('No matching geography. Try California, CA-05, or a district number.');
}
const route=location.hash.replace(/^#/,'').split('/');
if(byCode[route[0]])state=route[0];
if(layers[route[1]])layer=route[1];
if(/^\d{1,3}$/.test(route[2]||''))pendingCode=route[2];
$('congressState').innerHTML='<option value="">All states</option>'+states.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(s=>'<option value="'+s.abbr+'">'+s.name+'</option>').join('');
document.querySelectorAll('[data-atlas-layer]').forEach(b=>b.addEventListener('click',()=>chooseLayer(b.dataset.atlasLayer)));
$('congressState').addEventListener('change',e=>chooseState(e.target.value));
$('congressBack').addEventListener('click',()=>chooseState(null));
$('districtFind').addEventListener('click',find);
$('districtSearch').addEventListener('keydown',e=>{if(e.key==='Enter')find();});
$('selectionClose').addEventListener('click',()=>{deselect(true);hash();});
window.addEventListener('resize',()=>{
 if(state==='AK'&&layers[layer].type==='countyElection'){alaskaStatewideElectionMap(seq);return;}
 if(state&&layers[layer].type==='countyElection'){countyElectionMap();return;}
 const item=cache.get(layer+'|'+(state||'US'));
 if(item&&layers[layer].type==='district')polygons(item,!state);
 else if(state)stateOutline();else nationalStates();
});
window.POLITICS_CONGRESSIONAL_ATLAS=Object.freeze({
 selectState:chooseState,selectLayer:chooseLayer,
 setPartyResolver(fn){partyResolver=typeof fn==='function'?fn:null;paintPartyColors();},
 selectDistrict(code){if(!state||layers[layer].type!=='district')return false;
  pendingCode=String(Number(code)).padStart(digits(),'0');
  if(cache.has(layer+'|'+state))polygons(cache.get(layer+'|'+state),false);return true;
 },
 getSelection:()=>chosen?{...chosen}:null,getLayer:()=>layer,getState:()=>state,
 countyElectionResult
});
refresh();
})();
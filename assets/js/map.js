/* POLITICS state/county map, independent of the Directory database. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const states=window.GEO_STATES, topo=window.US_ATLAS, model=window.GEO_UTIL;
const svg=d3.select('#mapSvg'),tooltip=d3.select('#tooltip');
const colors=window.GEO_COLORS;
const sfips=Object.fromEntries(states.map(s=>[s.fips,s]));
const sabbr=Object.fromEntries(states.map(s=>[s.abbr,s]));
const sel={abbr:null,fips:null};
const counties=new Map(), byState=new Map(), stateShapes=new Map();
let stateFeatures=[],countyFeatures=[],width=0,height=0,busy=false;
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function initGeo(){
  stateFeatures=topojson.feature(topo,topo.objects.states).features;
  countyFeatures=topojson.feature(topo,topo.objects.counties).features;
  for(const c of countyFeatures){
    const fips=String(c.id).padStart(5,'0'),prefix=fips.slice(0,2);
    counties.set(fips,c);
    if(!byState.has(prefix))byState.set(prefix,[]);
    byState.get(prefix).push(c);
  }
  for(const s of stateFeatures){
    const abbr=sfips[String(s.id).padStart(2,'0')]?.abbr;
    if(abbr)stateShapes.set(abbr,s);
  }
}
function resize(){
  const shell=document.querySelector('#view-map .mapShell');
  width=shell.clientWidth;height=shell.clientHeight;svg.attr('viewBox',[0,0,width,height]);
}
function showTip(e,html){
  tooltip.style('display','block').style('left',Math.max(8,Math.min(e.clientX+14,innerWidth-270))+'px')
    .style('top',Math.max(8,Math.min(e.clientY+14,innerHeight-100))+'px').html(html);
}
function hideTip(){tooltip.style('display','none');}
function usLayout(){
  const [[x0,y0],[x1,y1]]=d3.geoPath().bounds({type:'FeatureCollection',features:stateFeatures});
  const k=Math.min((width-56)/(x1-x0),(height-56)/(y1-y0));
  return {k,tx:width/2-k*(x0+x1)/2,ty:height/2-k*(y0+y1)/2};
}
function chrome(){
  const state=sabbr[sel.abbr],county=counties.get(sel.fips);
  $('crumb').hidden=!state;
  if(state)$('crumbText').textContent=state.name+(county?' › '+county.properties.name+' County':'');
  $('backBtn').hidden=!state;
  $('modeBadge').textContent=state?state.name+(county?' · County':' · State averages'):'U.S. map';
  $('navStats').textContent=stateFeatures.length+' regions · '+countyFeatures.length.toLocaleString()+' county boundaries';
  try{history.replaceState(null,'',model.makeHash(sel));}catch(e){}
}
function render(opts={}){
  resize();
  if(width<=0||height<=0)return;
  svg.selectAll('*').remove();
  if(sel.abbr)renderState(opts);else renderUS(opts);
  chrome();renderCard();
}
function renderUS(opts){
  $('mapLabel').textContent='U.S. map · select a state to explore its counties';
  $('legend').hidden=true;
  const L=usLayout(),path=d3.geoPath();
  const g=svg.append('g').attr('class','usLayer'+(opts.fade?' fadeIn':''))
    .attr('transform','translate('+L.tx+','+L.ty+') scale('+L.k+')');
  g.selectAll('path').data(stateFeatures).join('path')
    .attr('class','state hasData').attr('d',path)
    .style('--geo-fill',d=>colors.state(String(d.id).padStart(2,'0')).fill)
    .style('--geo-hover',d=>colors.state(String(d.id).padStart(2,'0')).hover)
    .style('--geo-dark',d=>colors.state(String(d.id).padStart(2,'0')).dark)
    .style('--geo-glow',d=>colors.state(String(d.id).padStart(2,'0')).glow)
    .attr('role','button').attr('tabindex',0)
    .attr('aria-label',d=>d.properties.name+' state map')
    .on('mousemove',(e,d)=>{
      const fips=String(d.id).padStart(2,'0');
      showTip(e,'<b>'+esc(d.properties.name)+'</b><br>'+(byState.get(fips)||[]).length+' county boundaries');
    })
    .on('mouseleave',hideTip)
    .on('click',(e,d)=>{
      const s=sfips[String(d.id).padStart(2,'0')];
      if(s)zoomState(d,s.abbr,L);
    })
    .on('keydown',(e,d)=>{
      if(e.key==='Enter'||e.key===' '){
        e.preventDefault();
        const s=sfips[String(d.id).padStart(2,'0')];
        if(s)zoomState(d,s.abbr,L);
      }
    });
}
function zoomState(feature,abbr,L){
  if(busy)return;
  busy=true;hideTip();
  const [[x0,y0],[x1,y1]]=d3.geoPath().bounds(feature);
  const w=Math.max(1,(x1-x0)*L.k),h=Math.max(1,(y1-y0)*L.k);
  const k=L.k*.82*Math.min(width/w,height/h);
  const tx=width/2-k*(x0+x1)/2,ty=height/2-k*(y0+y1)/2;
  const id=String(feature.id).padStart(2,'0');
  const g=svg.select('g.usLayer');
  g.selectAll('path').filter(d=>String(d.id).padStart(2,'0')!==id).transition().duration(600).style('opacity',0);
  g.transition().duration(650).ease(d3.easeCubicInOut)
    .attr('transform','translate('+tx+','+ty+') scale('+k+')')
    .on('end',()=>{busy=false;selectState(abbr);});
}
function renderState(opts){
  const state=sabbr[sel.abbr];
  if(!state){sel.abbr=null;render(opts);return;}
  const features=byState.get(state.fips)||[],outline=stateShapes.get(state.abbr);
  $('mapLabel').textContent=state.name+' · state averages; select any county for local figures';
  $('legend').hidden=true;
  const pad=24,shape={type:'FeatureCollection',features:outline?[outline]:features};
  const proj=d3.geoIdentity().reflectY(false).fitSize([Math.max(1,width-pad*2),Math.max(1,height-pad*2)],shape);
  const path=d3.geoPath(proj);
  const parentColor=colors.state(state.fips);
  const g=svg.append('g').attr('class','countyLayer'+(opts.fade?' fadeIn':''))
    .attr('transform','translate('+pad+','+pad+')');
  g.selectAll('path').data(features).join('path').attr('d',path)
    .attr('class',d=>'county'+(String(d.id).padStart(5,'0')===sel.fips?' active':''))
    .style('--geo-fill',d=>colors.county(state.fips,String(d.id).padStart(5,'0')).fill)
    .style('--geo-hover',d=>colors.county(state.fips,String(d.id).padStart(5,'0')).hover)
    .style('--geo-dark',parentColor.dark).style('--geo-glow',parentColor.glow)
    .attr('role','button').attr('tabindex',0).attr('aria-label',d=>d.properties.name+' County')
    .on('mousemove',(e,d)=>showTip(e,'<b>'+esc(d.properties.name)+' County</b><br>'+esc(state.name)+' · FIPS '+String(d.id).padStart(5,'0')))
    .on('mouseleave',hideTip)
    .on('click',(e,d)=>selectCounty(String(d.id).padStart(5,'0')))
    .on('keydown',(e,d)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectCounty(String(d.id).padStart(5,'0'));}});
  // Only real geography paths receive selection effects; there is no rectangular overlay.
  if(outline){
    const border=g.append('g').attr('class','stateSelectedBoundary').attr('aria-hidden','true')
      .style('pointer-events','none').style('--geo-dark',parentColor.dark).style('--geo-glow',parentColor.glow);
    border.append('path').datum(outline).attr('d',path).attr('class','stateOutlineBase');
    if(!sel.fips)border.append('path').datum(outline).attr('d',path).attr('class','stateLightTrace').attr('pathLength',1000);
  }
  if(sel.fips){
    const selectedFeature=counties.get(sel.fips),accent=colors.county(state.fips,sel.fips);
    if(selectedFeature){
      // Illuminate the county's interior without tracing, widening, or glowing its boundary.
      const light=g.append('g').attr('class','countySelectedIllumination')
        .attr('aria-hidden','true').style('pointer-events','none');
      const gradient=light.append('defs').append('radialGradient')
        .attr('id','selectedCountyInnerGlow').attr('cx','47%').attr('cy','42%').attr('r','72%');
      gradient.append('stop').attr('offset','0%').attr('stop-color',accent.glow).attr('stop-opacity',0.62);
      gradient.append('stop').attr('offset','58%').attr('stop-color',accent.glow).attr('stop-opacity',0.24);
      gradient.append('stop').attr('offset','100%').attr('stop-color',accent.glow).attr('stop-opacity',0);
      light.append('path').datum(selectedFeature).attr('d',path).attr('class','countyInnerLight')
        .attr('fill','url(#selectedCountyInnerGlow)').attr('stroke','none');
    }
  }
}


const CATEGORY_TITLES={
 housing:'Housing & affordability',
 jobs:'Jobs & wages',
 income:'Income & inequality',
 healthcare:'Healthcare access',
 education:'Education',
 families:'Families & demographics',
 infrastructure:'Infrastructure'
};
const CATEGORIES=Object.keys(CATEGORY_TITLES);
const CORE_FIELDS=[
 ['population','Population','count'],
 ['medianHouseholdIncome','Median household income','currency'],
 ['povertyRate','Poverty rate','percent'],
 ['medianGrossRent','Median gross monthly rent','currency']
];
function metricFormat(value,unit){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0)return 'Unavailable';
 if(unit==='currency')return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
 if(unit==='count')return new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(value);
 if(unit==='percent')return value.toLocaleString('en-US',{maximumFractionDigits:1})+'%';
 if(unit==='ratio')return value.toFixed(3);
 return value.toLocaleString('en-US',{maximumFractionDigits:1});
}
function metricGrid(values){
 return '<div class="countyFactGrid">'+values.map(([label,value,unit])=>
  '<div class="countyFact"><span>'+esc(label)+'</span><strong>'+esc(metricFormat(value,unit))+'</strong></div>').join('')+'</div>';
}
/* Keyless indicators are stored in the same D1-backed cache as Census.
 * CDC PLACES rates are model estimates, never a happiness index or a county ranking. */
function renderCdcPlaces(data,scope,selected){
 const ds=data?.places;
 const title='<h3 class="countyFactsTitle">Health &amp; well-being · CDC PLACES</h3>';
 if(!ds?.fields||!ds?.counties)return '<section class="countyMetricSection">'+title+
  '<p class="categoryNote">CDC PLACES data awaiting first scheduled collection.</p></section>';
 const stateMode=scope==='state';
 const row=stateMode?Object.fromEntries(Object.keys(ds.fields).map(k=>
  [k,window.POLITICS_GEO_STATS.countyAverage(ds,selected,k)])):(ds.counties[selected]||{});
 const metrics=Object.entries(ds.fields).map(([key,meta])=>[
  (stateMode?'Average county ':'')+String(meta.label||key),row[key],meta.unit||'percent'
 ]);
 const note=stateMode?'Equal-weight averages of available county model estimates; not official statewide rates.':
  'Modeled county estimates, not direct survey results for this county.';
 return '<section class="countyMetricSection" aria-label="CDC PLACES health and well-being">'+title+
  metricGrid(metrics)+'<p class="countyFactSource">'+esc(note)+
  ' CDC PLACES 2025 release (mostly 2023 BRFSS data). Not a happiness index or measure of policy effects. '+
  '<a href="https://data.cdc.gov/d/i46a-9kgh" target="_blank" rel="noopener noreferrer">CDC source</a>.</p></section>';
}
function renderCongressionalDelegation(data,state,stateMode){
 const ds=data?.congress,entry=ds?.states?.[state.abbr];
 const title='<h3 class="countyFactsTitle">Congressional delegation · political representation</h3>';
 if(!entry)return '<section class="countyMetricSection" aria-label="Political representation">'+title+
  '<p class="categoryNote">Congressional incumbent information awaiting first scheduled collection.</p></section>';
 const name=member=>'<a href="https://bioguide.congress.gov/search/bio/'+
  encodeURIComponent(member.bioguide||'')+'" target="_blank" rel="noopener noreferrer">'+esc(member.name)+'</a>';
 const senators=(entry.senators||[]).map(m=>'<div class="countyFact"><span>U.S. senator · '+
  esc(m.party)+'</span><strong>'+name(m)+'</strong></div>').join('')||
  '<p class="categoryNote">No currently serving U.S. senator found in this source.</p>';
 const house=entry.house||[];
 const partyCounts={};
 for(const m of house)partyCounts[m.party]=(partyCounts[m.party]||0)+1;
 const breakdown=Object.entries(partyCounts).map(([p,n])=>esc(p)+': '+n).join(' · ');
 const members=stateMode?'<div class="countyFactGrid">'+house.slice(0,8).map(m=>
  '<div class="countyFact"><span>U.S. House · District '+esc(m.district??'at-large')+
  ' · '+esc(m.party)+'</span><strong>'+name(m)+'</strong></div>').join('')+'</div>'+
  (house.length>8?'<p class="categoryNote">Showing 8 of '+house.length+' House members.</p>':''):'';
 const scopeNote=stateMode?'This delegation does not determine state-government control.':
  'U.S. senators represent the entire state. House districts may cross county borders; no county-specific U.S. House member is inferred.';
 return '<section class="countyMetricSection" aria-label="Political representation">'+title+
  '<div class="countyFactGrid">'+senators+'</div>'+
  '<p class="categoryNote">State House delegation: '+house.length+' members'+
  (breakdown?' ('+breakdown+')':'')+'.</p>'+members+
  '<p class="countyFactSource">'+scopeNote+' Incumbents as of '+esc(ds.asOf||'last collection')+
  ', not election winners. <a href="https://github.com/unitedstates/congress-legislators" target="_blank" rel="noopener noreferrer">Source and methodology</a>. '+
  'State legislators, governor, and county officials require separate verified data.</p></section>';
}

function categorySections(data,scope,selected){
 const groups=[],pending=[];
 const averages=scope==='state'?window.POLITICS_GEO_STATS.getStateAverages(data,selected):null;
 for(const category of CATEGORIES){
  const ds=data?.categories?.[category];
  if(!ds?.counties||!ds?.fields){
   pending.push(CATEGORY_TITLES[category]);
   continue;
  }
  const row=scope==='state'?averages?.[category]:ds.counties[selected];
  const metrics=Object.entries(ds.fields).map(([key,meta])=>{
   const label=meta?.label||key,unit=meta?.unit||'decimal';
   return [scope==='state'?'Average county '+label.charAt(0).toLowerCase()+label.slice(1):label,row?.[key],unit];
  });
  if(!metrics.some(([,value])=>typeof value==='number'&&Number.isFinite(value)&&value>=0)){
   pending.push(CATEGORY_TITLES[category]);
   continue;
  }
  groups.push('<section class="countyMetricSection" aria-label="'+esc(CATEGORY_TITLES[category])+'">'+
   '<h3 class="countyFactsTitle">'+esc(CATEGORY_TITLES[category])+'</h3>'+
   metricGrid(metrics)+'</section>');
 }
 return groups.join('')+(pending.length?
  '<p class="categoryNote">No stored figures yet for: '+pending.map(esc).join(', ')+'.</p>':'');
}
function renderCard(){
 const card=$('selectedCard'),county=counties.get(sel.fips),state=sabbr[sel.abbr];
 if(!state){card.hidden=true;return;}
 const data=window.POLITICS_COUNTY_CACHE?.get();
 const base=data?.core||null;
 const stateMode=!county;
 const selected=stateMode?state.fips:sel.fips;
 const publicSources=renderCongressionalDelegation(data,state,stateMode)+
  renderCdcPlaces(data,stateMode?'state':'county',selected);
 card.hidden=false;
 card.innerHTML='<button class="cardClose" type="button" aria-label="'+(stateMode?'Return to U.S. map':'Return to state averages')+'">×</button>'+
  '<div class="countyName">'+esc(stateMode?state.name:county.properties.name+' County')+'</div>'+
  '<div class="cardSub">'+(stateMode?'State-level overview · Selected state boundary':esc(state.name)+' · FIPS '+esc(sel.fips))+'</div>'+
  '<div id="countyFacts" class="countyFacts" aria-live="polite"></div>';
 card.querySelector('.cardClose').onclick=()=>stateMode?goHome():(sel.fips=null,render());
 const target=$('countyFacts');
 if(!base?.counties){
  target.innerHTML=publicSources+
   '<p class="categoryNote">'+(window.POLITICS_COUNTY_CACHE?.status==='error'?
    'Saved Census statistics could not be loaded.':'Loading stored Census statistics…')+'</p>';
  return;
 }
 if(stateMode){
  const avg=window.POLITICS_GEO_STATS.getStateAverages(data,state.fips).overview;
  const vals=[
   ['Average county population',avg.avgCountyPopulation,'count'],
   ['Average county median household income',avg.avgCountyMedianHouseholdIncome,'currency'],
   ['Average county poverty rate',avg.avgCountyPovertyRate,'percent'],
   ['Average county median gross rent',avg.avgCountyMedianGrossRent,'currency']
  ];
  const stateOnly=data?.states?.states?.[state.abbr];
  const stateOnlyPanel=stateOnly?'<div class="countyFactsTitle stateOnlyTitle">State-only data</div>'+
    metricGrid([['Residential electricity price',stateOnly.residentialElectricityCentsKwh,'decimal']])+
    '<div class="countyFactSource">U.S. EIA · '+esc(stateOnly.period||'latest reporting month')+
    ' · cents per kWh. This figure is statewide, not an average of counties.</div>':
    '<div class="countyFactsTitle stateOnlyTitle">State-only data</div><p class="categoryNote">Scheduled state-only source measurements will appear here when collected.</p>';
  target.innerHTML=publicSources+
   '<p class="categoryNote">Equal-weight arithmetic averages of the county figures—not population-weighted or statewide estimates.</p>'+
   '<div class="countyFactsTitle">Statewide view · County averages</div>'+metricGrid(vals)+
   stateOnlyPanel+categorySections(data,'state',state.fips)+
   '<p class="countyFactSource">Census ACS '+esc(String(base.year||2024))+' five-year estimates (2020–2024). Averages include counties with available values for each indicator. No provider APIs are called on a selection.</p>';
 }else{
  const r=base.counties[sel.fips];
  if(!r){target.innerHTML=publicSources+'<p class="categoryNote">This county is not in the current stored Census snapshot.</p>';return;}
  target.innerHTML=publicSources+'<div class="countyFactsTitle">County conditions</div>'+
   metricGrid(CORE_FIELDS.map(([key,label,unit])=>[label,r[key],unit]))+
   categorySections(data,'county',sel.fips)+
   '<p class="countyFactSource">Source: U.S. Census ACS '+esc(String(base.year||2024))+' five-year estimates (2020–2024). '+ 
   '<a href="'+esc(base.sourceUrl||'https://api.census.gov/data/2024/acs/acs5')+'" target="_blank" rel="noopener noreferrer">Official data</a>.</p>';
 }
}

function selectState(abbr){
  if(!sabbr[abbr])return;
  busy=false;sel.abbr=abbr;sel.fips=null;hideTip();render({fade:true});
}
function selectCounty(fips){
  if(!counties.has(fips))return;
  const state=sfips[fips.slice(0,2)];
  if(!state)return;
  busy=false;sel.abbr=state.abbr;sel.fips=fips;hideTip();render();
}
function goHome(){busy=false;sel.abbr=null;sel.fips=null;hideTip();render({fade:true});}
function renderSearch(){
  const box=$('mapResults'),q=$('mapSearch').value;
  const hits=model.search(q,states,countyFeatures,sfips);
  box._hits=hits;box.hidden=q.trim().length<2;
  box.innerHTML=hits.length?hits.map((h,i)=>
    '<button type="button" class="listItem" data-index="'+i+'"><b>'+esc(h.type==='state'?h.name:h.name+' County')+'</b>'+
    '<span class="pill">'+(h.type==='state'?'State':esc(h.stateName)+' · '+h.fips)+'</span></button>'
  ).join(''):'<div class="muted" style="padding:12px">No matching states or counties</div>';
}
$('mapSearch').addEventListener('input',renderSearch);
$('mapSearch').addEventListener('keydown',e=>{
  if(e.key==='Escape')$('mapResults').hidden=true;
  if(e.key==='Enter')$('mapResults').querySelector('.listItem')?.click();
});
$('mapResults').addEventListener('click',e=>{
  const btn=e.target.closest('[data-index]');
  if(!btn)return;
  const hit=$('mapResults')._hits[Number(btn.dataset.index)];
  $('mapResults').hidden=true;$('mapSearch').value='';
  if(hit.type==='state')selectState(hit.abbr);else selectCounty(hit.fips);
});
$('backBtn').onclick=goHome;
$('crumbClear').onclick=goHome;
document.addEventListener('click',e=>{if(!e.target.closest('.mapToolbar'))$('mapResults').hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sel.fips){sel.fips=null;render();}});
document.addEventListener('mousemove',e=>{const glow=$('cursorGlow');glow.style.left=e.clientX+'px';glow.style.top=e.clientY+'px';});
window.addEventListener('resize',()=>{if(!busy)render();});
window.addEventListener('hashchange',()=>{
  const next=model.parseHash(location.hash,states,counties);
  sel.abbr=next.abbr;sel.fips=next.fips;busy=false;render();
});
try{
  initGeo();$('loading').hidden=true;
  const initial=model.parseHash(location.hash,states,counties);
  sel.abbr=initial.abbr;sel.fips=initial.fips;
  render();
  window.__politicsMap={sel,selectState,selectCounty,goHome,search:q=>model.search(q,states,countyFeatures,sfips)};
  window.addEventListener('politics-county-snapshot-ready',()=>{if(sel.abbr)renderCard();});

}catch(err){
  $('loading').textContent='Unable to load map geometry';
  $('mapLabel').textContent=err.message;
  console.error(err);
}
})();

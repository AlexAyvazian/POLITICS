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
/* Open States is statewide, and contains partial samples until scheduled
 * national ingestion succeeds; never treat entries as county incumbents. */
function renderOpenStates(data,state,stateMode){
 const ds=data?.openstates?.[state.abbr],status=data?.openstatesStatus?.[state.abbr];
 const title='<h3 class="countyFactsTitle">State legislators &amp; bills · Open States</h3>';
 const source='<a href="https://docs.openstates.org/api-v3/" target="_blank" rel="noopener noreferrer">Open States API and coverage</a>';
 if(!ds)return '<section class="countyMetricSection" aria-label="Open States legislation">'+title+
  '<p class="categoryNote">'+esc(status==='error'?'Stored Open States snapshot unavailable.':
   status==='loading'?'Loading stored state legislative records…':
   'State legislature records pending scheduled Open States collection.')+'</p>'+
  '<p class="countyFactSource">'+source+'</p></section>';
 const role=(p)=>[p.role,p.district?'District '+p.district:'',p.party].filter(Boolean).join(' · ');
 const people=(ds.people||[]).slice(0,8).map(p=>
  '<div class="countyFact"><span>'+esc(role(p)||'State legislator')+
  '</span><strong>'+esc(p.name)+'</strong></div>').join('');
 const bills=(ds.bills||[]).slice(0,8).map(b=>{
  const allowed=/^https:\/\/(?:open\.pluralpolicy\.com|openstates\.org)\//.test(b.url||'');
  const text=esc(b.identifier||'Bill')+' · '+esc(b.title||'No title');
  const link=allowed?'<a href="'+esc(b.url)+'" target="_blank" rel="noopener noreferrer">'+text+'</a>':text;
  return '<div class="countyFact"><span>'+esc(b.action||'Action not reported')+
   (b.actionDate?' · '+esc(b.actionDate):'')+'</span><strong>'+link+'</strong></div>';
 }).join('');
 const context=stateMode?'':'State lawmakers and bills are shown for the entire state, not assigned to this county. ';
 return '<section class="countyMetricSection" aria-label="Open States legislation">'+title+
  '<h4 class="countyFactsTitle">State lawmakers (sample)</h4>'+
  (people?'<div class="countyFactGrid">'+people+'</div>':'<p class="categoryNote">No state legislator records in this snapshot.</p>')+
  '<h4 class="countyFactsTitle">Bills and recent actions (sample)</h4>'+
  (bills?'<div class="countyFactGrid">'+bills+'</div>':'<p class="categoryNote">No bill records in this snapshot.</p>')+
  '<p class="countyFactSource">'+esc(context)+'Showing up to 8 of each from a partial API snapshot; not a complete legislature or voting history. Downloaded '+
  esc(ds.retrievedAt||'unknown')+'. '+source+'.</p></section>';
}
/* Congress.gov's 119th Congress House roll-call feed contains official
 * individual member votes on legislation; it is not a Senate vote database. */
function renderHouseVotes(data,state,stateMode){
 const ds=data?.houseVotes;
 const title='<h3 class="countyFactsTitle">House roll-call votes · Congress.gov</h3>';
 const source='<a href="https://api.congress.gov/" target="_blank" rel="noopener noreferrer">Official Congress.gov API</a>';
 if(!ds?.votes?.length)return '<section class="countyMetricSection" aria-label="U.S. House roll calls">'+title+
  '<p class="categoryNote">'+esc(data?.houseVotesStatus==='error'?'Stored House voting records unavailable.':
   'House roll-call records pending scheduled collection.')+'</p><p class="countyFactSource">'+source+'</p></section>';
 const chunks=ds.votes.slice(0,6).map(v=>{
  const stateVotes=Array.isArray(v.stateVotes?.[state.abbr])?v.stateVotes[state.abbr]:[];
  const n=Number(v.voteNumber);
  if(!Number.isInteger(n)||n<1)return '';
  const identity=(v.legislationType&&v.legislationNumber?v.legislationType+' '+v.legislationNumber:'House roll call')+
   ' · Vote '+n;
  const official='https://clerk.house.gov/Votes/2026'+n;
  const people=stateVotes.slice(0,6).map(x=>'<div class="countyFact"><span>'+
   esc(x.name||'U.S. representative')+' · '+esc(x.party||'')+
   '</span><strong>'+esc(x.cast||'Vote unavailable')+'</strong></div>').join('');
  return '<div class="countyMetricSection"><div class="countyFactsTitle"><a href="'+
   official+'" target="_blank" rel="noopener noreferrer">'+esc(identity)+'</a></div>'+
   '<p class="categoryNote">'+esc(v.question||v.result||'Recorded vote')+' · '+esc(v.date||'Date not reported')+'</p>'+
   (people?'<div class="countyFactGrid">'+people+'</div>':'<p class="categoryNote">No individual member votes for this state in this sample.</p>')+
   (stateVotes.length>6?'<p class="categoryNote">Showing 6 of '+stateVotes.length+' state delegation votes for this roll call.</p>':'')+'</div>';
 }).filter(Boolean).join('');
 return '<section class="countyMetricSection" aria-label="U.S. House roll calls">'+title+chunks+
  '<p class="countyFactSource">'+(stateMode?'':'These are House members from the state, not a county-specific congressional district. ')+
  'Official recorded House legislative votes only; this does not include Senate votes or all House roll calls. Last downloaded '+
  esc(ds.retrievedAt||'unknown')+'. '+source+'.</p></section>';
}

/* NCSL published state political control. This is as-of state-level data only,
 * not a county government claim or an election forecast. */
function renderStatePoliticalControl(state,stateMode){
 const src=window.POLITICS_NCSL;
 const row=src?.states?.[state.abbr];
 const title='<h3 class="countyFactsTitle">Who controls state government? · NCSL</h3>';
 if(!row)return '<section class="countyMetricSection" aria-label="State political control">'+title+
  '<p class="categoryNote">'+(state.abbr==='DC'?'District of Columbia has a city council, not a state legislature or governor.':
  'State control data unavailable.')+'</p>'+
  '<p class="countyFactSource"><a href="https://www.ncsl.org/about-state-legislatures/state-partisan-composition" target="_blank" rel="noopener noreferrer">NCSL source</a></p></section>';
 const party=code=>({D:'Democratic',R:'Republican',S:'Divided / split','N/A':'Not applicable',
  Nonpartisan:'Nonpartisan'}[code]||'Not classified');
 const seatText=c=>'Democratic '+c.dem+' · Republican '+c.rep+
  (c.other?' · Other '+c.other:'')+(c.vacant?' · Vacant '+c.vacant:'');
 const groups=[
  ['Governor party',party(row.governor)],
  ['Legislature',party(row.legislature)],
  ['Overall state control',party(row.stateControl)],
  ...(state.abbr==='NE'?[['Unicameral Legislature',seatText(row.senate)]]:[
   ['State House / Assembly',seatText(row.house)],
   ['State Senate',seatText(row.senate)]])
 ];
 const grid='<div class="countyFactGrid">'+groups.map(([label,val])=>
  '<div class="countyFact"><span>'+esc(label)+'</span><strong>'+esc(val)+'</strong></div>').join('')+'</div>';
 const context=stateMode?'Statewide political composition, not a measure of policy outcomes.':
  'State-level control; does not determine which party governs this county.';
 return '<section class="countyMetricSection" aria-label="State political control">'+title+grid+
  '<p class="countyFactSource">'+esc(context)+' NCSL snapshot updated '+esc(src.asOf)+
  '; control can change after this date. Numerical majorities may differ from coalition arrangements. '+
  '<a href="'+esc(src.sourceUrl)+'" target="_blank" rel="noopener noreferrer">NCSL source</a>.</p></section>';
}
/* Bill Commons data are cached by state in existing D1; never attach a bill or
 * statewide legislature to a specific county or claim the list is exhaustive. */
function renderBillCommons(data,state,stateMode){
 const snapshot=data?.bills?.[state.abbr],status=data?.billStatus?.[state.abbr];
 const title='<h3 class="countyFactsTitle">State legislation · Bill Commons</h3>';
 const source='<a href="https://billcommons.org/docs/api" target="_blank" rel="noopener noreferrer">Bill Commons data and coverage</a>';
 if(!Array.isArray(snapshot?.items)||!snapshot.items.length){
  const msg=status==='error'?'Saved bill data could not be loaded.':
   status==='loading'?'Loading stored bill records…':
   'State bill records pending scheduled collection or unavailable from source.';
  return '<section class="countyMetricSection" aria-label="State legislative bills">'+title+
   '<p class="categoryNote">'+esc(msg)+'</p><p class="countyFactSource">'+source+'</p></section>';
 }
 const items=snapshot.items.slice(0,12).map(b=>{
  const url='https://api.billcommons.org/api/v1/bills/'+encodeURIComponent(b.id||'');
  return '<div class="countyFact"><span>'+esc(b.identifier||'Bill')+' · '+esc(b.status||'Status not reported')+
   '</span><strong><a href="'+url+'" target="_blank" rel="noopener noreferrer">'+esc(b.title||'Untitled')+
   '</a></strong></div>';
 }).join('');
 const context=stateMode?'':'These are state legislative records, not actions by county government. ';
 return '<section class="countyMetricSection" aria-label="State legislative bills">'+title+
  '<div class="countyFactGrid">'+items+'</div>'+
  '<p class="countyFactSource">'+esc(context)+'Sample of '+snapshot.items.length+
  ' indexed bills, not the complete session or confirmed latest actions. '+
  'Last downloaded '+esc(snapshot.retrievedAt||'unknown')+
  '; upstream freshness is not guaranteed. '+source+'.</p></section>';
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
 // Only our own D1 reader is contacted here; no Bill Commons requests on clicks.
 window.POLITICS_COUNTY_CACHE?.loadBills?.(state.abbr);
 window.POLITICS_COUNTY_CACHE?.loadOpenStates?.(state.abbr);
 const publicSources=renderStatePoliticalControl(state,stateMode)+
  renderOpenStates(data,state,stateMode)+
  renderHouseVotes(data,state,stateMode)+
  renderBillCommons(data,state,stateMode)+
  renderCongressionalDelegation(data,state,stateMode)+
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

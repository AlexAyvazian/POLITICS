/* Congressional Atlas geographic and representative matching contracts.
 * Independent of the existing county map and county aggregation logic. */
(function(root){
'use strict';
const CENSUS='https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2025/Legislative/MapServer/';
const LAYERS=Object.freeze({
 house:{id:5,label:'U.S. House districts',vintage:'119th Congress · 2025 boundaries',codeLength:2},
 stateSenate:{id:8,label:'State Senate districts',vintage:'2024 district boundaries',codeLength:3},
 stateHouse:{id:9,label:'State House / Assembly districts',vintage:'2024 district boundaries',codeLength:3}
});
function censusUrl(layer,stateFips){
 if(!LAYERS[layer]||!/^[0-9]{2}$/.test(String(stateFips))||String(stateFips)==='00')return null;
 const params={
  where:"STATE='"+stateFips+"'",outFields:'GEOID,BASENAME,STATE',
  outSR:'4326',geometryPrecision:'4',returnGeometry:'true',f:'geojson'
 };
 return CENSUS+LAYERS[layer].id+'/query?'+
  Object.entries(params).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
}
function districtCode(props,layer){
 const size=LAYERS[layer]?.codeLength;
 if(!size)return null;
 const id=String(props?.GEOID||'');
 if(!/^[0-9]+$/.test(id)||id.length!==size+2)return null;
 return id.slice(2);
}
function liveTerm(person,asOf){
 const terms=person?.terms||[];
 return [...terms].reverse().find(x=>x?.start<=asOf&&(!x.end||asOf<x.end));
}
function federalMembers(people,state,type,district,asOf){
 if(!Array.isArray(people)||!/^[A-Z]{2}$/.test(state))return [];
 const chamber=type==='house'?'rep':'sen';
 return people.map(person=>{
  const term=liveTerm(person,asOf);
  if(!term||term.type!==chamber||term.state!==state)return null;
  if(type==='house'&&Number(term.district)!==Number(district))return null;
  return {name:person.name?.official_full||[person.name?.first,person.name?.last].filter(Boolean).join(' '),
   party:term.party||'Not listed',district:term.district??null,
   bioguide:person.id?.bioguide||'',start:term.start,end:term.end};
 }).filter(x=>x?.name);
}
function stateLawmakerMatches(people,layer,code){
 if(!Array.isArray(people)||!LAYERS[layer])return [];
 const wanted=Number(code);
 return people.filter(p=>{
  const role=p.current_role||{};
  const title=String(role.title||'').toLowerCase();
  const upper=role.org_classification==='upper'||/senator|senate/.test(title);
  const lower=role.org_classification==='lower'||/representative|assembly|delegate/.test(title);
  return Number(role.district)===wanted&&(layer==='stateSenate'?upper:lower);
 });
}

// GeoJSON follows RFC 7946 (CCW exterior), while D3's spherical geoPath
// considers clockwise rings to be the polygon interior. If left unchanged,
// each congressional district becomes a near-global filled rectangle.
// Ensure each exterior is clockwise and each hole counterclockwise.
// Never mutate the received Census coordinates or property records.
function signedRingArea(ring){
 if(!Array.isArray(ring)||ring.length<3)return 0;
 let sum=0;
 for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length];
  if(!Array.isArray(a)||!Array.isArray(b))return 0;
  sum+=a[0]*b[1]-b[0]*a[1];
 }
 return sum/2;
}
function rewindRing(ring,outer){
 if(!Array.isArray(ring))return ring;
 const area=signedRingArea(ring);
 // Negative shoelace area means clockwise in geographic lon/lat coordinates.
 return ((outer&&area>0)||(!outer&&area<0))?ring.slice().reverse():ring.slice();
}
function rewindPolygon(polygon){
 return polygon.map((ring,index)=>rewindRing(ring,index===0));
}
function rewindForD3(collection){
 if(collection?.type!=='FeatureCollection'||!Array.isArray(collection.features))return collection;
 return {...collection,features:collection.features.map(feature=>{
  const geometry=feature?.geometry;
  if(!geometry)return feature;
  let coords;
  if(geometry.type==='Polygon')coords=rewindPolygon(geometry.coordinates);
  else if(geometry.type==='MultiPolygon')coords=geometry.coordinates.map(rewindPolygon);
  else return feature;
  return {...feature,geometry:{...geometry,coordinates:coords}};
 })};
}


/* Keep one at-large district visually distinct from a blank/oversized square. */
function districtViewport(width,height,count){
 const w=Math.max(200,Number(width)||200),h=Math.max(200,Number(height)||200);
 // Single-district states are surrounded by more context; geography is not distorted.
 const x=count===1?.20:.075,y=count===1?.17:.085;
 return [[Math.round(w*x),Math.round(h*y)],[Math.round(w*(1-x)),Math.round(h*(1-y))]];
}
function districtDisplayName(layer,code){
 if(layer==='house'&&String(code)==='00')return 'At-large';
 const value=Number(code);
 return Number.isInteger(value)&&value>=0?'District '+value:'District';
}

root.CONGRESSIONAL_MODEL=Object.freeze({LAYERS,censusUrl,districtCode,federalMembers,stateLawmakerMatches,rewindForD3,districtViewport,districtDisplayName});
})(typeof window!=='undefined'?window:globalThis);

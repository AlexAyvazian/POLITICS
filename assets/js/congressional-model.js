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
 const url=new URL(CENSUS+LAYERS[layer].id+'/query');
 for(const [k,v] of Object.entries({
  where:"STATE='"+stateFips+"'",outFields:'GEOID,BASENAME,NAME,STATE',
  outSR:'4326',geometryPrecision:'4',returnGeometry:'true',f:'geojson'
 }))url.searchParams.set(k,v);
 return url.toString();
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
root.CONGRESSIONAL_MODEL=Object.freeze({LAYERS,censusUrl,districtCode,federalMembers,stateLawmakerMatches});
})(typeof window!=='undefined'?window:globalThis);

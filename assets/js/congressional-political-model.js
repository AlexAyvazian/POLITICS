/* Stable, testable political joins. No party colors or map geometry here. */
(function(root){
 'use strict';
 const byState=(snapshot,code)=>snapshot?.states?.[code]||{};
 function house(snapshot,state,code){
  const normalized=Number(code)==98&&state==='DC'?0:Number(code);
  if(!Number.isInteger(normalized))return [];
  return (byState(snapshot,state).house||[]).filter(p=>Number(p.district)===normalized);
 }
 function senators(snapshot,state){return (byState(snapshot,state).senators||[]).filter(p=>p?.name);}
 function stateMembers(snapshot,layer,code){
  if(!['stateSenate','stateHouse'].includes(layer)||!snapshot?.people)return [];
  const n=Number(code);
  if(!Number.isInteger(n))return [];
  return snapshot.people.filter(p=>{
   const title=String(p.role||p.current_role?.title||'').toLowerCase();
   const chamber=layer==='stateSenate'?/senator|senate/:/assembly|representative|delegate|house/;
   return chamber.test(title)&&Number(p.district||p.current_role?.district)===n;
  });
 }
 function stateCompleteness(snapshot){
  if(!snapshot||!Array.isArray(snapshot.people))return 'pending';
  return snapshot.totalPeople===null||snapshot.people.length<Number(snapshot.totalPeople)?'partial':'complete';
 }
 
/* Labels are printed on a zoomable SVG group; the SVG controller rescales them.
 * Compact numbers avoid covering adjacent districts at ordinary zoom. */
function districtMarker(layer,code){
 if(layer==='house'&&String(code)==='00')return 'AL';
 if(layer==='house'&&String(code)==='98')return 'DC';
 const n=Number(code);
 return Number.isInteger(n)&&n>=0?String(n):'?';
}
function partyClass(raw){
 const p=String(raw||'').trim().toLowerCase();
 if(p==='d'||p==='democrat'||p==='democratic'||p==='democratic-farmer-labor'||p==='dfl')return 'democratic';
 if(p==='r'||p==='republican')return 'republican';
 if(p==='independent'||p==='nonpartisan'||p==='libertarian'||p==='green'||p==='other')return 'other';
 return 'unknown';
}
function combinedParty(people,expected=1){
 if(!Array.isArray(people)||people.length!==expected)return 'unknown';
 const parties=people.map(p=>partyClass(p?.party));
 if(parties.includes('unknown'))return 'unknown';
 return new Set(parties).size===1?parties[0]:'split';
}
function houseParty(snapshot,state,code){return combinedParty(house(snapshot,state,code));}
function stateDistrictParty(snapshot,layer,code){
 const members=stateMembers(snapshot,layer,code);
 if(!members.length)return 'unknown';
 const parties=members.map(p=>partyClass(p?.party));
 if(parties.includes('unknown'))return 'unknown';
 return new Set(parties).size===1?parties[0]:'split';
}
function senateParty(snapshot,state){return combinedParty(senators(snapshot,state),2);}
/* A state outline represents the chamber's reported numerical seat majority,
 * NOT the party of any individual state legislative district. */
function chamberMajority(ns,layer){
 const seats=layer==='stateSenate'?ns?.senate:layer==='stateHouse'?ns?.house:null;
 if(!seats)return 'unknown';
 const d=Number(seats.dem),r=Number(seats.rep),other=Number(seats.other),vacant=Number(seats.vacant);
 if(![d,r,other,vacant].every(Number.isFinite))return 'unknown';
 if(other>d&&other>r)return 'other';
 if(d>r&&d>other)return 'democratic';
 if(r>d&&r>other)return 'republican';
 return 'split';
}


/* Only specifically source-confirmed vacancies are marked vacant. Expire
 * this evidence so an old note never survives a new appointment/election. */
function verifiedVacancy(vacancies,selection,now=new Date().toISOString().slice(0,10)){
 if(!vacancies?.records||!selection?.state||!selection?.district)return null;
 const date=String(now).slice(0,10);
 if(date>String(vacancies.reviewBy||'0000-00-00'))return null;
 const wanted=Number(selection.district);
 if(!Number.isInteger(wanted))return null;
 return vacancies.records.find(v=>v.layer===selection.layer&&v.state===selection.state&&
   v.status==='vacant'&&Number(v.district)===wanted)||null;
}
function districtPartyWithVacancies(incumbentParty,evidence){
 const current=['democratic','republican','other','split'].includes(incumbentParty)?incumbentParty:'unknown';
 return current!=='unknown'?current:(evidence?.status==='vacant'?'vacant':'unknown');
}

root.CONGRESSIONAL_POLITICAL_MODEL=Object.freeze({house,senators,stateMembers,stateCompleteness,districtMarker,partyClass,houseParty,stateDistrictParty,senateParty,chamberMajority,verifiedVacancy,districtPartyWithVacancies});
})(typeof window!=='undefined'?window:globalThis);

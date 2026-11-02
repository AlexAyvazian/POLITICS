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
 root.CONGRESSIONAL_POLITICAL_MODEL=Object.freeze({house,senators,stateMembers,stateCompleteness});
})(typeof window!=='undefined'?window:globalThis);

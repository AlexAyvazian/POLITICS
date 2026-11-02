/* Match Census's explicit 119th Congress district, not 2026's future 120th boundaries. */
(function(root){
'use strict';
function district(payload,state){
 const matches=payload?.result?.addressMatches;
 if(!Array.isArray(matches)||matches.length!==1)return null;
 const geo=matches[0]?.geographies;
 if(!geo||!Array.isArray(geo.States)||geo.States.length!==1)return null;
 if(geo.States[0]?.STUSAB!==state)return null;
 const districts=geo['119th Congressional Districts'];
 if(!Array.isArray(districts)||districts.length!==1)return null;
 const row=districts[0];
 const raw=String(row.CD119??'');
 if(!/^\d{2}$/.test(raw))return null;
 const number=Number(raw);
 if(number===98&&state==='DC')return 0; // D.C. non-voting delegate
 if(number===0)return 0; // at-large state
 if(number<1||number>53)return null;
 return number;
}
root.POLITICS_ADDRESS_MODEL=Object.freeze({district});
})(typeof window!=='undefined'?window:globalThis);

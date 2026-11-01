/* POLITICS one-map statistics: unweighted arithmetic averages of county figures.
   No population weighting, no synthetic state medians, no live API requests. */
(function(root){
 'use strict';
 function isNumber(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0;}
 function countyAverage(dataset,stateFips,field){
  const records=dataset?.counties||{};
  const prefix=String(stateFips||'').padStart(2,'0');
  let total=0,n=0;
  for(const [fips,metrics] of Object.entries(records)){
   if(!/^\d{5}$/.test(fips)||!fips.startsWith(prefix))continue;
   if(isNumber(metrics?.[field])){total+=metrics[field];n++;}
  }
  return n?total/n:null;
 }
 function countyValues(dataset,fips){return dataset?.counties?.[fips]||null;}
 function getStateAverages(data,stateFips){
  const out={};
  const base=data?.core;
  out.overview={
   avgCountyPopulation:countyAverage(base,stateFips,'population'),
   avgCountyMedianHouseholdIncome:countyAverage(base,stateFips,'medianHouseholdIncome'),
   avgCountyPovertyRate:countyAverage(base,stateFips,'povertyRate'),
   avgCountyMedianGrossRent:countyAverage(base,stateFips,'medianGrossRent')
  };
  for(const [category,dataset] of Object.entries(data?.categories||{})){
   if(!dataset?.fields||!dataset?.counties)continue;
   out[category]=Object.fromEntries(Object.keys(dataset.fields).map(key=>[key,countyAverage(dataset,stateFips,key)]));
  }
  return out;
 }
 root.POLITICS_GEO_STATS={countyAverage,countyValues,getStateAverages};
})(typeof window!=='undefined'?window:globalThis);

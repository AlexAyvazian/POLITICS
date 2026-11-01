/* The map reads Cloudflare D1 snapshots once per page load. County/state clicks
   NEVER make upstream provider requests; geography lookups happen locally. */
(function(){
 'use strict';
 const ROOT='https://politics-daily-snapshot.alxayvazian.workers.dev';
 const cats=['housing','jobs','income','healthcare','education','families','infrastructure'];
 const data={core:null,categories:{},states:null};
 let job=null;
 const notify=()=>window.dispatchEvent(new Event('politics-county-snapshot-ready'));
 async function fetchSnapshot(path){
  const result=await fetch(ROOT+path,{headers:{Accept:'application/json'},credentials:'omit',
   signal:AbortSignal.timeout(30000)});
  if(!result.ok)throw Error('Stored data HTTP '+result.status);
  return result.json();
 }
 const api={
  status:'loading',
  get:()=>data,
  load(){
   if(job)return job;
   const core=fetchSnapshot('/api/county-snapshot').then(value=>{
    if(value?.counties&&value?.count)data.core=value;
    api.status=data.core?'ready':'pending';notify();
   }).catch(error=>{api.status='error';console.warn('Baseline snapshot unavailable',error.message);notify();});
   const other=cats.map(cat=>fetchSnapshot('/api/category-snapshot?category='+encodeURIComponent(cat)).then(value=>{
    if(value?.counties&&value?.fields&&value?.count)data.categories[cat]=value;
    notify();
   }).catch(error=>{console.warn('Cached '+cat+' unavailable:',error.message);notify();}));
   const states=fetchSnapshot('/api/state-snapshot').then(value=>{
    if(value?.states)data.states=value;notify();
   }).catch(error=>{console.warn('Stored statewide data unavailable:',error.message);notify();});
   job=Promise.allSettled([core,...other,states]).then(()=>data);
   return job;
  }
 };
 window.POLITICS_COUNTY_CACHE=api;
 api.load();
})();

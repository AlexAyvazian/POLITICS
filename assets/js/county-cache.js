/* The map reads Cloudflare D1 snapshots once per page load. County/state clicks
   NEVER make upstream provider requests; geography lookups happen locally. */
(function(){
 'use strict';
 const ROOT='https://politics-daily-snapshot.alxayvazian.workers.dev';
 const cats=['housing','jobs','income','healthcare','education','families','infrastructure'];
 const data={core:null,categories:{},states:null,places:null,congress:null,bills:{},billStatus:{}};
 const billJobs=new Map();
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
  // On state selection read OUR stored D1 snapshot, never the upstream provider.
  // Memoized per state to avoid extra requests during state/county switching.
  loadBills(abbr){
   if(!/^[A-Z]{2}$/.test(abbr))return Promise.resolve();
   if(billJobs.has(abbr))return billJobs.get(abbr);
   data.billStatus[abbr]='loading';
   const task=fetchSnapshot('/api/bills-snapshot?state='+encodeURIComponent(abbr))
    .then(value=>{
     if(Array.isArray(value?.items)&&value?.state===abbr){
      data.bills[abbr]=value;
      data.billStatus[abbr]='ready';
     }else data.billStatus[abbr]='pending';
     notify();
    }).catch(error=>{
     data.billStatus[abbr]='error';
     console.warn('Stored legislative bills unavailable for '+abbr+':',error.message);
     notify();
    });
   billJobs.set(abbr,task);
   return task;
  },
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
   const places=fetchSnapshot('/api/places-snapshot').then(value=>{
    if(value?.counties&&value?.fields&&value?.count)data.places=value;
    notify();
   }).catch(error=>{console.warn('CDC PLACES snapshot unavailable:',error.message);notify();});
   const congress=fetchSnapshot('/api/congress-snapshot').then(value=>{
    if(value?.states&&value?.count)data.congress=value;
    notify();
   }).catch(error=>{console.warn('Congressional delegation snapshot unavailable:',error.message);notify();});
   job=Promise.allSettled([core,...other,states,places,congress]).then(()=>data);
   return job;
  }
 };
 window.POLITICS_COUNTY_CACHE=api;
 api.load();
})();

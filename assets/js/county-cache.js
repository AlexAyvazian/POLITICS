/* One nationwide snapshot is fetched from Cloudflare D1 on page load.
   County clicks only read the local object — zero upstream API calls per click. */
(function(){
 'use strict';
 const url='https://politics-daily-snapshot.alxayvazian.workers.dev/api/county-snapshot';
 let snapshot=null,loading=null;
 const api={
  status:'loading',
  get:()=>snapshot,
  load(){
   if(loading)return loading;
   loading=(async()=>{
    try{
     const res=await fetch(url,{headers:{Accept:'application/json'},credentials:'omit',signal:AbortSignal.timeout(15000)});
     if(!res.ok)throw Error('Snapshot endpoint HTTP '+res.status);
     const data=await res.json();
     if(!data?.counties || !data.count){api.status='pending';return null;}
     snapshot=data;api.status='ready';return data;
    }catch(error){api.status='error';console.warn('County snapshot unavailable:',error.message);return null;}
    finally{window.dispatchEvent(new Event('politics-county-snapshot-ready'));}
   })();
   return loading;
  }
 };
 window.POLITICS_COUNTY_CACHE=api;
 api.load();
})();

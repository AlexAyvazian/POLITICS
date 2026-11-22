/* Scheduled member-level Congress.gov and FEC data ingestion.
 * Finance detail walks the complete congressional roster once per 12-hour
 * cycle. Secondary source families keep their own quarter-hour slots.
 */
import {refreshMemberLegislationBatch,refreshMemberFinanceRosterBatch} from './politics-gateway.mjs';
import {refreshFecMoneyNetwork} from './fec-money-network.mjs';

export function recordsRefreshPlan(now=new Date()){
 const minute=now.getUTCMinutes();
 const hour=now.getUTCHours();
 if(minute%15===0){
  const secondaryIndex=hour*4+Math.floor(minute/15);
  return {kind:'secondary',secondaryIndex};
 }
 const minutesIntoHalf=(hour%12)*60+minute;
 const tick=Math.floor(minutesIntoHalf/5);
 const batchIndex=tick-Math.floor(tick/3)-1;
 return {kind:'finance',batchIndex,batchSize:6};
}

export function recordsRefreshScheduled(event,env,ctx){
 const now=new Date(event.scheduledTime??Date.now());
 const plan=recordsRefreshPlan(now);
 let job;
 if(plan.kind==='finance'){
  job=refreshMemberFinanceRosterBatch(env,plan.batchIndex,plan.batchSize,fetch,now);
 }else{
  const group=plan.secondaryIndex%2;
  const slot=12+(Math.floor(plan.secondaryIndex/2)%36);
  job=group===0?refreshFecMoneyNetwork(env,fetch,now):refreshMemberLegislationBatch(env,slot,fetch,now);
 }
 ctx.waitUntil(job.catch(e=>{
  const label=plan.kind==='finance'?'finance-full-roster':['money-network','legislation'][plan.secondaryIndex%2];
  console.warn('Records collection '+label+' failed: '+String(e?.message||e).slice(0,200));
 }));
}

export default {
 fetch(){return new Response(JSON.stringify({service:'POLITICS records collector',status:'scheduled-only'}),
  {status:200,headers:{'Content-Type':'application/json'}});},
 scheduled:recordsRefreshScheduled
};

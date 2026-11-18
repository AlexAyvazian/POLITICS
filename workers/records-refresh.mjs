/* Scheduled member-level Congress.gov, FEC and LobbyView data ingestion.
 * One source family per event protects the county update pipeline.
 */
import {refreshMemberLegislationBatch,refreshMemberExtraBatch} from './politics-gateway.mjs';
import {refreshFecMoneyNetwork} from './fec-money-network.mjs';
export function recordsRefreshScheduled(event,env,ctx){
 const now=new Date(event.scheduledTime??Date.now());
 const quarter=now.getUTCHours()*4+Math.floor(now.getUTCMinutes()/15);
 const group=quarter%4;
 const slot=12+(Math.floor(quarter/4)%36);
 const job=group===0?refreshFecMoneyNetwork(env,fetch,now):
  group===1?refreshMemberLegislationBatch(env,slot,fetch,now):
  refreshMemberExtraBatch(env,group===2?'finance':'lobby',slot,fetch,now);
 ctx.waitUntil(job.catch(e=>{
  console.warn('Records collection '+['money-network','legislation','finance','lobby'][group]+' failed: '+String(e?.message||e).slice(0,200));
 }));
}
export default {
 fetch(){return new Response(JSON.stringify({service:'POLITICS records collector',status:'scheduled-only'}),
  {status:200,headers:{'Content-Type':'application/json'}});},
 scheduled:recordsRefreshScheduled
};

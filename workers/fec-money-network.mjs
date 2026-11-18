/* Shared, automatic FEC committee money graph.
 * No hardcoded politicians or PACs; no personal donor data.
 * "Reported receipt" and "reported disbursement" are different observations,
 * not separate dollars. Never sum two feeds or two-hop amounts as net support.
 */
const COMMITTEE=/^C[0-9]{8}$/;
const MEMBER=/^[A-Z][0-9]{6}$/;
const CANDIDATE=/^[HS][0-9][A-Z]{2}[0-9]{5}$/;
const CYCLE=2026;
const limited=(v,n=150)=>String(v??'').trim().slice(0,n);
const validDate=v=>/^20[0-9]{2}-[01][0-9]-[0-3][0-9]$/.test(String(v||''))?String(v):null;
function toCents(v){
 const value=Number(v);return Number.isFinite(value)&&value>0&&value<=1000000000?Math.round(value*100):null;
}
export function normalizeFecMoneyRow(feed,row){
 if(!['schedule_a','schedule_b'].includes(feed)||!row||typeof row!=='object')return null;
 const inbound=feed==='schedule_a';
 const sourceCommitteeId=String(inbound?row.contributor_id:row.committee_id||'');
 const recipientCommitteeId=String(inbound?row.committee_id:row.recipient_committee_id||'');
 const amountCents=toCents(inbound?row.contribution_receipt_amount:row.disbursement_amount);
 const date=validDate(inbound?row.contribution_receipt_date:row.disbursement_date);
 const id=String(row.sub_id||'');
 if(!COMMITTEE.test(sourceCommitteeId)||!COMMITTEE.test(recipientCommitteeId)||!amountCents||!date||!/^[0-9]{1,30}$/.test(id))return null;
 if(row.two_year_transaction_period!==undefined&&Number(row.two_year_transaction_period)!==CYCLE)return null;
 const image=String(row.image_number||'');
 const sourceUrl=/^[0-9]{10,20}$/.test(image)?
  'https://docquery.fec.gov/cgi-bin/fecimg/?'+image:
  'https://www.fec.gov/data/committee/'+(inbound?recipientCommitteeId:sourceCommitteeId)+'/?cycle='+CYCLE;
 return {
  recordId:feed+':'+id,sourceFeed:feed,sourceCommitteeId,recipientCommitteeId,
  sourceName:limited(inbound?row.contributor_name:row.committee_name,160),
  recipientName:limited(inbound?row.committee_name:row.recipient_name,160),
  amountCents,date,cycle:CYCLE,
  memo:!!limited(row.memo_code,4),memoCode:limited(row.memo_code,4),
  originalSubId:/^[0-9]{1,30}$/.test(String(row.original_sub_id||''))?String(row.original_sub_id):null,
  amendment:limited(row.amendment_indicator,10),
  transactionId:limited(row.transaction_id,70),
  sourceUrl,
  description:limited(inbound?row.receipt_type_full||row.memo_text:row.disbursement_description||row.memo_text,220)
 };
}
export function selectBatchMembers(roster,processed,limit=4){
 const members=Object.values(roster?.states||{}).flatMap(state=>[
  ...(Array.isArray(state?.house)?state.house:[]),
  ...(Array.isArray(state?.senators)?state.senators:[])
 ]);
 return [...new Set(members.map(x=>x.bioguide).filter(x=>MEMBER.test(String(x||''))))]
  .sort().filter(id=>!processed.has(id)).slice(0,Math.max(0,Math.min(12,limit)));
}
export function graphEvidence(committeeId,records){
 const safe=(Array.isArray(records)?records:[]).filter(x=>
  x&&(x.sourceCommitteeId===committeeId||x.recipientCommitteeId===committeeId));
 return {committeeId,records:safe,summary:{
  total:null,coverage:'Collected and verified FEC committee-linked filing records only; coverage can be partial.',
  caution:'Schedule A receipts and Schedule B disbursements are separate, not additive filing observations. A two-hop PAC route does not prove the original donor funded a specific downstream payment.'
 }};
}
const DDL=[
 `CREATE TABLE IF NOT EXISTS political_money_member_map(
 bioguide TEXT PRIMARY KEY,candidate_id TEXT,principal_committee_id TEXT,
 status TEXT NOT NULL,verified_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS political_money_ingest_cursor(
 committee_id TEXT NOT NULL, feed TEXT NOT NULL,cursor_index TEXT,cursor_date TEXT,
 complete INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,
 PRIMARY KEY(committee_id,feed))`,
 `CREATE TABLE IF NOT EXISTS political_money_transactions(
 record_id TEXT PRIMARY KEY,source_feed TEXT NOT NULL,source_committee_id TEXT NOT NULL,
 recipient_committee_id TEXT NOT NULL,source_name TEXT,recipient_name TEXT,
 amount_cents INTEGER NOT NULL,date TEXT NOT NULL,cycle INTEGER NOT NULL,
 memo INTEGER NOT NULL,memo_code TEXT,original_sub_id TEXT,amendment TEXT,
 transaction_id TEXT,source_url TEXT NOT NULL,description TEXT,updated_at TEXT NOT NULL)`,
 'CREATE INDEX IF NOT EXISTS idx_money_source ON political_money_transactions(source_committee_id,cycle,date)',
 'CREATE INDEX IF NOT EXISTS idx_money_recipient ON political_money_transactions(recipient_committee_id,cycle,date)'
];
export async function ensureMoneyGraphSchema(db){
 for(const sql of DDL)await db.prepare(sql).run();
}
async function addCommittee(db,id,now){
 if(!COMMITTEE.test(String(id||'')))return;
 for(const feed of ['schedule_a','schedule_b'])
  await db.prepare('INSERT OR IGNORE INTO political_money_ingest_cursor(committee_id,feed,updated_at) VALUES(?,?,?)')
   .bind(id,feed,now.toISOString()).run();
}
async function fetchFec(fetchImpl,token,path,fields){
 const url=new URL('https://api.open.fec.gov/v1/'+path);
 for(const [k,v]of Object.entries({api_key:token,...fields}))if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v));
 const response=await fetchImpl(url.toString(),{headers:{Accept:'application/json'}});
 if(!response.ok)throw Error('FEC '+path+' returned HTTP '+response.status);
 const data=await response.json();
 if(!Array.isArray(data?.results))throw Error('FEC '+path+' response missing results');
 return data;
}
async function discoverMemberCommittees(db,roster,token,fetchImpl,now){
 const rows=await db.prepare('SELECT bioguide,status,verified_at FROM political_money_member_map').all();
 const recent=new Set((rows?.results||[]).filter(x=>{
  const elapsed=now.getTime()-Date.parse(x.verified_at||'');
  if(x.status==='matched')return true;
  if(!Number.isFinite(elapsed))return false;
  return elapsed<(x.status==='retry'?3600000:86400000);
 }).map(x=>x.bioguide));
 const selected=selectBatchMembers(roster,recent,4);
 let matched=0;
 for(const bioguide of selected){
  let candidateId=null,principalId=null,status='retry';
  try{
   const base='https://politics-e5yt.onrender.com/assets/data/records/finance/';
   const response=await fetchImpl(base+bioguide+'.json',{headers:{Accept:'application/json'}});
   if(response.ok){
    const doc=await response.json();
    if(doc?.bioguide===bioguide&&doc?.cycle===CYCLE&&CANDIDATE.test(String(doc?.candidateId||''))){
     candidateId=doc.candidateId;
     const data=await fetchFec(fetchImpl,token,'candidate/'+candidateId+'/committees/',
      {cycle:CYCLE,designation:'P',per_page:20});
     const committees=[...new Set(data.results.filter(x=>x?.designation==='P'&&COMMITTEE.test(String(x.committee_id||''))).map(x=>x.committee_id))];
     principalId=committees.length===1?committees[0]:null;
     status=principalId?'matched':'ambiguous';
    }else status='missing_match';
   }else if(response.status===404)status='missing_match';
  }catch(_){status='retry';}
  await db.prepare('INSERT INTO political_money_member_map(bioguide,candidate_id,principal_committee_id,status,verified_at) VALUES(?,?,?,?,?) ON CONFLICT(bioguide) DO UPDATE SET candidate_id=excluded.candidate_id,principal_committee_id=excluded.principal_committee_id,status=excluded.status,verified_at=excluded.verified_at')
   .bind(bioguide,candidateId,principalId,status,now.toISOString()).run();
  if(principalId){await addCommittee(db,principalId,now);matched++;}
 }
 return {attempted:selected.length,matched};
}
async function ingestOneFeed(db,token,feedRow,fetchImpl,now){
 const id=feedRow.committee_id,feed=feedRow.feed;
 if(!COMMITTEE.test(String(id||''))||!['schedule_a','schedule_b'].includes(feed))return {written:0};
 const inbound=feed==='schedule_a',dateKey=inbound?'last_contribution_receipt_date':'last_disbursement_date';
 const params={committee_id:id,two_year_transaction_period:CYCLE,per_page:40,
  sort:inbound?'-contribution_receipt_date':'-disbursement_date'};
 if(feedRow.cursor_index&&feedRow.cursor_date){
  params.last_index=feedRow.cursor_index;params[dateKey]=feedRow.cursor_date;
 }
 const doc=await fetchFec(fetchImpl,token,'schedules/'+feed+'/',params);
 const items=doc.results.map(x=>normalizeFecMoneyRow(feed,x)).filter(Boolean);
 const statements=[],discovered=new Set();
 for(const record of items){
  statements.push(db.prepare(`INSERT INTO political_money_transactions(
    record_id,source_feed,source_committee_id,recipient_committee_id,source_name,recipient_name,
    amount_cents,date,cycle,memo,memo_code,original_sub_id,amendment,transaction_id,source_url,
    description,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(record_id) DO UPDATE SET source_name=excluded.source_name,
    recipient_name=excluded.recipient_name,amount_cents=excluded.amount_cents,
    memo=excluded.memo,memo_code=excluded.memo_code,original_sub_id=excluded.original_sub_id,
    amendment=excluded.amendment,description=excluded.description,updated_at=excluded.updated_at`)
   .bind(record.recordId,record.sourceFeed,record.sourceCommitteeId,record.recipientCommitteeId,
    record.sourceName,record.recipientName,record.amountCents,record.date,record.cycle,
    record.memo?1:0,record.memoCode,record.originalSubId,record.amendment,
    record.transactionId,record.sourceUrl,record.description,now.toISOString()));
  const other=inbound?record.sourceCommitteeId:record.recipientCommitteeId;
  if(other!==id)discovered.add(other);
 }
 for(const other of discovered){
  for(const targetFeed of ['schedule_a','schedule_b']){
   statements.push(db.prepare('INSERT OR IGNORE INTO political_money_ingest_cursor(committee_id,feed,updated_at) VALUES(?,?,?)')
    .bind(other,targetFeed,now.toISOString()));
  }
 }
 // D1 batch commits a page and its discovered PACs together; on error the
 // previous cursor stays unchanged and the page is safe to retry.
 if(statements.length){
  if(typeof db.batch==='function')await db.batch(statements);
  else for(const stmt of statements)await stmt.run();
 }
 const next=doc.pagination?.last_indexes||{};
 const cursorIndex=String(next.last_index||'');
 const cursorDate=String(next[dateKey]||'');
 const hasMore=Number(doc.pagination?.pages)>Number(doc.pagination?.page);
 const hasNext=hasMore&&/^[0-9]{1,30}$/.test(cursorIndex)&&validDate(cursorDate);
 // complete=2 means the provider says more data exists but did not supply
 // a valid cursor; this is explicitly NOT a fully collected feed.
 const completion=hasNext?0:hasMore?2:1;
 await db.prepare('UPDATE political_money_ingest_cursor SET cursor_index=?,cursor_date=?,complete=?,updated_at=? WHERE committee_id=? AND feed=?')
  .bind(hasNext?cursorIndex:null,hasNext?cursorDate:null,completion,now.toISOString(),id,feed).run();
 return {written:items.length,raw:doc.results.length,hasNext};
}
export async function refreshFecMoneyNetwork(env,fetchImpl=fetch,now=new Date()){
 const db=env?.COUNTY_DB,token=typeof env?.FEC_API_KEY==='string'&&env.FEC_API_KEY.trim()?env.FEC_API_KEY.trim():null;
 if(!db||!token)return {status:'not_configured'};
 await ensureMoneyGraphSchema(db);
 // Periodically revisit finished feeds to pick up newly filed transactions.
 // Original rows remain deduplicated by their FEC record IDs.
 const cutoff=new Date(now.getTime()-7*86400000).toISOString();
 await db.prepare('UPDATE political_money_ingest_cursor SET complete=0,cursor_index=NULL,cursor_date=NULL,updated_at=? WHERE complete IN (1,2) AND updated_at<?')
  .bind(now.toISOString(),cutoff).run();
 const rosterRow=await db.prepare('SELECT snapshot_json FROM county_snapshots WHERE source=?').bind('congress_members_current').first();
 if(!rosterRow)return {status:'roster_pending'};
 const roster=JSON.parse(rosterRow.snapshot_json);
 const discovered=await discoverMemberCommittees(db,roster,token,fetchImpl,now);
 const queued=await db.prepare('SELECT committee_id,feed,cursor_index,cursor_date FROM political_money_ingest_cursor WHERE complete=0 ORDER BY updated_at ASC,committee_id LIMIT 2').all();
 const results=[];
 for(const item of queued?.results||[]){
  try{results.push(await ingestOneFeed(db,token,item,fetchImpl,now));}
  catch(error){results.push({error:String(error?.message||error).slice(0,120),written:0});}
 }
 const summary={source:'Federal Election Commission',asOf:now.toISOString(),
  collection:'Automatic national FEC committee/PAC graph; raw receipts and disbursements are not additive',
  discovered,feeds:results.length,rows:results.reduce((s,x)=>s+x.written,0),
  failures:results.filter(x=>x.error).map(x=>x.error)};
 const counts=await Promise.all([
  db.prepare("SELECT COUNT(*) AS n FROM political_money_member_map WHERE status='matched'").first(),
  db.prepare('SELECT COUNT(*) AS n FROM political_money_ingest_cursor').first(),
  db.prepare('SELECT COUNT(*) AS n FROM political_money_transactions').first()]);
 summary.verifiedMembers=counts[0]?.n??null;
 summary.queuedFeeds=counts[1]?.n??null;
 summary.uniqueFecRecords=counts[2]?.n??null;
 await db.prepare('INSERT INTO county_snapshots(source,snapshot_json,refreshed_at,record_count) VALUES(?,?,?,?) ON CONFLICT(source) DO UPDATE SET snapshot_json=excluded.snapshot_json,refreshed_at=excluded.refreshed_at,record_count=excluded.record_count')
  .bind('political_money_collection_health',JSON.stringify(summary),now.toISOString(),summary.uniqueFecRecords||0).run();
 return {status:'processed',...summary};
}

/* Public read-only snapshot endpoint for POLITICS; NO provider fetch, ever.
   Data ingestion occurs in a separate scheduled Worker job. */
const ALLOWED_ORIGIN='https://politics-e5yt.onrender.com';
function json(body,status,request,cacheSeconds=0){
 const headers=new Headers({'Content-Type':'application/json; charset=utf-8',
   'Cache-Control':cacheSeconds?'public, max-age=120, s-maxage='+cacheSeconds:'no-store',
   'Vary':'Origin'});
 if(request.headers.get('Origin')===ALLOWED_ORIGIN){
  headers.set('Access-Control-Allow-Origin',ALLOWED_ORIGIN);
  headers.set('Access-Control-Allow-Headers','Accept, Content-Type');
  headers.set('Access-Control-Allow-Methods','GET, OPTIONS');
 }
 return new Response(status===204?null:JSON.stringify(body),{status,headers});
}
async function snapshotHealthRows(db,aggregate=false){
 if(!db)return [];
 try{
  const sql=aggregate?`
   SELECT CASE
    WHEN source LIKE 'member_legislation_%' THEN 'member_legislation'
    WHEN source LIKE 'member_finance_detail_%' THEN 'member_finance_detail'
    WHEN source LIKE 'openstates_%' THEN 'openstates'
    WHEN source LIKE 'billcommons_%' THEN 'billcommons'
    ELSE source END AS source,
    COUNT(*) AS snapshots,MAX(refreshed_at) AS refreshed_at,SUM(record_count) AS records
   FROM county_snapshots GROUP BY 1 ORDER BY 1`:
   'SELECT source,refreshed_at,record_count AS records,1 AS snapshots FROM county_snapshots ORDER BY source';
  const rows=await db.prepare(sql).all();
  return Array.isArray(rows?.results)?rows.results.map(row=>({
   source:String(row.source||''),refreshedAt:row.refreshed_at||null,
   records:Number(row.records??row.record_count)||0,snapshots:Number(row.snapshots)||1
  })).filter(row=>row.source):[];
 }catch(_){return [];}
}
async function collectionHealthRows(db){
 if(!db)return [];
 try{
  const rows=await db.prepare("SELECT source,snapshot_json,refreshed_at,record_count FROM county_snapshots WHERE source LIKE '%_collection_health' ORDER BY source").all();
  return (rows?.results||[]).map(row=>{
   let detail={};
   try{detail=JSON.parse(row.snapshot_json||'{}')}catch{}
   return {
    source:String(row.source||''),refreshedAt:row.refreshed_at||detail.asOf||null,
    attempted:Number(detail.attempted)||0,updated:Number(detail.updated)||0,failed:Number(detail.failed)||0,
    examples:Array.isArray(detail.examples)?detail.examples.map(x=>String(x).slice(0,180)).slice(0,5):[]
   };
  });
 }catch(_){return [];}
}

export async function serve(request,env){
 const path=new URL(request.url).pathname;
 if(request.method==='OPTIONS')return json(null,204,request);
 if(request.method!=='GET')return json({error:'GET only'},405,request);
 if(path==='/health')return json({service:'POLITICS county snapshot reader',status:'operational',storage:!!env.COUNTY_DB},200,request,120);
 if(path==='/api/data-health'){
  const dbs=[
   ['core',env?.COUNTY_DB,true],
   ['housing',env?.CATEGORY_DB_HOUSING,false],
   ['jobs',env?.CATEGORY_DB_JOBS,false],
   ['income',env?.CATEGORY_DB_INCOME,false],
   ['healthcare',env?.CATEGORY_DB_HEALTHCARE,false],
   ['education',env?.CATEGORY_DB_EDUCATION,false],
   ['families',env?.CATEGORY_DB_FAMILIES,false],
   ['infrastructure',env?.CATEGORY_DB_INFRASTRUCTURE,false]
  ];
  const groups=await Promise.all(dbs.map(async([database,db,aggregate])=>
   (await snapshotHealthRows(db,aggregate)).map(row=>({...row,database}))));
  const collectionHealth=await collectionHealthRows(env?.COUNTY_DB);
  return json({status:'operational',generatedAt:new Date().toISOString(),
   datasets:groups.flat().sort((a,b)=>a.source.localeCompare(b.source)),collectionHealth},200,request,300);
 }

 // Separate source snapshots: no new credentials or D1 bindings, and no upstream fetch on selection.
 if(path==='/api/places-snapshot'||path==='/api/congress-snapshot'){
  const health=path==='/api/places-snapshot';
  const db=health?env?.CATEGORY_DB_HEALTHCARE:env?.COUNTY_DB;
  if(!db)return json({status:'not_configured',count:0},503,request);
  try{
   const source=health?'cdc_places_2025':'congress_members_current';
   const row=await db.prepare('SELECT snapshot_json FROM county_snapshots WHERE source=?').bind(source).first();
   return json(row?JSON.parse(row.snapshot_json):{status:'pending',count:0,source},200,request,row?1800:60);
  }catch(_){return json({status:'storage_error',count:0},503,request);}
 }


 // Universal committee graph: exact Bioguide member mapping or direct committee
 // drilldown. Same D1 transactions power all members; nothing is person-specific.
 if(path==='/api/political-money-network'){
  const params=new URL(request.url).searchParams;
  const bioguide=params.get('bioguide'),requestedCommittee=params.get('committee_id');
  if((bioguide&&requestedCommittee)||(!bioguide&&!requestedCommittee))
   return json({error:'Provide exactly one member or FEC committee ID'},400,request);
  if(bioguide&&!/^[A-Z][0-9]{6}$/.test(bioguide))
   return json({error:'Invalid Bioguide ID'},400,request);
  if(requestedCommittee&&!/^C[0-9]{8}$/.test(requestedCommittee))
   return json({error:'Invalid FEC committee ID'},400,request);
  if(!env?.COUNTY_DB)return json({status:'not_configured'},503,request);
  try{
   let id=requestedCommittee,match=null;
   if(bioguide){
    match=await env.COUNTY_DB.prepare('SELECT bioguide,candidate_id,principal_committee_id,status FROM political_money_member_map WHERE bioguide=?')
     .bind(bioguide).first();
    id=match?.status==='matched'?match.principal_committee_id:null;
   }
   if(!id)return json({status:'pending',bioguide,reason:'verified_committee_mapping_pending',records:[]},200,request,60);
   const rows=await env.COUNTY_DB.prepare(`SELECT t.record_id AS recordId,t.source_feed AS sourceFeed,
      t.source_committee_id AS sourceCommitteeId,t.recipient_committee_id AS recipientCommitteeId,
      COALESCE(NULLIF(t.source_name,''),s.committee_name) AS sourceName,
      COALESCE(NULLIF(t.recipient_name,''),r.committee_name) AS recipientName,
      s.connected_organization AS sourceConnectedOrganization,
      r.connected_organization AS recipientConnectedOrganization,
      s.designation AS sourceDesignation,r.designation AS recipientDesignation,
      t.amount_cents AS amountCents,t.date,t.cycle,t.memo,t.memo_code AS memoCode,
      t.original_sub_id AS originalSubId,t.amendment,t.transaction_id AS transactionId,
      t.source_url AS sourceUrl,t.description
      FROM political_money_transactions t
      LEFT JOIN political_money_committee_metadata s ON s.committee_id=t.source_committee_id
      LEFT JOIN political_money_committee_metadata r ON r.committee_id=t.recipient_committee_id
      WHERE (t.source_committee_id=? OR t.recipient_committee_id=?) AND t.cycle=2026
      ORDER BY t.date DESC,t.record_id DESC LIMIT 100`).bind(id,id).all();
   const feeds=await env.COUNTY_DB.prepare('SELECT feed,complete,updated_at FROM political_money_ingest_cursor WHERE committee_id=?')
    .bind(id).all();
   return json({status:'partial',source:'Federal Election Commission itemized committee filings',cycle:2026,
    bioguide:bioguide||null,candidateId:match?.candidate_id||null,committeeId:id,
    records:rows?.results||[],collection:feeds?.results||[],
    completeForCycle:false,
    methodology:'Receipts and disbursements are separate source observations, not additive amounts. Paths through PACs do not trace the same dollars, and name or employer matches alone are not treated as financial transfers.',
    coverage:'Up to 100 verified committee-linked records for this node, refreshed by a shared cursor-based collector.'},200,request,300);
  }catch(e){
   if(/no such table/i.test(String(e?.message||'')))return json({status:'pending',reason:'graph_not_initialized',records:[]},200,request,60);
   return json({status:'storage_error',records:[]},503,request);
  }
 }

 // Member-specific FEC research summaries are collected by the
 // scheduled gateway and read by verified Bioguide ID. Never fetch upstream here.
 if(path==='/api/member-finance-detail'){
  const bioguide=new URL(request.url).searchParams.get('bioguide')||'';
  if(!/^[A-Z][0-9]{6}$/.test(bioguide))return json({error:'Invalid member identifier'},400,request);
  if(!env?.COUNTY_DB)return json({status:'not_configured',count:0},503,request);
  try{
   const row=await env.COUNTY_DB.prepare('SELECT snapshot_json FROM county_snapshots WHERE source=?')
    .bind('member_finance_detail_'+bioguide).first();
   return json(row?JSON.parse(row.snapshot_json):{status:'pending',bioguide,count:0},200,request,row?1800:60);
  }catch(_){return json({status:'storage_error',count:0},503,request);}
 }

 // Member-specific congressional legislation is collected by the gateway's cron.
 // This endpoint reads verified D1 snapshots and never calls Congress.gov on a click.
 if(path==='/api/member-legislation'){
  const bioguide=new URL(request.url).searchParams.get('bioguide')||'';
  if(!/^[A-Z][0-9]{6}$/.test(bioguide))return json({error:'Invalid Bioguide member ID'},400,request);
  if(!env?.COUNTY_DB)return json({status:'not_configured',count:0},503,request);
  try{
   const row=await env.COUNTY_DB.prepare('SELECT snapshot_json FROM county_snapshots WHERE source=?')
    .bind('member_legislation_'+bioguide).first();
   return json(row?JSON.parse(row.snapshot_json):{status:'pending',bioguide,count:0},200,request,row?1800:60);
  }catch(_){return json({status:'storage_error',count:0},503,request);}
 }

 // Cached Open States / official Congress.gov political snapshots, keyless for site visitors.
 if(path==='/api/openstates-snapshot'||path==='/api/house-votes-snapshot'){
  const byState=path==='/api/openstates-snapshot';
  const state=new URL(request.url).searchParams.get('state')||'';
  const valid='AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
  if(byState&&!valid.includes(state))return json({error:'Invalid state abbreviation'},400,request);
  if(!env?.COUNTY_DB)return json({status:'not_configured',count:0},503,request);
  try{
   const source=byState?'openstates_'+state:'congress_house_votes_recent';
   const row=await env.COUNTY_DB.prepare('SELECT snapshot_json FROM county_snapshots WHERE source=?').bind(source).first();
   return json(row?JSON.parse(row.snapshot_json):{status:'pending',count:0,source},200,request,row?1800:60);
  }catch(_){return json({status:'storage_error',count:0},503,request);}
 }

 if(path==='/api/bills-snapshot'){
  const state=new URL(request.url).searchParams.get('state')||'';
  const allowed='AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
  if(!allowed.includes(state))return json({error:'Invalid state abbreviation'},400,request);
  if(!env?.COUNTY_DB)return json({status:'not_configured',state,count:0},503,request);
  try{
   const key='billcommons_'+state;
   const row=await env.COUNTY_DB.prepare('SELECT snapshot_json FROM county_snapshots WHERE source=?').bind(key).first();
   return json(row?JSON.parse(row.snapshot_json):{status:'pending',state,count:0,source:'Bill Commons'},200,request,row?1800:60);
  }catch(_){return json({status:'storage_error',state,count:0},503,request);}
 }

 if(path==='/api/category-snapshot'){
  const category=new URL(request.url).searchParams.get('category');
  const bindings={"housing":"CATEGORY_DB_HOUSING","jobs":"CATEGORY_DB_JOBS","income":"CATEGORY_DB_INCOME","healthcare":"CATEGORY_DB_HEALTHCARE","education":"CATEGORY_DB_EDUCATION","families":"CATEGORY_DB_FAMILIES","infrastructure":"CATEGORY_DB_INFRASTRUCTURE"};
  if(!Object.hasOwn(bindings,category))return json({error:'Unknown category'},404,request);
  const db=env?.[bindings[category]];
  if(!db)return json({status:'not_configured',category,count:0},503,request);
  try{
   const row=await db.prepare('SELECT snapshot_json FROM county_snapshots WHERE source=?').bind('census_'+category).first();
   return json(row?JSON.parse(row.snapshot_json):{status:'pending',category,count:0},200,request,row?1800:60);
  }catch(_){return json({status:'storage_error',category,count:0},503,request);}
 }
 if(path==='/api/bls-snapshot'){
  const db=env?.CATEGORY_DB_JOBS;
  if(!db)return json({status:'not_configured',count:0},503,request);
  try{
   const row=await db.prepare('SELECT snapshot_json FROM county_snapshots WHERE source=?').bind('bls_laus_county').first();
   return json(row?JSON.parse(row.snapshot_json):{status:'pending',count:0,source:'U.S. Bureau of Labor Statistics'},200,request,row?1800:60);
  }catch(_){return json({status:'storage_error',count:0},503,request);}
 }
 if(path==='/api/bea-snapshot'){
  const db=env?.CATEGORY_DB_JOBS;
  if(!db)return json({status:'not_configured',count:0},503,request);
  try{
   const row=await db.prepare('SELECT snapshot_json FROM county_snapshots WHERE source=?').bind('bea_county_per_capita_income').first();
   return json(row?JSON.parse(row.snapshot_json):{status:'pending',count:0,source:'U.S. Bureau of Economic Analysis'},200,request,row?21600:60);
  }catch(_){return json({status:'storage_error',count:0},503,request);}
 }
 if(path==='/api/state-snapshot'){
  const db=env?.CATEGORY_DB_INFRASTRUCTURE;
  if(!db)return json({status:'not_configured',count:0},503,request);
  try{
   const row=await db.prepare('SELECT snapshot_json FROM county_snapshots WHERE source=?').bind('eia_state_electricity').first();
   return json(row?JSON.parse(row.snapshot_json):{status:'pending',count:0},200,request,row?1800:60);
  }catch(_){return json({status:'storage_error',count:0},503,request);}
 }

 if(path!=='/api/county-snapshot')return json({error:'Not found'},404,request);
 if(!env.COUNTY_DB)return json({status:'not_configured',count:0},503,request);
 try{
  const row=await env.COUNTY_DB.prepare('SELECT snapshot_json FROM county_snapshots WHERE source = ?').bind('census_acs5').first();
  if(!row)return json({status:'pending',count:0,message:'Initial national data collection not yet complete.'},200,request,60);
  return json(JSON.parse(row.snapshot_json),200,request,1800);
 }catch(_){return json({status:'storage_error',count:0},503,request);}
}
export default {fetch:serve};

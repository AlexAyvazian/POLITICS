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
export async function serve(request,env){
 const path=new URL(request.url).pathname;
 if(request.method==='OPTIONS')return json(null,204,request);
 if(request.method!=='GET')return json({error:'GET only'},405,request);
 if(path==='/health')return json({service:'POLITICS county snapshot reader',status:'operational',storage:!!env.COUNTY_DB},200,request,120);

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

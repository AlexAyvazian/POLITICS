import test from 'node:test';
import assert from 'node:assert/strict';
import {COUNTY_CATEGORY_CONFIG,updateCountyCategory,refreshStateEnergy} from '../workers/politics-gateway.mjs';

const specs=COUNTY_CATEGORY_CONFIG.specs;
const expectedCategories=['housing','jobs','income','healthcare','education','families','infrastructure'];
const now=new Date('2026-11-01T00:00:00Z');
function db(){
 const writes=[];
 return {writes,prepare:()=>({bind:(...args)=>({run:async()=>{writes.push(args)}})})};
}
function fixture(env){
 const byCat=Object.fromEntries(expectedCategories.map(c=>[c,db()]));
 for(const [category,database]of Object.entries(byCat))env[COUNTY_CATEGORY_CONFIG.envNames[category]]=database;
 const requestUrls=[];
 const fetcher=async input=>{
  const u=new URL(input),cols=u.searchParams.get('get')?.split(',');
  requestUrls.push(u);
  const rows=[cols.concat('state','county')];
  for(let i=0;i<3000;i++)rows.push([...cols.map(c=>c==='NAME'?'Example County':c==='DP03_0009E'?'5.2':'10'),
   String(Math.floor(i/1000)+1).padStart(2,'0'),String(i%1000).padStart(3,'0')]);
  return new Response(JSON.stringify(rows),{status:200});
 };
 return{byCat,fetcher,requestUrls};
}
test('all seven categories collect from official ACS with county FIPS, one saved D1 snapshot per category',async()=>{
 const env={'CENSUS-API-KEY':'TEST1','CENSUS_API_KEY_2':'TEST2','CENSUS_API_KEY_3':'TEST3','CENSUS_API_KEY_4':'TEST4','CENSUS_API_KEY_5':'TEST5','CENSUS_API_KEY_6':'TEST6'};
 const {byCat,fetcher,requestUrls}=fixture(env);
 for(const category of expectedCategories){
  const r=await updateCountyCategory(env,category,fetcher,now);
  assert.equal(r.count,3000);
  assert.equal(r.fieldCount,specs[category].length);
  const data=JSON.parse(byCat[category].writes[0][1]);
  assert.equal(data.count,3000);
  assert.equal(data.year,2024);
  assert.ok(data.counties['01000']);
  assert.ok(Object.keys(data.fields).length>0);
 }
 assert.equal(Object.values(specs).reduce((n,v)=>n+v.length,0),79);
 assert.ok(requestUrls.length<=20,'bulk geographic requests, not one per county');
 for(const u of requestUrls){
  assert.equal(u.searchParams.get('for'),'county:*');
  assert.equal(u.searchParams.get('in'),'state:*');
  assert.ok(u.searchParams.get('key'));
 }
});
test('partial ACS datasets do not overwrite prior saved data',async()=>{
 const env={'CENSUS-API-KEY':'test',CATEGORY_DB_HOUSING:db()};
 const cols=['NAME','DP04_0089E','state','county'];
 const response=new Response(JSON.stringify([cols,['Example','9000','06','019']]));
 await assert.rejects(updateCountyCategory(env,'housing',async()=>response,now));
 assert.equal(env.CATEGORY_DB_HOUSING.writes.length,0);
});
test('state-only EIA electricity prices are stored separately and are not inferred from counties',async()=>{
 const db1=db(),env={CATEGORY_DB_INFRASTRUCTURE:db1,EIA_API_KEY:'test'};
 const states='AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
 const result=await refreshStateEnergy(env,async url=>{
  const u=new URL(url);
  assert.equal(u.searchParams.get('facets[sectorid][]'),'RES');
  return new Response(JSON.stringify({response:{data:states.map(stateid=>({stateid,period:'2026-08',price:'29.75'}))}}));
 },now);
 assert.equal(result.states,51);
 const payload=JSON.parse(db1.writes[0][1]);
 assert.equal(payload.states.CA.residentialElectricityCentsKwh,29.75);
 assert.equal(payload.states.CA.period,'2026-08');
 assert.equal(payload.counties,undefined);
});

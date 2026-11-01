import test from 'node:test';
import assert from 'node:assert/strict';
import {COUNTY_CATEGORY_CONFIG,updateCountyCategory,refreshStateEnergy,refreshPlacesHealth,refreshCongressMembers,refreshOpenStatesState,refreshFederalHouseVotes} from '../workers/politics-gateway.mjs';

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

test('keyless CDC PLACES national ingestion stores measured health and well-being without tokens',async()=>{
 const store=db(),env={CATEGORY_DB_HEALTHCARE:store};
 const seen=[];
 const fetcher=async url=>{
  seen.push(new URL(url));
  const rows=Array.from({length:3001},(_,i)=>({
   countyfips:String(1001+i).padStart(5,'0'),
   mhlth_crudeprev:'18.3',
   phlth_crudeprev:'13.1',
   depression_crudeprev:'20.2',
   loneliness_crudeprev:'31.4',
   foodinsecu_crudeprev:'11.8',
   housinsecu_crudeprev:'17.5',
   checkup_crudeprev:'75.0',
   access2_crudeprev:'8.1'
  }));
  rows[0].mhlth_crudeprev='-1';
  return new Response(JSON.stringify(rows),{status:200});
 };
 const output=await refreshPlacesHealth(env,fetcher,now);
 assert.equal(output.count,3001);
 assert.equal(seen.length,1);
 assert.equal(seen[0].hostname,'data.cdc.gov');
 assert.equal(seen[0].pathname,'/resource/i46a-9kgh.json');
 assert.equal(seen[0].searchParams.get('$limit'),'5000');
 assert.equal(store.writes[0][0],'cdc_places_2025');
 const snapshot=JSON.parse(store.writes[0][1]);
 assert.equal(snapshot.counties['01002'].frequentMentalDistressPct,18.3);
 assert.equal(snapshot.counties['01001'].frequentMentalDistressPct,null);
 assert.equal(snapshot.fields.lonelinessPct.unit,'percent');
 assert.equal(snapshot.year,2025);
 assert.equal(snapshot.source,'CDC PLACES');
});
test('keyless congressional delegation is grouped by state, terms and correct chambers',async()=>{
 const store=db();
 const mock=[
  {name:{official_full:'Sample Senator'},id:{bioguide:'A000001'},terms:[{type:'sen',state:'CA',party:'Democrat',start:'2025-01-03',end:'2031-01-03'}]},
  {name:{first:'Sample',last:'Representative'},id:{bioguide:'B000001'},terms:[{type:'rep',state:'CA',district:19,party:'Republican',start:'2025-01-03',end:'2027-01-03'}]},
  {name:{first:'Former',last:'Member'},id:{bioguide:'Z000001'},terms:[{type:'rep',state:'CA',district:4,party:'Republican',start:'2022-01-03',end:'2024-01-03'}]}
 ];
 const otherStates='AL AK AZ AR CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
 for(let i=0;i<500;i++)mock.push({
  name:{first:'Mock',last:'Member'+i},
  id:{bioguide:'C'+String(i).padStart(6,'0')},
  terms:[{type:'rep',state:otherStates[i%otherStates.length],district:1+Math.floor(i/otherStates.length),
   party:i%2?'Democrat':'Republican',start:'2025-01-03',end:'2027-01-03'}]
 });
 const fetcher=async url=>{assert.equal(new URL(url).hostname,'unitedstates.github.io');return new Response(JSON.stringify(mock),{status:200});};
 const output=await refreshCongressMembers({COUNTY_DB:store},fetcher,now);
 assert.equal(output.states,50);
 assert.equal(store.writes[0][0],'congress_members_current');
 const data=JSON.parse(store.writes[0][1]);
 assert.equal(data.states.CA.senators.length,1);
 assert.equal(data.states.CA.house.length,1);
 assert.equal(data.states.CA.house[0].district,19);
 assert.equal(data.states.CA.house[0].party,'Republican');
 assert.equal(data.states.CA.senators[0].name,'Sample Senator');
 assert.equal(data.states.CA.house[0].bioguide,'B000001');
 assert.equal(data.states.CA.house.find(x=>x.name==='Former Member'),undefined);
});
test('incomplete CDC responses do not overwrite existing stored health data',async()=>{
 const store=db();
 await assert.rejects(refreshPlacesHealth({CATEGORY_DB_HEALTHCARE:store},
  async()=>new Response(JSON.stringify([{countyfips:'06019',mhlth_crudeprev:'10'}])),now));
 assert.equal(store.writes.length,0);
});

test('existing Open States key creates verified state bill and legislator snapshot without exposing key',async()=>{
 const store=db(),seen=[];
 const mock=async (url,options)=>{
  const u=new URL(url);seen.push({u,options});
  if(u.pathname.endsWith('/bills'))return new Response(JSON.stringify({results:[{id:'ocd-bill/123',identifier:'AB 5',title:'Healthcare access',latest_action_date:'2026-10-28',latest_action_description:'Passed House',openstates_url:'https://open.pluralpolicy.com/ca/bills/2026/AB5'}],pagination:{total_items:500}}));
  if(u.pathname.endsWith('/people'))return new Response(JSON.stringify({results:[{id:'ocd-person/456',name:'Test Legislator',party:'Democratic',current_role:{title:'Senator',district:'8'},openstates_url:'https://open.pluralpolicy.com/person/test'}],pagination:{total_items:120}}));
  throw Error('unexpected: '+u.pathname);
 };
 const result=await refreshOpenStatesState({COUNTY_DB:store,OPENSTATES_API_KEY:'test-token'},'CA',mock,now);
 assert.equal(result.bills,1);assert.equal(result.people,1);
 assert.equal(seen.length,2);
 assert.equal(seen[0].u.hostname,'v3.openstates.org');
 assert.equal(seen[0].u.searchParams.get('jurisdiction'),'ca');
 assert.equal(seen[0].options.headers['X-API-KEY'],'test-token');
 assert.equal(store.writes[0][0],'openstates_CA');
 const d=JSON.parse(store.writes[0][1]);
 assert.equal(d.bills[0].identifier,'AB 5');
 assert.equal(d.people[0].name,'Test Legislator');
 assert.equal(d.people[0].district,'8');
 assert.equal(JSON.stringify(d).includes('test-token'),false);
});
test('Open States errors and missing key do not overwrite previously stored data',async()=>{
 const store=db();
 await assert.rejects(refreshOpenStatesState({COUNTY_DB:store},'CA',async()=>new Response('{}'),now));
 await assert.rejects(refreshOpenStatesState({COUNTY_DB:store,OPENSTATES_API_KEY:'valid'},'XY',async()=>new Response('{}'),now));
 assert.equal(store.writes.length,0);
});
test('Congress.gov legislative House roll-call returns actual member choices grouped by state',async()=>{
 const store=db(),seen=[];
 const mock=async url=>{
  const u=new URL(url);seen.push(u);
  assert.equal(u.hostname,'api.congress.gov');
  assert.equal(u.searchParams.get('api_key'),'test-token');
  if(u.pathname.endsWith('/house-vote/119/2'))return new Response(JSON.stringify({houseRollCallVotes:[{congress:119,sessionNumber:2,rollCallNumber:256,startDate:'2026-10-25',legislationType:'HR',legislationNumber:'152',result:'Passed'}]}));
  if(u.pathname.endsWith('/256/members'))return new Response(JSON.stringify({houseRollCallVoteMemberVotes:{results:{item:[
   {bioguideId:'A000001',firstName:'A',lastName:'Example',voteCast:'Aye',voteState:'CA',voteParty:'D'},
   {bioguideId:'B000002',firstName:'B',lastName:'Example',voteCast:'Nay',voteState:'NY',voteParty:'R'}
  ]}}}));
  throw Error('unexpected '+u.pathname);
 };
 const r=await refreshFederalHouseVotes({COUNTY_DB:store,CONGRESS_API_KEY:'test-token'},mock,now);
 assert.equal(r.votes,1);assert.equal(seen.length,2);
 assert.equal(store.writes[0][0],'congress_house_votes_recent');
 const d=JSON.parse(store.writes[0][1]);
 assert.equal(d.votes[0].stateVotes.CA[0].cast,'Aye');
 assert.equal(d.votes[0].stateVotes.NY[0].party,'R');
 assert.equal(d.votes[0].voteNumber,256);
 assert.equal(d.chamber,'House');assert.equal(d.congress,119);assert.equal(d.session,2);
 assert.equal(JSON.stringify(d).includes('test-token'),false);
});

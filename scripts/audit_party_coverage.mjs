/* Cross-check actual 50-state nightly legislator rosters against Census GEOIDs.
 * Purely local: never requests provider APIs, never guesses missing seat parties. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import vm from 'node:vm';
const read=f=>readFileSync(f,'utf8');
const root={window:{}};
for(const file of ['assets/js/states.js','assets/js/congressional-political-model.js']){
 vm.runInNewContext(read(file),root);
}
const model=root.window.CONGRESSIONAL_POLITICAL_MODEL;
const states=root.window.GEO_STATES;
const data={generatedAt:new Date().toISOString(),stateCount:0,sections:{},problems:[],notice:[]};
for(const state of states){
 if(state.abbr==='DC')continue;
 const path='assets/data/legislators/'+state.abbr.toLowerCase()+'.json';
 let roster;
 try{roster=JSON.parse(read(path));}
 catch(error){data.problems.push(state.abbr+': no current roster: '+error.message);continue;}
 data.stateCount++;
 if(roster.state!==state.abbr||!Array.isArray(roster.people)||roster.people.length<10){
  data.problems.push(state.abbr+': invalid roster');continue;
 }
 for(const layer of ['stateSenate','stateHouse']){
  const key=state.abbr+'/'+layer;
  const shapes=JSON.parse(read('assets/data/congressional/'+layer+'/'+state.fips+'.geojson')).features;
  const summary={districts:shapes.length,democratic:0,republican:0,other:0,split:0,unknown:0,roster:roster.people.length};
  for(const district of shapes){
   const code=district.properties?.GEOID?.slice(2);
   const party=model.stateDistrictParty(roster,layer,code);
   summary[party]++;
  }
  data.sections[key]=summary;
  if(layer==='stateSenate'&&state.abbr==='MT'&&summary.unknown>5)
   data.problems.push('Montana Senate unexpectedly has '+summary.unknown+' unverified districts with its full 50-seat roster');
 }
}
mkdirSync('audit-results',{recursive:true});
writeFileSync('audit-results/legislative-party-coverage.json',JSON.stringify(data,null,2)+'\n');
const values=Object.values(data.sections);
const total=values.reduce((p,a)=>p+a.districts,0),unknown=values.reduce((p,a)=>p+a.unknown,0);
console.log(JSON.stringify({states:data.stateCount,viewCount:values.length,totalDistricts:total,
 verified:total-unknown,unverified:unknown,MontanaSenate:data.sections['MT/stateSenate'],
 MontanaHouse:data.sections['MT/stateHouse'],errors:data.problems},null,2));
if(data.stateCount!==50||data.problems.length)process.exitCode=1;

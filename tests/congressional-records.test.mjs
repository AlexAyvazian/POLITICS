import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
function model(){const context={window:{}};vm.runInNewContext(read('assets/js/records-model.js'),context);return context.window.POLITICS_RECORDS_MODEL;}
test('third page opens with a browse-by-state directory, not a member search',()=>{
 const page=read('records.html');
 for(const id of ['stateDirectory','stateGrid','delegationDirectory','delegationTitle','senateMembers','houseMembers','backToStates','memberProfile','memberVotes','voteStatus','financeLinks','travelLinks','legislationLinks']) assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(page,/assets\/js\/records\.js/);
 assert.match(page,/assets\/css\/records\.css/);
 assert.match(page,/assets\/js\/states\.js/);
 assert.match(page,/County Atlas/);
 assert.match(page,/Congressional Atlas/);
 assert.doesNotMatch(page,/id="memberSearch"|id="memberChamber"|id="districtMap"|id="mapSvg"|leaflet/);
 assert.match(page,/Choose your state/);
});
test('directory lists every state and D.C., preserves House district order, and has full delegation',()=>{
 const x=model();
 const stateObjects=[{name:'Colorado',abbr:'CO'},{name:'California',abbr:'CA'},{name:'District of Columbia',abbr:'DC'}];
 const roster={asOf:'2026-11-02',states:{
  CO:{house:[{name:'District Seven',district:7,party:'Democrat',bioguide:'H000001'},{name:'District Three',district:3,party:'Republican',bioguide:'H000002'}],senators:[{name:'First Senator',party:'Democrat',bioguide:'S000001'},{name:'Second Senator',party:'Democrat',bioguide:'S000002'}]},
  DC:{house:[{name:'Delegate',district:0,party:'Democrat',bioguide:'D000001'}],senators:[]}
 }};
 const members=x.members(roster);
 const directory=x.states(stateObjects);
 assert.deepEqual(Array.from(directory,s=>s.abbr),['CA','CO','DC']);
 const delegation=x.delegation(members,'CO');
 assert.deepEqual(Array.from(delegation.house,p=>p.district),[3,7]);
 assert.equal(delegation.senate.length,2);
 assert.equal(x.delegation(members,'DC').house[0].district,0);
});
test('directory deep links navigate by state and member without requiring text search',()=>{
 const s=read('assets/js/records.js');
 assert.match(s,/renderStateDirectory/);
 assert.match(s,/renderDelegation/);
 assert.match(s,/showState/);
 assert.match(s,/stateGrid/);
 assert.match(s,/delegationDirectory/);
 assert.match(s,/backToStates/);
 assert.match(s,/URLSearchParams/);
 assert.doesNotMatch(s,/memberSearch|memberChamber|renderCandidates/);
});
test('member roster is flattened with stable verified identifiers and chamber',()=>{
 const x=model();
 const roster={asOf:'2026-11-02',states:{CO:{house:[{name:'Example Member',party:'Republican',bioguide:'H000001',district:3}],senators:[{name:'Example Senator',party:'Democrat',bioguide:'S000001'}]}}};
 const all=x.members(roster);
 assert.equal(all.length,2);
 assert.equal(all.find(v=>v.bioguide==='H000001').district,3);
 assert.equal(all.find(v=>v.bioguide==='S000001').chamber,'Senate');
 assert.equal(x.getMember(all,'H000001').name,'Example Member');
 assert.equal(x.getMember(all,'missing'),null);
});
test('individual House votes use exact Bioguide ID; absence is not interpreted as Not Voting',()=>{
 const x=model();
 const data={status:'ready',votes:[{roll:12,year:2026,question:'On Passage',date:'2026-05-01',members:{H000001:'Yea',H000002:'Nay'}},{roll:13,year:2026,question:'On Motion',date:'2026-05-02',members:{H000002:'Not Voting'}}]};
 const actual=x.memberVotes(data,{bioguide:'H000001',chamber:'House'});
 assert.equal(actual.length,1);
 assert.equal(actual[0].cast,'Yea');
 assert.equal(x.memberVotes(data,{bioguide:'H999999',chamber:'House'}).length,0);
 assert.equal(x.memberVotes(data,{bioguide:'H000001',chamber:'Senate'}).length,0);
});
test('Senate member matching needs unique same-state surname; no guessed choices',()=>{
 const x=model();
 const vote={members:[{state:'CO',lastName:'Tester',cast:'Nay'},{state:'UT',lastName:'Tester',cast:'Yea'}]};
 assert.equal(x.senateCast(vote,{name:'Morgan Tester',state:'CO'}),'Nay');
 assert.equal(x.senateCast(vote,{name:'Morgan Tester',state:'NM'}),null);
 assert.equal(x.senateCast({members:[{state:'CO',lastName:'Tester',cast:'Nay'},{state:'CO',lastName:'Tester',cast:'Yea'}]},{name:'Morgan Tester',state:'CO'}),null);
});
test('all votes and totals describe only observed captured rolls, not full-career percentages',()=>{
 const x=model();
 const votes=[{cast:'Yea'},{cast:'Nay'},{cast:'Present'},{cast:'Not Voting'}];
 assert.deepEqual({...x.countVotes(votes)},{Yea:1,Nay:1,Present:1,'Not Voting':1});
 const records=x.filterVotes([{question:'On Passage H.R. 123',cast:'Yea'},{question:'On Nomination',cast:'Nay'}],'H.R.');
 assert.equal(records.length,1);
 assert.match(read('records.html'),/Recorded roll calls only/);
});
test('campaign, travel and legislative data are on-page visualizations, not outgoing search links',()=>{
 const html=read('records.html'),js=read('assets/js/records.js');
 for(const id of ['financeVisualization','travelVisualization','legislationVisualization'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(html,/Search FEC filings|Search Congress\.gov|Senate ethics disclosures|id="fecMemberLink"/i);
 assert.match(js,/renderFinance/);
 assert.match(js,/assets\/data\/records\/finance/);
 assert.match(js,/renderMeasures/);
 assert.match(js,/office-associated filings/);
 assert.match(js,/renderTravel/);
 assert.ok(js.includes('assets/data/records/travel/'));
 assert.doesNotMatch(js,/displayFinance\(/);
});
test('vote distribution uses neutral labeled independent tracks, not a partisan stacked bar',()=>{
 const html=read('records.html'),js=read('assets/js/records.js'),css=read('assets/css/records-editorial.css');
 assert.match(js,/HOW THIS PERSON VOTED/);
 assert.match(js,/not Democratic vs\. Republican votes/);
 assert.match(css,/\.recordsDistributionRows/);
 assert.match(css,/\.recordsDistributionTrack/);
 assert.match(html,/not party affiliations/);
});

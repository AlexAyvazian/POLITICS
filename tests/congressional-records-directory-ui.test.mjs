import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function node(id=''){
 const el={id,children:[],hidden:false,attributes:{},listeners:{},value:'',textContent:'',innerHTML:'',className:'',style:{},
  addEventListener(name,handler){this.listeners[name]=handler},
  setAttribute(k,v){this.attributes[k]=v},
  replaceChildren(...items){this.children=items},
  append(...items){this.children.push(...items)},
  scrollIntoView(){},
  click(){this.listeners.click?.()}};
 return el;
}
function build(){
 const ids=['directoryStatus','stateGrid','stateDirectory','delegationDirectory','delegationTitle','delegationIntro','delegationSilhouette','senateCount','houseCount','houseHeading','senateMembers','houseMembers','backToStates','backToDelegation','districtLookupForm','addressInput','findMyRep','districtLookupStatus','districtLookupResult','memberProfile','recordsStart','profilePortrait','profileName','profileChamber','profileInfo','profileBio','recordUpdated','votesQuery','voteStatus','voteSummary','voteDistribution','voteFilterAll','voteFilterYea','voteFilterNay','voteFilterAbsent','votePeriod','memberVotes','financeVisualization','travelVisualization','legislationVisualization'];
 const el=Object.fromEntries(ids.map(id=>[id,node(id)]));
 el.stateDirectory.hidden=false;el.delegationDirectory.hidden=true;el.memberProfile.hidden=true;
 el.addressInput.value='';
 const payload={asOf:'2026-11-02',states:{
  CO:{house:[{bioguide:'H000001',name:'District Seven',district:7,party:'Democrat'},
             {bioguide:'H000002',name:'District Three',district:3,party:'Republican'}],
      senators:[{bioguide:'S000001',name:'Senator A',party:'Democrat'},{bioguide:'S000002',name:'Senator B',party:'Democrat'}]},
  DC:{house:[{bioguide:'D000001',name:'D.C. Delegate',district:0,party:'Democrat'}],senators:[]}
 }};
 const memberVotes={bioguide:'H000002',chamber:'House',congress:119,asOf:'2026-09-16',votes:[
  {year:2026,roll:314,question:'On Passage',subject:'A funding bill',date:'2026-09-16',cast:'Yea',url:'https://clerk.house.gov/Votes/2026314'}
 ]};
 const finance={bioguide:'H000002',cycle:2026,raised:125000,spent:50000,cashOnHand:75000,debts:0,
  individualContributions:75000,committeeContributions:28000,partyContributions:1000,selfContributions:5000,coverageEnd:'09/30/2026'};
 const travel={bioguide:'H000002',filings:[
  {reportedYear:2026,beginDate:'01/08/2026',endDate:'01/11/2026',sponsor:'Community Alliance',destination:'Albany, NY',filer:'Example Staff',filingType:'Original'}
 ]};
 const requests=[];
 const fetch=async url=>{
  requests.push(url);
  const data=url.includes('congress-snapshot')?payload:
   url.includes('assets/data/records/travel/')?travel:
   url.includes('assets/data/records/finance/')?finance:
   url.includes('assets/data/records/measures-119.json')?{}:memberVotes;
  return {ok:true,json:async()=>data};
 };
 const ctx={window:{GEO_STATES:[]},console,document:{getElementById:id=>el[id],createElement:()=>node()},
  history:{replaceState(){}},location:{hash:'',pathname:'/records.html',search:''},
  URLSearchParams,encodeURIComponent,fetch,Date,Number,Array,Intl};
 vm.runInNewContext(read('assets/js/states.js'),ctx);
 vm.runInNewContext(read('assets/js/records-model.js'),ctx);
 vm.runInNewContext(read('assets/js/records.js'),ctx);
 return {el,requests};
}
test('state tiles are the default directory, choosing Colorado exposes the delegation and a working voting profile',async()=>{
 const {el,requests}=build();
 await tick();await tick();await tick();
 assert.equal(el.stateGrid.children.length,51);
 assert.equal(el.stateDirectory.hidden,false);
 assert.equal(el.delegationDirectory.hidden,true);
 const co=el.stateGrid.children.find(c=>c.attributes['aria-label']==='Browse Colorado congressional delegation');
 assert.ok(co);
 co.click();
 assert.equal(el.stateDirectory.hidden,true);
 assert.equal(el.delegationDirectory.hidden,false);
 assert.equal(el.delegationTitle.textContent,'Colorado');
 assert.equal(el.senateMembers.children.length,2);
 assert.deepEqual(el.houseMembers.children.map(c=>c.children.find(x=>x.className==='recordsMemberDistrict')?.textContent),['DISTRICT 3','DISTRICT 7']);
 el.houseMembers.children[0].click();
 await tick();await tick();
 assert.equal(el.profileName.textContent,'District Three');
 assert.equal(el.memberProfile.hidden,false);
 assert.equal(el.delegationDirectory.hidden,true);
 assert.match(el.voteStatus.textContent,/1 recorded votes/);
 assert.equal(el.financeVisualization.children[0].children.length,4);
 assert.equal(el.financeVisualization.children[0].children[0].children[1].textContent,'$125,000');
 assert.match(el.travelVisualization.children[0].textContent,/1 published travel filing/);
 assert.ok(el.travelVisualization.children.some(child=>child.className==='recordsTravelSponsors'));
 assert.equal(el.voteSummary.hidden,false);
 assert.equal(el.voteDistribution.children.length,3);
 assert.match(el.voteDistribution.children[0].textContent,/not Democratic vs. Republican votes/);
 el.voteFilterYea.click();
 assert.equal(el.voteFilterYea.attributes['aria-pressed'],'true');
 assert.equal(el.memberVotes.children.length,1);
 el.voteFilterNay.click();
 assert.match(el.memberVotes.children[0].textContent,/No captured votes match/);
 el.voteFilterAll.click();
 assert.equal(el.memberVotes.children.length,1);
 assert.ok(requests.some(u=>u.includes('assets/data/records/members/H000002.json')));
 el.backToDelegation.click();
 assert.equal(el.memberProfile.hidden,true);
 assert.equal(el.delegationDirectory.hidden,false);
 el.backToStates.click();
 assert.equal(el.stateDirectory.hidden,false);
 assert.equal(el.delegationDirectory.hidden,true);
});

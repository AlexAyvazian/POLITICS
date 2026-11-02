import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('state-first directory retains silhouettes but members are recognizable photographic portraits',()=>{
 const js=read('assets/js/records.js');
 const css=read('assets/css/records-editorial.css');
 const html=read('records.html');
 assert.match(js,/unitedstates\.github\.io\/images\/congress\/225x275/);
 assert.match(js,/recordsMemberPortrait/);
 assert.match(js,/recordsMemberName/);
 assert.match(js,/recordsMemberParty/);
 assert.match(css,/\.recordsMemberPortrait/);
 assert.match(css,/\.recordsMemberGrid/);
 assert.match(css,/\.recordsStateGlyph/);
 assert.match(html,/records-editorial\.css/);
 assert.match(html,/id="delegationHero"/);
 assert.match(html,/id="delegationSilhouette"/);
});
test('member details are a distinct full page view with one large portrait, voting distribution and vote filters',()=>{
 const js=read('assets/js/records.js'),html=read('records.html'),css=read('assets/css/records-editorial.css');
 assert.match(html,/id="profilePortrait"/);
 assert.match(html,/id="voteDistribution"/);
 assert.match(html,/id="voteFilterAll"/);
 assert.match(html,/id="voteFilterYea"/);
 assert.match(html,/id="voteFilterNay"/);
 assert.match(html,/id="voteFilterAbsent"/);
 assert.match(js,/recordsProfilePortrait/);
 assert.match(js,/renderVoteDistribution/);
 assert.match(js,/activeVoteFilter/);
 assert.match(css,/\.recordsProfileHero/);
 assert.match(css,/\.recordsDistributionBar/);
});
test('profile selection hides delegation and return restores directory without losing which state',()=>{
 const js=read('assets/js/records.js');
 assert.match(js,/\$\('delegationDirectory'\)\.hidden=true/);
 assert.match(js,/\$\('delegationDirectory'\)\.hidden=false/);
 assert.match(js,/backToDelegation/);
 assert.match(js,/renderDelegation/);
});
test('voting summaries preserve all recorded statuses and never invent missed votes',()=>{
 const ctx={window:{}};
 vm.runInNewContext(read('assets/js/records-model.js'),ctx);
 const m=ctx.window.POLITICS_RECORDS_MODEL;
 const types=['Yea','Paired Yea','Announced Yea','Nay','Paired Nay','Announced Nay','Present','Not Voting'];
 const counts=m.voteDistribution(types.map(cast=>({cast})));
 assert.equal(counts.yes,3);
 assert.equal(counts.no,3);
 assert.equal(counts.other,1);
 assert.equal(counts.absent,1);
 assert.equal(counts.total,8);
 assert.equal(m.voteDistribution([{cast:'Unknown status'}]).total,0);
});

test('profile opens with accessible evidence overview and finance before the archived roll call list',()=>{
 const html=read('records.html');
 assert.match(html,/id="memberDashboard"/);
 assert.match(html,/id="recentDecisions"/);
 assert.match(html,/id="voteArchive"/);
 assert.match(html,/id="profileOverviewNav"/);
 assert.ok(html.indexOf('id="financeLinks"')<html.indexOf('id="memberVotes"'));
 assert.match(html,/<details[^>]*id="voteArchive"/);
});
test('member evidence aggregates only verified cached inputs with explicit missing statuses',()=>{
 const ctx={window:{}};
 vm.runInNewContext(read('assets/js/records-model.js'),ctx);
 const m=ctx.window.POLITICS_RECORDS_MODEL;
 const votes=[{cast:'Yea',measure:'H.R. 15',roll:2},{cast:'Nay',measure:'H.R.15',roll:3},{cast:'Present',measure:'S. 2',roll:4}];
 const out=m.profileEvidenceSummary({votes,votesAvailable:true,finance:{cycle:2026,raised:125000,candidateId:'H1CA00001'},travel:{filings:[{reportedYear:2026},{reportedYear:2025}]}});
 assert.equal(out.voteCount,3);
 assert.equal(out.measureCount,2);
 assert.equal(out.campaignReceipts,125000);
 assert.equal(out.travelFilings,2);
 assert.equal(out.candidateId,'H1CA00001');
 const unavailable=m.profileEvidenceSummary({votes:[],votesAvailable:false,finance:null,travel:null});
 assert.equal(unavailable.voteCount,null);
 assert.equal(unavailable.measureCount,null);
 assert.equal(unavailable.campaignReceipts,null);
 assert.equal(unavailable.travelFilings,null);
});

test('profile has data-first FEC and lobbying evidence, with no unverified relationship inference',()=>{
 const html=read('records.html'),js=read('assets/js/records.js'),css=read('assets/css/records-editorial.css');
 for(const id of ['financeDetailViz','lobbyVisualization','lobbyLinks'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/function evidenceBars/);
 assert.match(js,/async function loadFinanceDetail/);
 assert.match(js,/async function loadLobby/);
 assert.match(js,/\/api\/member-finance-detail/);
 assert.match(js,/\/api\/member-lobby-network/);
 assert.match(css,/recordsInsightGrid/);
 assert.ok(html.indexOf('id="financeLinks"')<html.indexOf('id="votesArchivePanel"'));
 assert.ok(html.indexOf('id="lobbyLinks"')<html.indexOf('id="votesArchivePanel"'));
});

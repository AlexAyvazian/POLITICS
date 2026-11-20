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

test('profile opens with an overview and keeps detailed voting and funding in separate panels',()=>{
 const html=read('records.html');
 assert.match(html,/id="memberDashboard"/);
 assert.match(html,/id="recentDecisions"/);
 assert.match(html,/id="voteArchive"/);
 assert.match(html,/id="profileOverviewNav"[^>]*role="tablist"/);
 assert.ok(html.indexOf('id="profilePanelVotes"')<html.indexOf('id="votesArchivePanel"'));
 assert.ok(html.indexOf('id="profilePanelFunding"')<html.indexOf('id="financeLinks"'));
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
 assert.ok(html.indexOf('id="financeLinks"')>html.indexOf('id="profilePanelFunding"'));
 assert.ok(html.indexOf('id="lobbyLinks"')>html.indexOf('id="profilePanelFunding"'));
});

test('every member receives a common source-linked committee-network panel',()=>{
 const html=read('records.html'),js=read('assets/js/records.js');
 assert.match(html,/id="moneyNetwork"/);
 assert.match(html,/id="moneyNetworkVisualization"/);
 assert.ok(html.indexOf('id="moneyNetwork"')<html.indexOf('id="financeLinks"'));
 assert.match(js,/async function loadMoneyNetwork\(m,committeeId=null,trail=\[\]\)/);
 assert.match(js,/\/api\/political-money-network/);
 assert.match(js,/loadMoneyNetwork\(m\);/);
 assert.doesNotMatch(js,/JEFF PAC|Jeffries for Congress/);
});

test('representative profile keeps the full portrait visible instead of cropping the face',()=>{
 const css=read('assets/css/records-editorial.css');
 const portraitRule=css.match(/\.recordsProfilePortrait img\{([^}]+)\}/);
 assert.ok(portraitRule,'profile photograph needs a dedicated rule');
 assert.match(portraitRule[1],/object-fit:\s*contain\s*;/,'entire headshot must remain visible');
 assert.doesNotMatch(portraitRule[1],/object-fit:\s*cover\s*;/,'portrait must not crop the face');
 assert.match(css,/\.recordsProfilePortrait\{[^}]*overflow:hidden/,'photo remains inside the existing profile frame');
});

test('Alaska fills its selector tile without distorting the established silhouette or changing hover colors',()=>{
 const css=read('assets/css/records-editorial.css');
 const js=read('assets/js/records.js');
 const html=read('records.html');
 assert.match(js,/item\.abbr==='AK'\)btn\.className\+=' recordsStateCard--alaska'/);
 assert.match(css,/\.recordsStateCard--alaska\s+\.recordsStateGlyph\s+svg\s*\{[^}]*transform:\s*scale\(1\.35\)/s);
 assert.match(css,/\.recordsStateCard--alaska\s+\.recordsStateGlyph\s+svg\s*\{[^}]*transform-origin:\s*50%\s+50%/s);
 assert.match(css,/@media\s*\(max-width:740px\)\s*\{\s*\.recordsStateCard--alaska\s+\.recordsStateGlyph\s+svg\s*\{[^}]*transform:\s*scale\(1\.14\)/s);
 assert.match(html,/assets\/js\/geo-colors\.js/);
 assert.match(js,/--records-state-hover/);
});


test('member profile separates overview, voting record, and funding into accessible tabs',()=>{
 const html=read('records.html'),js=read('assets/js/records.js'),css=read('assets/css/records-editorial.css');
 for(const id of ['profileTabOverview','profileTabVotes','profileTabFunding','profilePanelOverview','profilePanelVotes','profilePanelFunding'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/role="tablist"/);
 assert.match(html,/role="tab"[^>]*aria-controls="profilePanelOverview"/);
 assert.match(html,/role="tab"[^>]*aria-controls="profilePanelVotes"/);
 assert.match(html,/role="tab"[^>]*aria-controls="profilePanelFunding"/);
 assert.ok(html.indexOf('id="memberDashboard"')>html.indexOf('id="profilePanelOverview"'));
 assert.ok(html.indexOf('id="sponsoredLinks"')>html.indexOf('id="profilePanelOverview"'));
 assert.ok(html.indexOf('id="votesArchivePanel"')>html.indexOf('id="profilePanelVotes"'));
 for(const id of ['moneyNetwork','financeLinks','lobbyLinks','travelLinks'])
  assert.ok(html.indexOf('id="'+id+'"')>html.indexOf('id="profilePanelFunding"'));
 assert.match(js,/function activateProfileTab/);
 assert.match(js,/profileTabOverview/);
 assert.match(js,/profileTabVotes/);
 assert.match(js,/profileTabFunding/);
 assert.match(js,/activateProfileTab\('overview'/);
 assert.match(css,/\.recordsProfileTabs/);
 assert.match(css,/\.recordsProfileTab/);
 assert.match(css,/\.recordsProfilePanel\[hidden\]/);
});


test('funding tab prioritizes named PACs, sectors, and leadership PAC relationships before raw filing aggregates',()=>{
 const html=read('records.html'),js=read('assets/js/records.js'),css=read('assets/css/records-editorial.css');
 for(const id of ['fundingIntelligence','pacFundingVisualization'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.ok(html.indexOf('id="fundingIntelligence"')<html.indexOf('id="moneyNetwork"'));
 assert.ok(html.indexOf('id="fundingIntelligence"')<html.indexOf('id="financeLinks"'));
 assert.match(js,/function renderPacFunding/);
 assert.match(js,/async function loadPacFunding/);
 assert.match(js,/assets\/data\/records\/pac-funding\//);
 assert.match(js,/Top PAC & committee contributors/);
 assert.match(js,/Funding by sector/);
 assert.match(js,/Leadership PAC/);
 assert.match(css,/\.recordsPacFunding/);
 assert.match(css,/\.recordsFundingSector/);
 assert.match(css,/\.recordsPacContributor/);
});


test('member profile tabs are deep-linkable so funding views can be shared directly',()=>{
 const js=read('assets/js/records.js');
 assert.match(js,/route\.get\('tab'\)/);
 assert.match(js,/\['overview','votes','funding'\]\.includes\(requestedTab\)/);
 assert.match(js,/tab='\+encodeURIComponent\(key\)/);
});


test('funding metric uses the full contributor count rather than the top-40 display length',()=>{
 const js=read('assets/js/records.js');
 assert.match(js,/data\.contributorCount/);
 assert.doesNotMatch(js,/\['Named PACs \/ committees',top\.length/);
});


test('records funding assets revalidate so six-hour PAC refreshes are not hidden by browser cache',()=>{
 const html=read('records.html'),js=read('assets/js/records.js');
 assert.match(html,/assets\/js\/records\.js\?v=\d+/);
 assert.match(js,/assets\/data\/records\/pac-funding\/.*cache:'no-cache'/s);
});


test('funding view includes a source-linked individual donor leaderboard, not only PAC totals',()=>{
 const html=read('records.html'),js=read('assets/js/records.js'),css=read('assets/css/records-editorial.css');
 assert.match(html,/id="individualDonorVisualization"/);
 assert.ok(html.indexOf('id="individualDonorVisualization"')<html.indexOf('id="financeLinks"'));
 assert.match(js,/Top itemized individual contributors/);
 assert.match(js,/topIndividualContributors/);
 assert.match(js,/individualContributorScope/);
 assert.match(css,/\.recordsIndividualDonor/);
});

test('House and Senate directory cards use the same portrait framing instead of chamber-specific photo crops',()=>{
 const css=read('assets/css/records-editorial.css');
 assert.match(css,/\.recordsMemberPortrait img\{[^}]*object-fit:\s*cover[^}]*object-position:\s*50%\s+15%/s);
 assert.doesNotMatch(css,/#senateMembers \.recordsMemberPortrait\{[^}]*left:\s*37%/s);
 assert.doesNotMatch(css,/#senateMembers \.recordsMemberPortrait img\{[^}]*object-position:/s);
});

test('Senate photos are constrained to their vertical aspect and full portraits fit in the hero',()=>{
 const css=read('assets/css/records-editorial.css');
 assert.match(css,/#senateMembers \.recordsMemberPortrait img\{[^}]*width:auto[^}]*height:100%[^}]*object-fit:contain/s);
 assert.match(css,/\.recordsProfilePortrait \.recordsProfilePortraitImage img\{[^}]*max-width:100%[^}]*object-fit:contain/s);
});

test('PAC sectors display separate filing-year amounts and pending donor/lobby views retain links',()=>{
 const js=read('assets/js/records.js');
 assert.match(js,/recordsPacYears/);
 assert.match(js,/sector\.byYear/);
 assert.match(js,/Browse individual receipts at the FEC/);
 assert.match(js,/View LobbyView data sources/);
});

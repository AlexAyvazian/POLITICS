import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {filterCandidates,normalizeIssueSheet,safeImageUrl,normalizeDirectory} from '../assets/js/issue-stances-model.js';
import {handle} from '../workers/politics-gateway.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Issue Stances is a sixth shared-nav section and does not replace other five destinations',()=>{
 const pages=['index.html','congressional.html','records.html','foreign-influence.html','foreign-agents.html','issues.html'];
 for(const p of pages) {
  const html=read(p),nav=html.match(/<nav class="unifiedTabs"[\s\S]*?<\/nav>/)?.[0]||'';
  assert.match(nav,/href="issues\.html"/,p);
  assert.equal((nav.match(/<a /g)||[]).length,6,p);
  assert.equal((nav.match(/aria-current="page"/g)||[]).length,1,p);
 }
 assert.match(read('issues.html'),/href="issues\.html" aria-current="page"/);
});

test('Issue Stances uses the requested two hallway scopes and door labels',()=>{
 const html=read('issues.html'),js=read('assets/js/issue-stances.js'),updater=read('scripts/update_issue_hallways.py');
 assert.match(html,/>Current<br>Congresspeople<br>and Governors<\/span>/);
 assert.match(html,/All U\.S\. House &amp; Senate members from the 119th and 120th Congresses · All 50 governors/);
 assert.match(html,/>Future<br>Election<br>Candidates<\/span>/);
 assert.match(html,/2027 onward · President · U\.S\. House · U\.S\. Senate · Governor/);
 for(const office of ['Candidate for President','Candidate for U.S. House','Candidate for U.S. Senate','Candidate for Governor']){
  assert.ok(js.includes("'"+office+"'"),office);
 }
 assert.match(js,/person\.year>=2027/);
 assert.match(updater,/CONGRESSES\s*=\s*\{119:[^\n]+120:/);
 assert.match(updater,/FEC_OFFICES\s*=\s*\{[^\n]*"P": "President"/);
 assert.doesNotMatch(js,/Candidate for State (?:House|Senate)/);
});

test('Issue Stances lobby uses bright eagle background and circular portal selectors',()=>{
 const css=read('assets/css/issue-stances.css');
 assert.match(css,/American-Eagle-Flag-Patriotic-4th-png-Graphics-113400236-1\.jpeg/);
 assert.match(css,/\.issueDoor\{[\s\S]*aspect-ratio:1[\s\S]*border-radius:50%/);
 assert.match(css,/@keyframes portalShimmer/);
 assert.match(css,/@keyframes portalGlow/);
 assert.match(css,/\.issueDoor span,\.issueDoor small\{[\s\S]*background:none!important/);
 assert.doesNotMatch(css,/border:\s*8px\s+ridge/);
 assert.doesNotMatch(css,/Capitol Hill\.jpeg/);
 assert.doesNotMatch(css,/linear-gradient\(#142030cf,#101722ec\)/);
});

test('Issue Stances uses the supplied portal artwork below the wings with wing-only starlight',()=>{
 const css=read('assets/css/issue-stances.css');
 assert.match(css,/\.issueDoor:first-child\{[^}]*background-image:url\("\.\.\/\.\.\/wallpaper\/issue-portal-1\.webp"\)/s);
 assert.match(css,/\.issueDoor:nth-child\(2\)\{[^}]*background-image:url\("\.\.\/\.\.\/wallpaper\/issue-portal-2\.webp"\)/s);
 assert.match(css,/\.issueDoor:first-child\{[^}]*left:clamp\(34px,6\.5vw,125px\);[^}]*bottom:/s);
 assert.match(css,/\.issueDoor:nth-child\(2\)\{[^}]*right:clamp\(34px,6\.5vw,125px\);[^}]*bottom:/s);
 assert.match(css,/\.issueDoor span\{[^}]*font:700 clamp\(14px,\.95vw,16px\)/s);
 assert.match(css,/\.issueDoor span\{[^}]*max-width:74%/s);
 assert.match(css,/\.issueLobby::before,\.issueLobby::after\{/);
 assert.match(css,/@keyframes wingSparkleA/);
 assert.match(css,/@keyframes wingSparkleB/);
 assert.match(css,/brightness\(2\.35\)/);
 assert.match(css,/brightness\(2\.45\)/);
 assert.match(css,/wingSparkleA 1\.55s/);
 assert.match(css,/wingSparkleB 1\.95s/);
 const portalStart=css.indexOf('.issueDoor{');
 const portalEnd=css.indexOf('.issueReturn',portalStart);
 assert.ok(portalStart>=0&&portalEnd>portalStart);
 assert.doesNotMatch(css.slice(portalStart,portalEnd),/conic-gradient/);
});

test('Issue Stances contains only portrait identity and sourced issue-sheet content',()=>{
 const html=read('issues.html'),js=read('assets/js/issue-stances.js'),css=read('assets/css/issue-stances.css');
 assert.match(html,/class="unifiedTopNav"/);
 assert.match(html,/<canvas[^>]+id="stage"/);
 assert.doesNotMatch(html,/id="issueGallery"/);
 assert.match(html,/id="issueSheet"/);
 assert.match(html,/id="issueSearch"/);
 assert.match(html,/id="issueState"/);
 assert.match(js,/WALLPAPER_IMAGES/,'actual 3D corridor receives user wallpapers');
 assert.match(css,/#stage/);
 for(const forbidden of [/Quick Record/i,/Top donor sectors/i,/Fundraising summary/i,/Political score/i,/Leadership PAC/i]){
  assert.doesNotMatch(html,forbidden);
  assert.doesNotMatch(js,forbidden);
 }
});

test('real Voterist directory is normalized without assuming fields or fabricating portraits',()=>{
 const out=normalizeDirectory({total:2,candidates:[
  {slug:'example-one',name:'Example One',office:'State Senate',party:'Independent',state:'NY',photoUrl:'https://example.com/a.jpg'},
  {slug:'example-two',fullName:'Example Two',office:'Governor',party:'Democratic',state:'CA'}
 ]});
 assert.equal(out.length,2);
 assert.equal(out[0].name,'Example One');
 assert.equal(out[0].portrait,'https://example.com/a.jpg');
 assert.equal(out[1].name,'Example Two');
 assert.equal(out[1].portrait,null);
});

test('candidate slug explicitly supplies the state code when the directory omits it',()=>{
 const items=normalizeDirectory({candidates:[
  {slug:'hakeem-jeffries-ny-2026-us-house',name:'Hakeem Jeffries'},
  {slug:'someone-xx-2026-state-house',name:'Unspecified'},
  {slug:'xavier-becerra',name:'Xavier Becerra',jurisdictionId:'us.ca',electionId:'ca.2026.general'}
 ]});
 assert.equal(items[0].state,'NY');
 assert.equal(items[1].state,'');
 assert.equal(items[2].state,'CA');
});

test('published positions match their own sourceId to their evidence URL',()=>{
 const sheet=normalizeIssueSheet({
  record:{workspace:{candidateName:'Example Candidate',positions:[
   {issue:'Healthcare',statement:'Supports a public option.',sourceId:'s1'}],
   evidence:[{id:'s1',url:'https://example.org/policy',label:'Policy statement',status:'Accepted'}]}},
  preview:{positions:[{issue:'Taxation',statement:'Preview description',sourceId:'s2'}]}
 },{name:'Directory Name'});
 assert.equal(sheet.name,'Example Candidate');
 assert.equal(sheet.published,true);
 assert.deepEqual(sheet.positions[0],{
  issue:'Healthcare',statement:'Supports a public option.',
  sourceUrl:'https://example.org/policy',sourceLabel:'Policy statement',sourceStatus:'Accepted'
 });
 assert.equal(sheet.positions.length,1);
});

test('unpublished candidate preview is used and missing issues are not guessed',()=>{
 const sheet=normalizeIssueSheet({record:null,published:false,preview:{candidateName:'Preview Candidate',positions:[],evidence:[]}});
 assert.equal(sheet.published,false);
 assert.equal(sheet.name,'Preview Candidate');
 assert.deepEqual(sheet.positions,[]);
});

test('invalid links and unexpected data structures cannot create links or issue claims',()=>{
 const sheet=normalizeIssueSheet({record:null,preview:{positions:[
  {issue:'Housing',statement:'Supports new housing supply.',sourceId:'x'},
  {issue:'Taxation',statement:'',sourceId:'y'}],
  evidence:[{id:'x',url:'javascript:alert(1)',label:'Untrusted'}]}});
 assert.equal(sheet.positions.length,1);
 assert.equal(sheet.positions[0].sourceUrl,null);
 assert.equal(safeImageUrl('javascript:alert(1)'),null);
 assert.equal(safeImageUrl('https://example.org/photo.jpg'),'https://example.org/photo.jpg');
});

test('directory search and filters do not infer politician issue positions from party',()=>{
 const entries=[{slug:'a',name:'Example A',party:'Democratic',office:'U.S. Senate',state:'CA'},
  {slug:'b',name:'Example B',party:'Republican',office:'Governor',state:'TX'}];
 assert.deepEqual(filterCandidates(entries,{query:'senate',party:'',state:''}).map(x=>x.slug),['a']);
 assert.deepEqual(filterCandidates(entries,{query:'',party:'Republican',state:'TX'}).map(x=>x.slug),['b']);
 assert.deepEqual(filterCandidates(entries,{query:'housing',party:'',state:''}),[]);
});

test('Worker proxies only allowlisted read-only Voterist public paths, with no API key',async()=>{
 const called=[];
 const upstream=async (url,opts)=>{
  called.push({url,opts});
  return new Response(JSON.stringify({candidates:[]}),{status:200});
 };
 const response=await handle(new Request('https://example.workers.dev/api/voterist?type=candidates'),{}, {},upstream);
 assert.equal(response.status,200);
 assert.equal(new URL(called[0].url).hostname,'www.voterist.com');
 assert.equal(new URL(called[0].url).pathname,'/api/public/candidates');
 assert.equal(JSON.stringify(called[0].opts).includes('API_KEY'),false);
 const blocked=await handle(new Request('https://example.workers.dev/api/voterist?type=candidate&slug=..%2Fusers'),{}, {},upstream);
 assert.equal(blocked.status,400);
 assert.equal(called.length,1);
});

test('updated .jpeg wallpaper files are present and no old .jpg path is assumed',()=>{
 const manifest=read('assets/js/issue-stances-wallpapers.js');
 for(const jpg of [
  'wallpaper/American-Eagle-Flag-Patriotic-4th-png-Graphics-113400236-1.jpeg',
  'wallpaper/Lincoln-Memorial-Painting-by-Borbay-1024x675.jpeg',
  'wallpaper/White House.jpeg',
  'wallpaper/Statue of Liberty.jpeg'
 ]){
  assert.ok(existsSync(new URL('../'+jpg,import.meta.url)),'Image must exist: '+jpg);
  assert.ok(manifest.includes(jpg),'Image must appear in manifest: '+jpg);
 }
});

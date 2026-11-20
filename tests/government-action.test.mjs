import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Government Action is a voter-facing page linked from every major POLITICS surface',()=>{
 const page=read('government-action.html'),js=read('assets/js/government-action.js'),css=read('assets/css/government-action.css');
 for(const text of ['Government Action','Rules &amp; Notices','Regulatory Dockets','Official Publications','Federal Legislation'])
  assert.match(page,new RegExp(text));
 assert.match(page,/id="governmentSearch"/);
 for(const endpoint of ['federalregister','regulations','govinfo','congress'])
  assert.match(js,new RegExp("endpoint:'"+endpoint+"'"));
 assert.match(js,/GATEWAY\+'\/api\/'\+conf\.endpoint/);
 assert.match(css,/governmentActionCard/);
 for(const p of ['index.html','congressional.html','records.html','foreign-influence.html','sources.html'])
  assert.match(read(p),/href="government-action\.html"/,p+' must link Government Action');
});

test('Government Action keeps different official record types distinct and caveated',()=>{
 const page=read('government-action.html'),js=read('assets/js/government-action.js');
 assert.match(js,/Federal Register/);
 assert.match(js,/Regulations\.gov/);
 assert.match(js,/GovInfo/);
 assert.match(js,/Congress\.gov/);
 assert.match(page,/proposed rule/i);
 assert.match(page,/final rule/i);
 assert.match(page,/bill listed by <strong>Congress\.gov<\/strong> is legislation introduced/i);
 assert.match(js,/Filtered within the latest Congress\.gov bills/);
});

test('GovInfo gateway uses the official POST Search Service for topical queries',()=>{
 const worker=read('workers/politics-gateway.mjs');
 assert.match(worker,/case 'govinfo'/);
 assert.match(worker,/https:\/\/api\.govinfo\.gov\/search/);
 assert.match(worker,/method:'POST'/);
 assert.match(worker,/query:q/);
 assert.match(worker,/pageSize:String\(n\)/);
 assert.match(worker,/offsetMark:'\*'/);
 assert.match(worker,/publishdate/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Government Action is a real voter-facing page linked from the major POLITICS surfaces',()=>{
 const page=read('government-action.html'),js=read('assets/js/government-action.js'),css=read('assets/css/government-action.css');
 assert.match(page,/Government Action/);
 assert.match(page,/Rules & Notices/);
 assert.match(page,/Regulatory Dockets/);
 assert.match(page,/Official Publications/);
 assert.match(page,/Federal Legislation/);
 assert.match(page,/id="governmentSearch"/);
 assert.match(js,/\/api\/federalregister/);
 assert.match(js,/\/api\/regulations/);
 assert.match(js,/\/api\/govinfo/);
 assert.match(js,/\/api\/congress/);
 assert.match(css,/governmentActionCard/);
 for(const p of ['index.html','congressional.html','records.html','foreign-influence.html','sources.html'])
  assert.match(read(p),/href="government-action\.html"/,p+' must link Government Action');
});

test('Government Action labels each source and does not merge agency rules with legislation',()=>{
 const js=read('assets/js/government-action.js');
 assert.match(js,/Federal Register/);
 assert.match(js,/Regulations\.gov/);
 assert.match(js,/GovInfo/);
 assert.match(js,/Congress\.gov/);
 assert.match(js,/Proposed Rule|Rule|Notice/);
 assert.match(js,/regulatory document/i);
 assert.match(js,/official publication/i);
 assert.match(js,/federal bill/i);
});

test('GovInfo gateway uses the official POST Search Service when a query is supplied',()=>{
 const worker=read('workers/politics-gateway.mjs');
 assert.match(worker,/case 'govinfo'/);
 assert.match(worker,/https:\/\/api\.govinfo\.gov\/search/);
 assert.match(worker,/method:'POST'/);
 assert.match(worker,/pageSize/);
 assert.match(worker,/offsetMark/);
 assert.match(worker,/publishdate/);
});

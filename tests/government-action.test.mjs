
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Government Action is organized around what happened, not provider tabs',()=>{
 const page=read('government-action.html'),js=read('assets/js/government-action.js'),css=read('assets/css/government-action.css');
 assert.match(page,/What changed in the federal government/i);
 assert.match(page,/data-action-filter="all"/);
 assert.match(page,/data-action-filter="final"/);
 assert.match(page,/data-action-filter="proposed"/);
 assert.match(page,/data-action-filter="presidential"/);
 assert.match(page,/data-action-filter="legislation"/);
 assert.doesNotMatch(page,/Rules &amp; Notices|Regulatory Dockets|Official Publications|Federal Legislation/);
 assert.doesNotMatch(js,/CONFIG=\{\s*register:/);
 assert.match(js,/function normalizeFederalRegister/);
 assert.match(js,/function normalizeCongress/);
 assert.match(js,/whatHappened/);
 assert.match(js,/statusLabel/);
 assert.match(css,/governmentActionFacts/);
 for(const pageName of ['index.html','congressional.html','records.html','foreign-influence.html','foreign-agents.html'])
  assert.match(read(pageName),/href="government-action\.html"/,pageName+' must link Government Action');
});

test('Government Action cards expose substance, status, actor and dates',()=>{
 const js=read('assets/js/government-action.js');
 for(const field of ['whatHappened','statusLabel','actor','date','source','url'])
  assert.match(js,new RegExp(field));
 assert.match(js,/Latest action/i);
 assert.match(js,/Final rule/i);
 assert.match(js,/Proposed rule/i);
 assert.match(js,/Presidential/i);
 assert.match(js,/Open official record/);
});

test('Congress gateway defaults to the current Congress and sorts newest updates first',()=>{
 const worker=read('workers/politics-gateway.mjs');
 assert.match(worker,/function currentCongressNumber/);
 assert.match(worker,/case 'congress'/);
 assert.match(worker,/\/v3\/bill\/'\+congress/);
 assert.match(worker,/sort:'updateDate\+desc'/);
});

test('Government Action no longer exposes GovInfo as a user-facing browse tab',()=>{
 const page=read('government-action.html'),js=read('assets/js/government-action.js');
 assert.doesNotMatch(page,/GovInfo|Official Publications/);
 assert.doesNotMatch(js,/renderGovInfo|endpoint:'govinfo'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const exists=p=>existsSync(new URL('../'+p,import.meta.url));

test('Government Action was retired as a standalone public section',()=>{
 for(const path of ['government-action.html','assets/css/government-action.css','assets/js/government-action.js']){
  assert.equal(exists(path),false,path+' should be removed');
 }
 for(const page of ['index.html','congressional.html','records.html','foreign-influence.html','foreign-agents.html']){
  assert.doesNotMatch(read(page),/href="government-action\.html"/,page+' should not link to retired section');
 }
});

test('Shared federal gateway continues serving official Congress records',()=>{
 const worker=read('workers/politics-gateway.mjs');
 assert.match(worker,/function currentCongressNumber/);
 assert.match(worker,/case 'congress'/);
 assert.match(worker,/\/v3\/bill\/'\+congress/);
 assert.match(worker,/sort:'updateDate\+desc'/);
});

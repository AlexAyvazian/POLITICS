import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const pages=['index.html','congressional.html','records.html','foreign-influence.html','foreign-agents.html','government-action.html'];

test('every top-level POLITICS page uses the same unified navigation shell',()=>{
 for(const page of pages){
  const html=read(page);
  assert.match(html,/assets\/css\/unified-nav\.css/,'missing shared nav CSS in '+page);
  assert.match(html,/class="unifiedTopNav"/,'missing shared nav shell in '+page);
  assert.match(html,/class="unifiedTabs"/,'missing shared nav tabs in '+page);
 }
});

test('unified navigation exposes the same six destinations in the same order',()=>{
 const expected=[
  ['index.html#map','County Atlas'],
  ['congressional.html','Congressional Atlas'],
  ['records.html','Congressional Records'],
  ['foreign-influence.html','Foreign Influence'],
  ['foreign-agents.html','Foreign Agents'],
  ['government-action.html','Government Action']
 ];
 for(const page of pages){
  const html=read(page);
  const nav=html.match(/<nav class="unifiedTabs"[\s\S]*?<\/nav>/)?.[0]||'';
  assert.ok(nav,'unified nav missing from '+page);
  let cursor=-1;
  for(const [href,label] of expected){
   const pos=nav.indexOf('href="'+href+'"');
   assert.ok(pos>cursor,page+' nav order is inconsistent at '+label);
   assert.ok(nav.includes('href="'+href+'"'),page+' missing '+label);
   cursor=pos;
  }
 }
});

test('only the current top-level destination is marked active on each page',()=>{
 const active={
  'index.html':'County Atlas',
  'congressional.html':'Congressional Atlas',
  'records.html':'Congressional Records',
  'foreign-influence.html':'Foreign Influence',
  'foreign-agents.html':'Foreign Agents',
  'government-action.html':'Government Action'
 };
 for(const page of pages){
  const html=read(page);
  const nav=html.match(/<nav class="unifiedTabs"[\s\S]*?<\/nav>/)?.[0]||'';
  assert.equal((nav.match(/aria-current="page"/g)||[]).length,1,page+' should have exactly one active top-level tab');
  const current=nav.match(/<a[^>]*aria-current="page"[^>]*>([^<]+)<\/a>/)?.[1]||'';
  assert.equal(current,active[page],page+' active tab is wrong');
 }
});

test('unified nav stays one-row on desktop and horizontally reachable on narrow screens',()=>{
 const css=read('assets/css/unified-nav.css');
 assert.match(css,/\.unifiedTopNav\s*\{[^}]*display:\s*grid/s);
 assert.match(css,/\.unifiedTabs\s*\{[^}]*display:\s*flex[^}]*white-space:\s*nowrap/s);
 assert.match(css,/@media\s*\(max-width:\s*900px\)[\s\S]*\.unifiedTabs\s*\{[^}]*overflow-x:\s*auto/s);
 assert.doesNotMatch(css,/\.unifiedTabs\s*\{[^}]*flex-wrap:\s*wrap/s);
});

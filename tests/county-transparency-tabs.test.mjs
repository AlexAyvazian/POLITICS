import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('County Atlas exposes stored policy datasets through voter-question tabs',()=>{
 const js=read('assets/js/map.js'),css=read('assets/css/map.css');
 for(const label of ['Overview','Housing','Jobs & Economy','Health & Well-Being','Education & Families','Infrastructure','Representation'])
  assert.match(js,new RegExp(label.replace(/[&]/g,'&')));
 for(const fn of ['renderCdcPlaces','renderCongressionalDelegation','renderOpenStates','renderHouseVotes','renderBillCommons'])
  assert.ok(js.split(fn+'(').length-1>=2,fn+' must be called as well as defined');
 assert.match(js,/POLITICS_COUNTY_CACHE\?\.loadOpenStates/);
 assert.match(js,/POLITICS_COUNTY_CACHE\?\.loadBills/);
 assert.match(css,/countyDataTabs/);
 assert.match(css,/countyDataTab/);
});

test('County Atlas navigation publicly links data-source transparency',()=>{
 const html=read('index.html');
 assert.match(html,/href="sources\.html"/);
 assert.match(html,/>Data Sources</);
});


test('Jobs & Economy renders stored BEA county income alongside Census conditions',()=>{
 const map=read('assets/js/map.js'),cache=read('assets/js/county-cache.js');
 assert.match(cache,/\/api\/bea-snapshot/);
 assert.match(cache,/bea/);
 assert.match(map,/function renderBeaIncome/);
 assert.match(map,/Per capita personal income/);
 assert.match(map,/U\.S\. Bureau of Economic Analysis|BEA/);
 assert.match(map,/tab==='economy'[\s\S]*renderBeaIncome/);
});

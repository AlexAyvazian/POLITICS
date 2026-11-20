import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Health tab loads and renders stored CMS Part B provider activity context',()=>{
 const map=read('assets/js/map.js'),cache=read('assets/js/county-cache.js'),sources=read('assets/js/sources.js');
 assert.match(cache,/assets\/data\/state\/cms-partb-provider-activity\.json/);
 assert.match(cache,/cmsPartB/);
 assert.match(map,/function renderCmsPartB/);
 assert.match(map,/published Medicare Part B/i);
 assert.match(map,/tab==='health'[\s\S]*renderCmsPartB/);
 assert.match(sources,/cms_partb_state_provider_activity/);
});

test('CMS Part B panel does not mislabel published provider rows as doctors or county access',()=>{
 const map=read('assets/js/map.js');
 assert.match(map,/statewide context/i);
 assert.match(map,/not a county estimate/i);
 assert.match(map,/not all licensed|not all clinicians/i);
 assert.match(map,/fewer than 11 beneficiaries/i);
 assert.doesNotMatch(map,/CMS doctors available/i);
});

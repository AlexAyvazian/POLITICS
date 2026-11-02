import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Congressional Atlas loads site-owned prebuilt geography, never on-demand Census or API gateway',()=>{
 const js=read('assets/js/congressional-map.js');
 assert.match(js,/assets\/data\/congressional/);
 assert.doesNotMatch(js,/tigerweb\.geo\.census\.gov|workers\.dev|api\/district-geometry/);
 assert.match(js,/rewindForD3/);
 assert.match(js,/cache\.has\(key\)/);
});
test('a daily automated workflow prebuilds country and state legislative district snapshots',()=>{
 const workflow=read('.github/workflows/refresh-congressional-geography.yml');
 assert.match(workflow,/schedule:/);
 assert.match(workflow,/cron:/);
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/update_congressional_boundaries\.py/);
 assert.match(workflow,/contents: write/);
 const script=read('scripts/update_congressional_boundaries.py');
 for(const id of ['house','stateSenate','stateHouse'])assert.ok(script.includes(id));
 assert.match(script,/returnCountOnly/);
 assert.match(script,/US-house\.geojson/);
 assert.match(script,/assets\/data\/congressional/);
});
test('no static asset absence causes an upstream Census request in the user browser',()=>{
 const js=read('assets/js/congressional-map.js');
 assert.match(js,/fetch\(url,/);
 assert.doesNotMatch(js,/geojson\(tigerUrl/);
 assert.doesNotMatch(js,/fetch\(GATEWAY/);
});

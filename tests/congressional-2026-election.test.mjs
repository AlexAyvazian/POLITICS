import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Congressional Atlas loads the nationwide 2026 election-result cache',()=>{
 const html=read('congressional.html');
 const js=read('assets/js/congressional-map.js');
 assert.match(html,/assets\/data\/elections\/us-2026\.js/);
 assert.match(js,/US_ELECTION_2026/);
 assert.match(js,/houseElectionResult/);
 assert.match(js,/Incoming 120th Congress/);
 assert.match(js,/2026 House election results/);
});

test('House district colors come from the 2026 result rather than current 119th incumbency',()=>{
 const js=read('assets/js/congressional-map.js');
 assert.match(js,/layer==='house'.*houseElectionResult/s);
 assert.match(js,/mapParty/);
 assert.match(js,/pending/);
});

test('national Senate and Governor layers use only 2026 outcomes and do not fall back to stale prior races',()=>{
 const js=read('assets/js/congressional-map.js');
 assert.match(js,/US_ELECTION_2026.*senate/s);
 assert.match(js,/US_ELECTION_2026.*governor/s);
 assert.match(js,/if\(nationwide\)return nationwide\?\.\[which\]\?\.\[stateCode\]\|\|null/);
 assert.match(js,/No 2026 race/);
});

test('uncalled races have an explicit pending yellow map state',()=>{
 const css=read('assets/css/congressional-map.css');
 const js=read('assets/js/congressional-map.js');
 assert.match(css,/data-party="pending"/);
 assert.match(css,/atlasPartySwatch\.pending/);
 assert.match(js,/Pending \/ uncalled/);
});

test('the boundary generator identifies House geography as 120th Congress while records remain current-term data',()=>{
 const boundary=read('scripts/update_congressional_boundaries.py');
 const model=read('assets/js/congressional-model.js');
 const records=read('assets/js/records-address-model.js');
 assert.match(boundary,/120th Congress/);
 assert.match(boundary,/TIGERweb\/Legislative\/MapServer/);
 assert.match(model,/120th Congress/);
 assert.match(records,/119th Congressional Districts/);
});

test('2026 election workflow publishes the generated cache on non-PR runs and same-repo PR branches',()=>{
 const workflow=read('.github/workflows/refresh-us-2026-election-results.yml');
 assert.match(workflow,/github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
 assert.match(workflow,/GITHUB_HEAD_REF:-\$GITHUB_REF_NAME/);
 assert.match(workflow,/git push origin "HEAD:\$\{TARGET_BRANCH\}"/);
});

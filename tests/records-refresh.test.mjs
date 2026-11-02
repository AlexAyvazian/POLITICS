import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('dedicated political-records collector uses a separate 15-minute cron and existing D1',()=>{
 const c=JSON.parse(read('wrangler.records.jsonc'));
 assert.equal(c.name,'politics-records-refresh');
 assert.equal(c.keep_vars,true);
 assert.deepEqual(c.triggers.crons,['*/15 * * * *']);
 assert.equal(c.d1_databases[0].binding,'COUNTY_DB');
});
test('separate Worker dispatches one source family per quarter hour',()=>{
 const s=read('workers/records-refresh.mjs');
 assert.match(s,/quarter%3/);
 assert.match(s,/refreshMemberLegislationBatch/);
 assert.match(s,/refreshMemberExtraBatch/);
 assert.match(s,/scheduled:recordsRefreshScheduled/);
 assert.doesNotMatch(read('workers/politics-gateway.mjs'),/ctx\.waitUntil\(refreshMemberExtraBatch/);
});

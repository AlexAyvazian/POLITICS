import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recordsRefreshPlan} from '../workers/records-refresh.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('records collector runs every five minutes so a full finance roster fits in each 12-hour cycle',()=>{
 const c=JSON.parse(read('wrangler.records.jsonc'));
 assert.equal(c.name,'politics-records-refresh');
 assert.equal(c.keep_vars,true);
 assert.deepEqual(c.triggers.crons,['*/5 * * * *']);
 assert.equal(c.d1_databases[0].binding,'COUNTY_DB');
});

test('quarter-hour ticks remain for secondary sources while other five-minute ticks walk finance batches',()=>{
 assert.deepEqual(recordsRefreshPlan(new Date('2026-11-20T00:00:00Z')), {kind:'secondary',secondaryIndex:0});
 assert.deepEqual(recordsRefreshPlan(new Date('2026-11-20T00:05:00Z')), {kind:'finance',batchIndex:0,batchSize:6});
 assert.deepEqual(recordsRefreshPlan(new Date('2026-11-20T00:10:00Z')), {kind:'finance',batchIndex:1,batchSize:6});
 assert.deepEqual(recordsRefreshPlan(new Date('2026-11-20T00:15:00Z')), {kind:'secondary',secondaryIndex:1});
 assert.deepEqual(recordsRefreshPlan(new Date('2026-11-20T00:20:00Z')), {kind:'finance',batchIndex:2,batchSize:6});
 assert.deepEqual(recordsRefreshPlan(new Date('2026-11-20T11:55:00Z')), {kind:'finance',batchIndex:95,batchSize:6});
 assert.deepEqual(recordsRefreshPlan(new Date('2026-11-20T12:05:00Z')), {kind:'finance',batchIndex:0,batchSize:6});
});

test('worker uses dedicated full-roster finance batches and keeps secondary collectors isolated',()=>{
 const s=read('workers/records-refresh.mjs');
 assert.match(s,/refreshMemberFinanceRosterBatch/);
 assert.match(s,/refreshFecMoneyNetwork/);
 assert.match(s,/refreshMemberLegislationBatch/);
 assert.match(s,/refreshMemberExtraBatch/);
 assert.match(s,/scheduled:recordsRefreshScheduled/);
 assert.doesNotMatch(read('workers/politics-gateway.mjs'),/ctx\.waitUntil\(refreshMemberExtraBatch/);
});

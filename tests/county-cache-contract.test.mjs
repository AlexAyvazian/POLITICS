import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('map uses nationwide snapshot cache without querying providers on county clicks',()=>{
 const map=read('assets/js/map.js');
 const client=read('assets/js/county-cache.js');
 assert.ok(map.includes('showCountyFacts(sel.fips)'));
 assert.ok(map.includes('POLITICS_COUNTY_CACHE.get()'));
 assert.ok(!map.includes('fetch('),'county map must not call APIs on click');
 assert.equal((client.match(/\bfetch\(/g)||[]).length,1,'load nationwide snapshot only once');
 assert.ok(client.includes('politics-daily-snapshot'));
});

test('the website contains only the map, no standalone research page',()=>{
 const html=read('index.html');
 assert.ok(html.includes('assets/js/county-cache.js'));
 assert.doesNotMatch(html,/sources\.html|Research sources/i);
});

test('daily Cron is attached only to keyed gateway, not the public reader',()=>{
 const gate=JSON.parse(read('wrangler.jsonc'));
 const reader=JSON.parse(read('wrangler.daily.jsonc'));
 assert.equal(gate.name,'crimson-mud-d254');
 assert.equal(gate.keep_vars,true);
 assert.deepEqual(gate.triggers.crons,['15 7 * * *']);
 assert.equal(gate.d1_databases[0].binding,'COUNTY_DB');
 assert.equal(reader.name,'politics-daily-snapshot');
 assert.ok(!reader.triggers,'reader must not run scheduled provider queries');
});

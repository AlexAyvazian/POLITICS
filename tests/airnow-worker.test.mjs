import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../workers/airnow-worker.mjs';

const request=(path,method='GET')=>new Request('https://test.workers.dev'+path,{method});
test('unknown route returns 404 without an AirNow upstream request',async()=>{
 const r=await worker.fetch(request('/not-airnow'),{});
 assert.equal(r.status,404);
 assert.equal(r.headers.get('Access-Control-Allow-Origin'),'*');
});
test('handles cross-origin preflight on the AirNow route',async()=>{
 const r=await worker.fetch(request('/api/airnow/observations?zip=93720','OPTIONS'),{});
 assert.equal(r.status,204);
 assert.equal(r.headers.get('Access-Control-Allow-Methods'),'GET, OPTIONS');
});
test('rejects unsupported methods',async()=>{
 const r=await worker.fetch(request('/api/airnow/observations?zip=93720','POST'),{});
 assert.equal(r.status,405);
});
test('passes through missing binding error without losing CORS',async()=>{
 const r=await worker.fetch(request('/api/airnow/observations?zip=93720'),{});
 assert.equal(r.status,503);
 assert.equal(r.headers.get('Access-Control-Allow-Origin'),'*');
});
test('preserves dashboard-managed variable on Wrangler deployment',()=>{
 const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.equal(config.name,'crimson-mud-d254');
 assert.equal(config.keep_vars,true);
 assert.equal(config.main,'workers/airnow-worker.mjs');
 assert.equal(Object.hasOwn(config,'vars'),false);
});

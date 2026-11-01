import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../workers/politics-gateway.mjs';

const website='https://politics-e5yt.onrender.com';
const env={FRONTEND_ORIGIN:website};
const request=(path,origin,method='GET')=>new Request('https://crimson-mud-d254.alxayvazian.workers.dev'+path,{
 method,
 ...(origin?{headers:{Origin:origin}}:{})
});

test('allows only the configured Render origin on actual API catalog requests',async()=>{
 const res=await handle(request('/api/catalog',website),env);
 assert.equal(res.status,200);
 assert.equal(res.headers.get('Access-Control-Allow-Origin'),website);
 assert.equal(res.headers.get('Vary'),'Origin');
 assert.match(res.headers.get('Access-Control-Allow-Methods'),'GET');
 const data=await res.json();
 assert.equal(data.providers.length,27);
});

test('blocks CORS for a disallowed browser origin without disrupting direct JSON access',async()=>{
 const res=await handle(request('/api/catalog','https://bad.example'),env);
 assert.equal(res.status,200);
 assert.equal(res.headers.get('Access-Control-Allow-Origin'),null);
 assert.equal(res.headers.get('Vary'),'Origin');
});

test('does not enable wildcard CORS or allow an origin-prefix lookalike',async()=>{
 const evil=website+'.evil.example';
 const res=await handle(request('/health',evil),env);
 assert.equal(res.status,200);
 assert.equal(res.headers.get('Access-Control-Allow-Origin'),null);
 assert.notEqual(res.headers.get('Access-Control-Allow-Origin'),'*');
});

test('correct origin receives CORS on preflight and API errors',async()=>{
 const pre=await handle(request('/api/catalog',website,'OPTIONS'),env);
 assert.equal(pre.status,204);
 assert.equal(pre.headers.get('Access-Control-Allow-Origin'),website);
 assert.equal(pre.headers.get('Access-Control-Allow-Methods'),'GET, OPTIONS');
 const bad=await handle(request('/does-not-exist',website),env);
 assert.equal(bad.status,404);
 assert.equal(bad.headers.get('Access-Control-Allow-Origin'),website);
});

test('unapproved origin receives no CORS on OPTIONS and no-origin requests stay accessible',async()=>{
 const rejected=await handle(request('/api/catalog','https://unapproved.example','OPTIONS'),env);
 assert.equal(rejected.status,204);
 assert.equal(rejected.headers.get('Access-Control-Allow-Origin'),null);
 const direct=await handle(request('/health',null),env);
 assert.equal(direct.status,200);
 assert.equal(direct.headers.get('Access-Control-Allow-Origin'),null);
});

test('comma-separated approved origins work without allowing arbitrary sites',async()=>{
 const extra='https://preview.example';
 const both={FRONTEND_ORIGIN:website+', '+extra+'/'};
 const valid=await handle(request('/health',extra),both);
 assert.equal(valid.headers.get('Access-Control-Allow-Origin'),extra);
 const invalid=await handle(request('/health','https://other.example'),both);
 assert.equal(invalid.headers.get('Access-Control-Allow-Origin'),null);
});

test('missing FRONTEND_ORIGIN never silently falls back to wildcard CORS',async()=>{
 const res=await handle(request('/api/catalog',website),{});
 assert.equal(res.headers.get('Access-Control-Allow-Origin'),null);
});

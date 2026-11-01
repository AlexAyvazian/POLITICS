import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../workers/politics-gateway.mjs';
const env={FRONTEND_ORIGIN:'https://politics-e5yt.onrender.com'};
test('keyless official Census boundary proxy uses correct 119th House and state legislative polygon layer ids',async()=>{
 for(const [layer,id] of [['house','5'],['stateSenate','8'],['stateHouse','9']]){
  let called=false;
  const fetcher=async url=>{
   const u=new URL(url);called=true;
   assert.equal(u.hostname,'tigerweb.geo.census.gov');
   assert.ok(u.pathname.endsWith('/'+id+'/query'));
   assert.equal(u.searchParams.get('where'),"STATE='06'");
   assert.equal(u.searchParams.get('returnGeometry'),'true');
   return new Response(JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[-120,36],[-119,36],[-119,35],[-120,36]]]},properties:{GEOID:'0605',BASENAME:'5'}}]}));
  };
  const resp=await handle(new Request('https://gateway.test/api/district-geometry?state=06&layer='+layer),env,{},fetcher);
  assert.equal(resp.status,200);assert.ok(called);
  const body=await resp.json();assert.equal(body.data.features[0].geometry.type,'Polygon');
 }
});
test('Census district gateway does not allow arbitrary upstream SSRF or geographic IDs',async()=>{
 for(const q of ['?state=foo&layer=house','?state=06&layer=anything','?state=06%27%20OR%201%3D1&layer=house']){
  const res=await handle(new Request('https://gateway.test/api/district-geometry'+q),env,{},async()=>{throw Error('upstream must not run')});
  assert.equal(res.status,400);
 }
});

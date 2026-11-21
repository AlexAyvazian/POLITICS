import test from 'node:test';
import assert from 'node:assert/strict';
import {handle,refreshMemberExtraBatch} from '../workers/politics-gateway.mjs';

const req=p=>new Request('https://example.workers.dev'+p);
const expiredJwt='eyJhbGciOiJub25lIn0.'+btoa(JSON.stringify({exp:1}))+'.x';

function fakeDb(roster){
 const writes=[];
 return {
  writes,
  prepare(sql){
   return {
    bind(...args){
     return {
      async first(){
       if(sql.includes('SELECT snapshot_json'))return {snapshot_json:JSON.stringify(roster)};
       return null;
      },
      async run(){writes.push(args);return {};}
     };
    }
   };
  }
 };
}
function roster(){
 const ids=Array.from({length:410},(_,i)=>String.fromCharCode(65+(i%26))+String(i).padStart(6,'0'));
 return {states:{CA:{house:ids.map(bioguide=>({bioguide})),senators:[]}}};
}

test('expired LobbyView JWTs are not advertised as configured',async()=>{
 const r=await handle(req('/api/catalog'),{LOBBYVIEW_API_KEY:expiredJwt,LOBBYVIEW_API_KEY_2:expiredJwt});
 const body=await r.json();
 assert.equal(body.providers.find(x=>x.id==='lobbyview').configured,0);
});

test('scheduled LobbyView enrichment pauses cleanly when every token is expired',async()=>{
 const store=fakeDb(roster()),env={COUNTY_DB:store,LOBBYVIEW_API_KEY:expiredJwt,LOBBYVIEW_API_KEY_2:expiredJwt};
 let calls=0;
 const out=await refreshMemberExtraBatch(env,'lobby',12,async()=>{calls++;return new Response('{}');},new Date('2026-11-21T08:00:00Z'));
 assert.equal(calls,0);
 assert.equal(out.attempted,0);
 assert.equal(out.failed,0);
 assert.equal(out.status,'token_refresh_required');
 assert.match(out.examples[0],/LobbyView/i);
});

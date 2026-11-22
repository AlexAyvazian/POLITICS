import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('LobbyView is completely removed from runtime, scheduler and member UI',()=>{
 const files=[
  'workers/politics-gateway.mjs',
  'workers/records-refresh.mjs',
  'workers/county-snapshot.mjs',
  'assets/js/records.js',
  'records.html'
 ];
 for(const path of files){
  const text=read(path);
  assert.doesNotMatch(text,/LobbyView|lobbyview|member_lobby/i,path+' must not depend on LobbyView');
 }
});

test('member lobbying replacement derives bill overlap from Congress.gov sponsorship and official LDA filings',()=>{
 const js=read('assets/js/records.js');
 const html=read('records.html');
 assert.match(js,/async function loadOfficialLobbyingOverlap/);
 assert.match(js,/state\.sponsorData/);
 assert.match(js,/\/api\/lda\?/);
 assert.match(js,/mode.*issue/);
 assert.match(js,/client\?\.name|client\.name/);
 assert.match(js,/registrant\?\.name|registrant\.name/);
 assert.match(js,/bill overlap/i);
 assert.match(js,/does not prove.*contact|does not establish.*contact/i);
 assert.match(html,/OFFICIAL LDA.*CONGRESS\.GOV/i);
 assert.match(html,/bill overlap/i);
});

test('records scheduler no longer allocates a LobbyView collection slot',()=>{
 const worker=read('workers/records-refresh.mjs');
 assert.doesNotMatch(worker,/lobby/i);
 assert.match(worker,/secondaryIndex%2/);
});

test('gateway catalog contains official LDA but no LobbyView provider',()=>{
 const gateway=read('workers/politics-gateway.mjs');
 assert.match(gateway,/lda:\['LDA_API_KEY'/);
 assert.doesNotMatch(gateway,/LOBBYVIEW_API_KEY|rest-api\.lobbyview\.org|activeLobbyViewTokens|refreshMemberLobby/);
});

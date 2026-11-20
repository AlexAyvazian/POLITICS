import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Lobbying tab exposes official LDA search separately from LobbyView research',()=>{
 const html=read('records.html'),js=read('assets/js/records.js'),css=read('assets/css/records-editorial.css');
 for(const id of ['ldaOfficialSearch','ldaSearchForm','ldaSearchMode','ldaSearchQuery','ldaSearchYear','ldaSearchResults','ldaBillSearches'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.ok(html.indexOf('id="ldaOfficialSearch"')>html.indexOf('id="profilePanelLobbying"'));
 assert.match(js,/async function runLdaSearch/);
 assert.match(js,/\/api\/lda\?/);
 assert.match(js,/renderLdaBillSearches/);
 assert.match(js,/does not prove.*contact/i);
 assert.match(css,/recordsLda/);
});


test('official LDA form has an explicit submit control and renders visible search errors instead of leaving the default message',()=>{
 const html=read('records.html'),js=read('assets/js/records.js');
 assert.match(html,/id="ldaSearchSubmit"/);
 assert.match(html,/id="ldaSearchStatus"/);
 assert.match(js,/function setLdaSearchStatus/);
 assert.match(js,/ldaSearchSubmit/);
 assert.match(js,/Official LDA search failed/);
 assert.match(js,/response\.status/);
});

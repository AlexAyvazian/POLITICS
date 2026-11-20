import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Congressional Records lobbying tab includes official LDA bill overlap separately from LobbyView',()=>{
 const html=read('records.html'),js=read('assets/js/records.js');
 assert.match(html,/id="officialLdaOverlap"/);
 assert.match(html,/id="officialLdaOverlapVisualization"/);
 assert.ok(html.indexOf('id="officialLdaOverlap"')>html.indexOf('id="profilePanelLobbying"'));
 assert.match(js,/assets\/data\/records\/lobbying\/lda-bill-index\.json/);
 assert.match(js,/function renderOfficialLdaOverlap/);
 assert.match(js,/not proof.*contact|does not identify.*contact/i);
 assert.match(js,/sponsor|cosponsor/i);
});

test('official LDA overlap does not merge filing amounts into campaign money',()=>{
 const js=read('assets/js/records.js');
 assert.match(js,/reportedAmount/);
 assert.match(js,/reportedAmountKind/);
 assert.doesNotMatch(js,/statCampaign[^\n]+reportedAmount/);
});

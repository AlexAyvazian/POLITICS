import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('no giant title, intro, profile totals or always-on walking toolbar obscure the corridor',()=>{
 const page=read('issues.html');
 assert.doesNotMatch(page,/class="issueTitleBlock"/);
 assert.doesNotMatch(page,/class="issueMovement"/);
 assert.doesNotMatch(page,/id="issuesTitle"/);
 assert.doesNotMatch(page,/Walk the gallery\. Select a politician/);
 assert.doesNotMatch(page,/>Issue <em>Stances/);
 assert.match(page,/id="issueToolsToggle"/);
 assert.match(page,/id="issueToolsPanel"[^>]*hidden/);
 assert.match(page,/id="issueSearchPanel"[^>]*hidden/);
 assert.match(page,/id="issueWalkForward"/);
 assert.match(page,/id="issueWalkBack"/);
 assert.match(page,/id="issueAutoWalk"/);
 assert.match(page,/class="unifiedTopNav"/);
 assert.match(page,/id="stage"/);
});
test('discreet drawer opens and closes from one icon, keyboard shortcuts and Escape',()=>{
 const code=read('assets/js/issue-stances.js');
 assert.match(code,/function setToolsOpen\(/);
 assert.match(code,/issueToolsToggle/);
 assert.match(code,/issueToolsPanel/);
 assert.match(code,/setToolsOpen\(false\)/);
 assert.match(code,/e\.key\s*===\s*'\/'/);
 assert.match(code,/e\.key\s*===\s*'Escape'/);
 assert.match(code,/setFinder\(/);
 assert.match(code,/gallery\?\.walkBy/);
});
test('Roman gallery uses round smooth white marble, no dull gray stone arches',()=>{
 const rome=read('galiyaara/js/roman-architecture.js');
 const corridor=read('galiyaara/js/gallery.js');
 assert.match(rome,/0xf[0-9a-f]{5}/i);
 assert.match(rome,/radialSegments|CylinderGeometry\(0\.2/);
 assert.match(rome,/flutedShaftGeometry/);
 assert.match(corridor,/TorusGeometry\(HALF_W/);
 assert.match(corridor,/0xf[0-9a-f]{5}/i);
 assert.doesNotMatch(rome,/color:\s*0x8b857d/);
 assert.doesNotMatch(rome,/color:\s*0xc8c0af/);
});
test('portrait pipeline localizes verified remote images before browser gallery uses them',()=>{
 const importer=read('scripts/update_issue_stances_portraits.py');
 const workflow=read('.github/workflows/refresh-issue-stances-portraits.yml');
 const app=read('assets/js/issue-stances.js');
 assert.match(importer,/def cache_photos\(/);
 assert.match(importer,/issue-portraits/);
 assert.match(importer,/\.webp/);
 assert.match(workflow,/Pillow/);
 assert.match(workflow,/git add assets\/img\/issue-portraits/);
 assert.match(app,/portraitLocalUrl/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Congressional Atlas uses County-like floating pill navigation and two-row inset toolbar',()=>{
 const html=read('congressional.html');
 const css=read('assets/css/congressional-chrome.css');
 assert.match(html,/class="atlasHeaderCenter"/);
 assert.match(html,/class="atlasHeaderShortcut"/);
 assert.match(html,/class="atlasHeaderRight"/);
 assert.match(html,/class="atlasFind atlasToolbarFields"/);
 assert.match(html,/assets\/css\/congressional-chrome\.css/);
 assert.match(css,/body\[data-view="congress"\] \.atlasHeader\s*\{/);
 assert.match(css,/border-radius:999px/);
 assert.match(css,/body\[data-view="congress"\] \.atlasMapShell\s*\{/);
 assert.match(css,/border-radius:28px/);
 assert.match(css,/body\[data-view="congress"\] \.atlasViewport\s*\{/);
 assert.match(css,/border-radius:24px/);
 assert.match(css,/body\[data-view="congress"\] \.atlasFind\s*\{/);
 assert.match(css,/body\[data-view="congress"\] \.atlasFind input\s*\{/);
 assert.match(css,/body\[data-view="congress"\] \.atlasStateBadge\s*\{/);
});
test('Remove three map zoom buttons, retaining trackpad/pinch pan and map selectors',()=>{
 const html=read('congressional.html'),js=read('assets/js/congressional-map.js');
 for(const id of ['congressZoomIn','congressZoomOut','congressZoomReset']){
  assert.doesNotMatch(html,new RegExp('id="'+id+'"'));
  assert.doesNotMatch(js,new RegExp("[$]\\('"+id+"'\\)"));
 }
 assert.doesNotMatch(html,/class="atlasMapActions"/);
 assert.match(js,/d3\.zoom\(\)/);
 assert.match(js,/svg\.call\(zoom\)/);
 assert.match(js,/congressBack/);
 assert.match(js,/districtMapLabel/);
 assert.match(html,/id="districtSelection"/);
 assert.match(html,/data-atlas-layer="stateSenate"/);
 assert.match(html,/id="atlasPartyLegend"/);
});
test('selection details are pinned to County Atlas card position rather than reserved zoom rail',()=>{
 const css=read('assets/css/congressional-chrome.css');
 assert.match(css,/body\[data-view="congress"\] \.atlasSelection\s*\{[^}]*top:14px/);
 assert.match(css,/body\[data-view="congress"\] \.atlasSelection\s*\{[^}]*right:14px/);
 assert.match(css,/body\[data-view="congress"\] \.atlasSelection\s*\{[^}]*bottom:auto/);
 assert.match(css,/body\[data-view="congress"\] \.atlasSelection:has\(/);
});
test('County Atlas and political fills remain unchanged by Congressional-only chrome',()=>{
 const county=read('index.html');
 const css=read('assets/css/congressional-chrome.css');
 assert.doesNotMatch(county,/congressional-chrome\.css/);
 assert.doesNotMatch(css,/#mapSvg|\.atlasFeature|data-party|stateSelectedBoundary/);
 assert.match(read('assets/css/congressional-map.css'),/#districtMap \.atlasFeature\[data-party="vacant"\]\{fill:#e9faff/);
});

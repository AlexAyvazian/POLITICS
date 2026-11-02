import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Healthcare atmosphere is shared by County and Congressional Atlas without importing Healthcare map colors',()=>{
 const county=read('index.html'),congress=read('congressional.html');
 const css=read('assets/css/healthcare-atmosphere.css');
 for(const html of [county,congress]){
  assert.match(html,/assets\/css\/healthcare-atmosphere\.css/);
  for(const n of ['one','two','three','four','five','six','seven'])
   assert.match(html,new RegExp('orb '+n+'[^"]*"', 'i'));
  assert.match(html,/class="cursorGlow"/);
 }
 assert.match(css,/body\[data-view="map"\]/);
 assert.match(css,/body\[data-view="congress"\]/);
 assert.match(css,/\.orb/);
 assert.match(css,/atlasAmbientPulse/);
 assert.match(css,/backdrop-filter/);
 assert.match(css,/prefers-reduced-motion/);
 assert.doesNotMatch(css,/#mapSvg\s+\.state|#mapSvg\s+\.county|\.atlasFeature\s*\{|--geo-fill|--geo-hover|--geo-glow/);
 assert.doesNotMatch(county,/assets\/css\/world\.css/);
 assert.doesNotMatch(congress,/assets\/css\/world\.css/);
});
test('Congressional cursor halo follows pointer without touching map controller',()=>{
 const congressional=read('congressional.html');
 const script=read('assets/js/atlas-atmosphere.js');
 assert.match(congressional,/assets\/js\/atlas-atmosphere\.js/);
 assert.match(script,/pointermove/);
 assert.match(script,/prefers-reduced-motion/);
 assert.doesNotMatch(read('assets/js/congressional-map.js'),/atlas-atmosphere/);
});
test('County state and county color logic stays independent and geographic',()=>{
 const county=read('index.html'),css=read('assets/css/politics.css');
 assert.match(county,/assets\/js\/geo-colors\.js/);
 assert.match(css,/#view-map #mapSvg \.state/);
 assert.match(css,/#view-map #mapSvg \.county/);
});

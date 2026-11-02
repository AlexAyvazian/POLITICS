import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('county national view has no instructional map overlay while state-specific labels remain',()=>{
 const map=read('assets/js/map.js');
 const css=read('assets/css/politics.css');
 assert.doesNotMatch(map,/U\.S\. map · select a state to explore its counties/);
 assert.match(map,/\$\('mapLabel'\)\.textContent='';/);
 assert.match(map,/state\.name\+' · state averages; select any county for local figures'/);
 assert.match(css,/#view-map \.mapLabel:empty\s*\{\s*display:\s*none/);
});
test('congressional legend contains exactly three public labels, no explanatory paragraph',()=>{
 const html=read('congressional.html');
 const legend=html.match(/<div id="atlasPartyLegend"[^>]*>([\s\S]*?)<\/div>/)?.[1];
 assert.ok(legend,'party legend exists');
 assert.deepEqual([...legend.matchAll(/<span class="atlasLegendPair">[^<]*<i[^>]*><\/i>\s*([^<]+)<\/span>/g)].map(x=>x[1].trim()),
  ['Democratic','Republican','Vacant']);
 assert.doesNotMatch(legend,/Other \/ split|Unverified|Current officeholders|Missing or unmatched|<small>/);
});
test('vacancies use icy white in map and swatch, without changing confirmed red/blue color values',()=>{
 const css=read('assets/css/congressional-map.css');
 assert.match(css,/#districtMap \.atlasFeature\[data-party="vacant"\]\s*\{[^}]*fill:\s*#e9faff/i);
 assert.match(css,/\.atlasPartySwatch\.vacant\s*\{\s*background:\s*#e9faff/i);
 assert.doesNotMatch(css,/#districtMap \.atlasFeature\[data-party="vacant"\][^}]*#c58d35/);
 assert.match(css,/#districtMap \.atlasFeature\[data-party="democratic"\]\{fill:#2466d3\}/);
 assert.match(css,/#districtMap \.atlasFeature\[data-party="republican"\]\{fill:#c43c49\}/);
});

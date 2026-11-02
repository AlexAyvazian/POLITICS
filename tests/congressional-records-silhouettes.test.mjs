import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('All 50 states and D.C. have their own accessible silhouette, not bare letter cards',()=>{
 const ctx={window:{}};
 vm.runInNewContext(read('assets/js/state-silhouettes.js'),ctx);
 const silhouettes=ctx.window.POLITICS_STATE_SILHOUETTES;
 assert.equal(Object.keys(silhouettes).length,51);
 for(const [code,shape] of Object.entries(silhouettes)){
  assert.match(code,/^[A-Z]{2}$/);
  assert.match(shape,/^M[\d.\s,L-]+Z/);
  assert.ok(shape.length>20,code+' should be a distinct geographic outline');
 }
 const ui=read('assets/js/records.js');
 assert.match(ui,/recordsStateGlyph/);
 assert.match(ui,/POLITICS_STATE_SILHOUETTES/);
 assert.doesNotMatch(ui,/COMING SOON|coming soon|CONTRIBUTIONS BY/i);
 const html=read('records.html');
 assert.match(html,/assets\/js\/state-silhouettes\.js/);
});
test('records screen offers within-page street-address identification for unknown districts',()=>{
 const html=read('records.html');
 for(const id of ['addressFinder','addressInput','findMyRep','districtLookupStatus','districtLookupResult'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/Not sure which district you live in/i);
 assert.match(html,/assets\/js\/records-address-model\.js/);
 const src=read('assets/js/records.js');
 assert.match(src,/geocoding\.geo\.census\.gov/);
 assert.match(src,/ACS2025_Current/);
 assert.match(src,/findMyRep/);
});
test('119th Congress address lookup never returns 120th future district or an unmatched state',()=>{
 const ctx={window:{}};
 vm.runInNewContext(read('assets/js/records-address-model.js'),ctx);
 const match=ctx.window.POLITICS_ADDRESS_MODEL;
 const data={result:{addressMatches:[{geographies:{
  'States':[{'STUSAB':'CO'}],
  '119th Congressional Districts':[{'CD119':'03','GEOID':'0803'}],
  '120th Congressional Districts':[{'CD120':'04','GEOID':'0804'}]
 }}]}};
 assert.equal(match.district(data,'CO'),3);
 assert.equal(match.district(data,'TX'),null);
 assert.equal(match.district({result:{addressMatches:[{geographies:{'120th Congressional Districts':[{'CD120':'04'}]}}]}},'CO'),null);
 assert.equal(match.district({result:{addressMatches:[]}},'CO'),null);
});

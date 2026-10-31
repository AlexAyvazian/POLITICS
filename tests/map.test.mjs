import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
function sandbox() {
  const ctx={window:{}};
  for (const path of ['assets/vendor/us-atlas-counties-albers-10m.js','assets/js/states.js','assets/js/geo-model.js']) vm.runInNewContext(read(path),ctx);
  return ctx.window;
}
test('original county map geometry is available, without directory data',()=>{
  const w=sandbox();
  assert.equal(w.GEO_STATES.length,51);
  assert.ok(w.US_ATLAS.objects.states.geometries.length>=51);
  assert.ok(w.US_ATLAS.objects.counties.geometries.length>=3100);
  assert.doesNotMatch(read('index.html'),/atlas-data|database-loader|govdir|directory\.css/i);
  assert.doesNotMatch(read('assets/js/map.js'),/\/api\/atlas|ATLAS_DATA|GovDirUI/);
});
test('deep links resolve to correct counties and reject mismatched states',()=>{
  const w=sandbox(), m=w.GEO_UTIL;
  const counties=new Map(w.US_ATLAS.objects.counties.geometries.map(c=>[String(c.id).padStart(5,'0'),c]));
  assert.equal(m.makeHash({abbr:'CA',fips:'06019'}),'#map/CA/06019');
  assert.deepEqual(JSON.parse(JSON.stringify(m.parseHash('#map/CA/06019',w.GEO_STATES,counties))),{abbr:'CA',fips:'06019'});
  assert.equal(m.parseHash('#map/CA/48001',w.GEO_STATES,counties).fips,null);
  assert.equal(m.parseHash('#directory/CA',w.GEO_STATES,counties).abbr,null);
});
test('state and county geographic searches work',()=>{
  const w=sandbox(), byFips=Object.fromEntries(w.GEO_STATES.map(s=>[s.fips,s]));
  const countyHits=w.GEO_UTIL.search('Fresno',w.GEO_STATES,w.US_ATLAS.objects.counties.geometries,byFips);
  assert.ok(countyHits.some(h=>h.fips==='06019'));
  const stateHits=w.GEO_UTIL.search('California',w.GEO_STATES,w.US_ATLAS.objects.counties.geometries,byFips);
  assert.ok(stateHits.some(h=>h.type==='state'&&h.abbr==='CA'));
});
test('state click, county click, keyboard, search and map navigation remain wired',()=>{
  const js=read('assets/js/map.js');
  for(const key of ['zoomState','selectState','selectCounty','renderSearch','hashchange','keydown','on(\'click\''])assert.ok(js.includes(key),'Missing '+key);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

function setup() {
  const ctx = {window: {}};
  vm.runInNewContext(read('assets/js/geo-colors.js'), ctx);
  vm.runInNewContext(read('assets/js/states.js'), ctx);
  vm.runInNewContext(read('assets/vendor/us-atlas-counties-albers-10m.js'), ctx);
  return ctx.window;
}

test('state colors are distinct and remain stable', () => {
  const w = setup(), colors = w.GEO_COLORS;
  const fills = w.GEO_STATES.map(s => colors.state(s.fips).fill);
  assert.equal(new Set(fills).size, 51);
  assert.equal(colors.state('06').fill, colors.state('06').fill);
  assert.notEqual(colors.state('06').fill, colors.state('12').fill);
});
test('county colors stay distinct and share the states hue', () => {
  const w=setup(),colors=w.GEO_COLORS;
  const all=w.US_ATLAS.objects.counties.geometries.map(c=>String(c.id).padStart(5,'0'));
  assert.equal(all.length,3142);
  for (const s of w.GEO_STATES) {
    const ids=all.filter(fips=>fips.startsWith(s.fips));
    const variants=ids.map(fips=>colors.county(s.fips,fips));
    assert.equal(new Set(variants.map(v=>v.fill)).size,ids.length,'Repeated county shade: '+s.name);
    assert.ok(variants.every(v=>v.hue===colors.state(s.fips).hue),'County hue mismatch: '+s.name);
  }
});
test('selected counties illuminate only their interiors; states keep border traces', () => {
  const js=read('assets/js/map.js'),css=read('assets/css/politics.css');
  assert.match(js,/countySelectedIllumination/);
  assert.match(js,/countyInnerLight/);
  assert.doesNotMatch(js,/countySelectedBoundary|countyLightTrace|countyOutlineBase/);
  assert.doesNotMatch(css,/countySelectedBoundary|countyLightTrace|countyOutlineBase/);
  assert.match(js,/stateSelectedBoundary/);
  assert.match(js,/stateLightTrace/);
  assert.match(css,/\.countyInnerLight/);
  assert.match(css,/stroke-width:\s*\.45/);
});
test('panels expose values instead of accordion categories',()=>{
  const js=read('assets/js/map.js');
  assert.doesNotMatch(js,/<details class="countyCategory"/);
  assert.match(js,/countyMetricSection/);
  assert.match(js,/metricGrid\(metrics\)/);
  assert.match(read('index.html'),/assets\/js\/geo-colors\.js/);
});
test('unnecessary legend copy remains absent',()=>{
  const js=read('assets/js/map.js'),css=read('assets/css/politics.css');
  assert.doesNotMatch(js,/State colors identify geography, not political parties/);
  assert.doesNotMatch(js,/Different shades: counties/);
  assert.match(js,/\$\('legend'\)\.hidden=true/);
  assert.match(css,/\.legend\[hidden\]\{display:none!important\}/);
});
test('four transfers preserve original Great Lakes colors exactly',()=>{
  const c=setup().GEO_COLORS;
  const expected={
    '56':'hsl(169 24% 48%)', // Wyoming = old Minnesota
    '16':'hsl(169 21% 59%)', // Idaho = old Michigan
    '30':'hsl(169 22% 56%)', // Montana = old Iowa
    '46':'hsl(169 26% 51%)'  // South Dakota = old Wisconsin
  };
  for (const [fips,fill] of Object.entries(expected))assert.equal(c.state(fips).fill,fill,fips);
});
test('North Dakota is Persian Green and former donors use the brown palette',()=>{
  const c=setup().GEO_COLORS;
  const expected={
    '38':'#00A693', // North Dakota — Persian Green
    '27':'#9F8170', // Minnesota — Beaver
    '26':'#A67B5B', // Michigan — Cafe au Lait
    '19':'#C19A6B', // Iowa — Wood Brown
    '55':'#9B7653'  // Wisconsin — Dirt
  };
  for(const [fips,hex] of Object.entries(expected))assert.equal(c.state(fips).fill,hex,fips);
});
test('the Northeast receives seven distinct shades of the former pink family',()=>{
  const c=setup().GEO_COLORS;
  const states=['36','09','44','25','50','33','23'];
  assert.equal(new Set(states.map(fips=>c.state(fips).fill)).size,7);
  for(const fips of states)assert.equal(c.state(fips).hue,294,fips);
  assert.equal(c.state('36').fill,'hsl(294 21% 48%)'); // old Virginia pink
  assert.equal(c.state('09').fill,'hsl(294 19% 56%)'); // old West Virginia pink
});
test('yellow state assignments use the six requested hex codes without alterations',()=>{
  const c=setup().GEO_COLORS;
  const expected={
   '54':'#F8DE7E', // West Virginia — Mellow Yellow
   '51':'#FFFF66', // Virginia — Unmellow Yellow
   '24':'#FFFD74', // Maryland — Butter
   '10':'#FFFE71', // Delaware — Pastel Yellow
   '34':'#EEE8AA', // New Jersey — Pale Goldenrod
   '42':'#F0E68C'  // Pennsylvania — Light Khaki
  };
  for(const [fips,hex] of Object.entries(expected))assert.equal(c.state(fips).fill,hex,fips);
});
test('unmentioned states preserve their existing map colors',()=>{
  const c=setup().GEO_COLORS;
  assert.equal(c.state('11').fill,'hsl(294 24% 45%)'); // DC
  assert.equal(c.state('08').fill,'hsl(137 28% 34%)'); // Colorado
  assert.equal(c.state('06').hue,207); // California
  assert.equal(c.state('12').hue,355); // Florida
  assert.equal(c.state('48').hue,91); // Texas
});

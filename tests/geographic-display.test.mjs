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
test('rebalanced Great Lakes browns alternate light and dark tones', () => {
 const c=setup().GEO_COLORS;
 const expected={
  '27':'#725648', // Minnesota dark tobacco
  '26':'#8C624B', // Michigan medium warm brown
  '19':'#C2A276', // Iowa lighter sand brown
  '55':'#B28F83'  // Wisconsin lighter rosewood brown
 };
 for(const [id,hex] of Object.entries(expected))assert.equal(c.state(id).fill,hex,id);
});
test('North Dakota, Colorado, Alaska and Hawaii use coordinated subdued colors',()=>{
 const c=setup().GEO_COLORS;
 const expected={'38':'#718F88','08':'#587966','02':'#697D9B','15':'#699FA6'};
 for(const [id,hex] of Object.entries(expected))assert.equal(c.state(id).fill,hex,id);
 // Keep both Alaska and Hawaii blue but different from the California, Oregon and Washington.
 const pacific=['02','15','06','41','53'].map(id=>c.state(id).fill);
 assert.equal(new Set(pacific).size,5);
});
test('the Northeast has visually distinct, coordinated mauve and rose shades',()=>{
 const c=setup().GEO_COLORS;
 const expected={
  '36':'#86627B', // New York
  '09':'#9F83B2', // Connecticut
  '44':'#79556F', // Rhode Island
  '25':'#C3A3A8', // Massachusetts
  '50':'#93799E', // Vermont
  '33':'#765A7B', // New Hampshire
  '23':'#B18BA2'  // Maine
 };
 for(const [id,hex] of Object.entries(expected))assert.equal(c.state(id).fill,hex,id);
});
test('formerly bright yellows are replaced by six varied muted earth yellows',()=>{
 const c=setup().GEO_COLORS;
 const expected={
  '54':'#A98D55', // West Virginia: ochre
  '51':'#B9B68A', // Virginia: olive wheat
  '24':'#D2BA79', // Maryland: antique wheat
  '10':'#96805A', // Delaware: bronze
  '34':'#C2AB7B', // New Jersey: golden tan
  '42':'#857B5B'  // Pennsylvania: dark brass
 };
 for(const [id,hex] of Object.entries(expected))assert.equal(c.state(id).fill,hex,id);
});

test('unmentioned states preserve their existing map colors',()=>{
  const c=setup().GEO_COLORS;
  assert.equal(c.state('11').fill,'hsl(294 24% 45%)'); // DC
  assert.equal(c.state('08').fill,'#587966'); // coordinated muted Colorado
  assert.equal(c.state('06').hue,207); // California
  assert.equal(c.state('12').hue,355); // Florida
  assert.equal(c.state('48').hue,91); // Texas
});

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
  '55':'#3C280D'  // Wisconsin Mocha
 };
 for(const [id,hex] of Object.entries(expected))assert.equal(c.state(id).fill,hex,id);
});
test('North Dakota, Colorado, Alaska and Hawaii use coordinated subdued colors',()=>{
 const c=setup().GEO_COLORS;
 const expected={'38':'#8A9A75','08':'#587966','02':'#9ACAF4','15':'#589BD5'};
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
  '50':'#AEA0B8', // Vermont
  '33':'#493F5E', // New Hampshire, Prince Charming
  '23':'#B18BA2'  // Maine
 };
 for(const [id,hex] of Object.entries(expected))assert.equal(c.state(id).fill,hex,id);
});
test('three color transfers use the exact previous colors, not reassigned destination colors',()=>{
 const c=setup().GEO_COLORS;
 assert.equal(c.state('17').fill,'#857B5B','Illinois receives previous Pennsylvania color');
 assert.equal(c.state('54').fill,'#B9B68A','West Virginia receives previous Virginia color');
 assert.equal(c.state('39').fill,'#C2AB7B','Ohio receives previous New Jersey color');
});
test('Mid-Atlantic uses five clearly separated original-style pinks',()=>{
 const c=setup().GEO_COLORS;
 const expected={
   '42':'#B996B6', // Pennsylvania, lighter dusty lavender-pink
   '10':'#CDA7BD', // Delaware, light pink
   '51':'#AA7E97', // Virginia, muted dusty pink
   '34':'#805474', // New Jersey, deeper plum pink
   '24':'#9B749B'  // Maryland, lilac-pink
 };
 for(const [id,hex] of Object.entries(expected))assert.equal(c.state(id).fill,hex,id);
 assert.equal(new Set(Object.keys(expected).map(id=>c.state(id).fill)).size,5);
 for(const id of Object.keys(expected))assert.ok(c.state(id).hue>=285&&c.state(id).hue<=343,'pink hue: '+id);
});
test('Missouri and Indiana distinguish themselves from Illinois and Ohio',()=>{
 const c=setup().GEO_COLORS;
 assert.equal(c.state('29').fill,'#86684F','Missouri: medium brown');
 assert.equal(c.state('18').fill,'#789486','Indiana: muted sage');
 assert.notEqual(c.state('17').fill,c.state('29').fill);
 assert.notEqual(c.state('39').fill,c.state('18').fill);
});

test('unmentioned states preserve their existing map colors',()=>{
  const c=setup().GEO_COLORS;
  assert.equal(c.state('11').fill,'hsl(294 24% 45%)'); // DC
  assert.equal(c.state('08').fill,'#587966'); // coordinated muted Colorado
  assert.equal(c.state('06').hue,207); // California
  assert.equal(c.state('12').hue,355); // Florida
  assert.equal(c.state('48').hue,91); // Texas
});

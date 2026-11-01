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
test('original Great Lakes colors are transferred to Wyoming, Idaho, Montana, and now North Dakota',()=>{
  const c=setup().GEO_COLORS;
  const expected={
    '56':'hsl(169 24% 48%)', // Wyoming = old Minnesota
    '16':'hsl(169 21% 59%)', // Idaho = old Michigan
    '30':'hsl(169 22% 56%)', // Montana = old Iowa
    '38':'hsl(169 26% 51%)'  // North Dakota = former South Dakota
  };
  for (const [fips,fill] of Object.entries(expected))assert.equal(c.state(fips).fill,fill,fips);
});
test('Great Lakes keeps distinct earth browns with softened Mocha for Wisconsin', () => {
 const c=setup().GEO_COLORS;
 const expected={
  '27':'#725648', // Minnesota dark tobacco
  '26':'#8C624B', // Michigan medium warm brown
  '19':'#C2A276', // Iowa lighter sand brown
  '55':'#74543D'  // Wisconsin: softened Mocha, same brown family
 };
 for(const [id,hex] of Object.entries(expected))assert.equal(c.state(id).fill,hex,id);
});
test('North Dakota, Colorado, Alaska and Hawaii use coordinated subdued colors',()=>{
 const c=setup().GEO_COLORS;
 const expected={'46':'#8A9A75','08':'#587966','02':'#9ACAF4','15':'#589BD5'};
 for(const [id,hex] of Object.entries(expected))assert.equal(c.state(id).fill,hex,id);
 // Keep both Alaska and Hawaii blue but different from the California, Oregon and Washington.
 const pacific=['02','15','06','41','53'].map(id=>c.state(id).fill);
 assert.equal(new Set(pacific).size,5);
});
test('Northeast purple group retains softened contrasts for NH, MA and RI',()=>{
 const c=setup().GEO_COLORS;
 const expected={
  '36':'#86627B', // New York
  '09':'#9F83B2', // Connecticut
  '44':'#A38DB8', // Rhode Island: softer lighter muted purple
  '25':'#8875A5', // Massachusetts: softened Ultra Violet
  '50':'#AEA0B8', // Vermont
  '33':'#6B607C', // New Hampshire: softened Prince Charming
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
test('Mid-Atlantic pinks have coordinated muted distinct shades',()=>{
 const c=setup().GEO_COLORS;
 const expected={
   '42':'#D9A6AE', // Pennsylvania: softened warm dusty pink
   '10':'#E2C0CB', // Delaware: soft light pastel pink
   '51':'#BC7791', // Virginia: muted medium rose
   '34':'#B978A4', // New Jersey: muted mauve-carnation
   '24':'#A9829D'  // Maryland: muted dusty lilac pink
 };
 for(const [id,hex] of Object.entries(expected))assert.equal(c.state(id).fill,hex,id);
 assert.equal(new Set(Object.keys(expected).map(id=>c.state(id).fill)).size,5);
 for(const id of Object.keys(expected))assert.ok(c.state(id).hue>=325&&c.state(id).hue<=359,'pink hue: '+id);
});
test('Missouri uses muted Pastel Orange and Indiana remains unchanged',()=>{
 const c=setup().GEO_COLORS;
 assert.equal(c.state('29').fill,'#D6A55C','Missouri muted from #FEBA4F');
 assert.equal(c.state('18').fill,'hsl(42 30% 51%)','Indiana original color');
});

test('unmentioned states preserve their existing map colors',()=>{
  const c=setup().GEO_COLORS;
  assert.equal(c.state('11').fill,'hsl(294 24% 45%)'); // DC
  assert.equal(c.state('08').fill,'#587966'); // coordinated muted Colorado
  assert.equal(c.state('06').hue,207); // California
  assert.equal(c.state('12').hue,355); // Florida
  assert.equal(c.state('48').hue,91); // Texas
});

test('North and South Dakota exchange their former exact colors',()=>{
 const c=setup().GEO_COLORS;
 assert.equal(c.state('38').fill,'hsl(169 26% 51%)','North Dakota gets former South Dakota');
 assert.equal(c.state('46').fill,'#8A9A75','South Dakota gets former North Dakota');
 assert.equal(c.county('38','38001').hue,c.state('38').hue);
 assert.equal(c.county('46','46003').hue,c.state('46').hue);
});

test('Kentucky and Tennessee are distinctly softened red family shades',()=>{
 const c=setup().GEO_COLORS;
 assert.equal(c.state('21').fill,'#B36A61','Kentucky softened muted Apple);
 assert.equal(c.state('47').fill,'#92504A','Tennessee softened muted Berry);
 assert.notEqual(c.state('21').fill,c.state('47').fill);
});

test('Arkansas, Louisiana, Mississippi and Alabama have complementary muted orange tones',()=>{
 const c=setup().GEO_COLORS;
 const expected={
   '05':'#98634B', // Arkansas: earthy orange brown
   '22':'#C39A7C', // Louisiana: light warm orange
   '28':'#B48261', // Mississippi: medium apricot brown
   '01':'#CF9D7B'  // Alabama: warm soft apricot
 };
 for(const [id,hex] of Object.entries(expected))assert.equal(c.state(id).fill,hex,id);
});
test('user-protected colors retain their exact approved values',()=>{
 const c=setup().GEO_COLORS;
 const expected={
   '29':'#D6A55C', // Missouri stays muted pastel orange
   '18':'hsl(42 30% 51%)', // Indiana is original untouched
   '17':'#857B5B', // Illinois preserved
   '54':'#B9B68A', // West Virginia preserved
   '39':'#C2AB7B', // Ohio preserved
   '38':'hsl(169 26% 51%)', // North Dakota preserved after swap
   '46':'#8A9A75' // South Dakota preserved after swap
 };
 for(const [id,hex] of Object.entries(expected))assert.equal(c.state(id).fill,hex,id);
});

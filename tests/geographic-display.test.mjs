import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

function setup() {
  const ctx = { window: {} };
  vm.runInNewContext(read('assets/js/geo-colors.js'), ctx);
  vm.runInNewContext(read('assets/js/states.js'), ctx);
  vm.runInNewContext(read('assets/vendor/us-atlas-counties-albers-10m.js'), ctx);
  return ctx.window;
}
test('every U.S. state uses a stable distinct color rather than uniform party blue', () => {
  const w = setup();
  const colors = w.GEO_COLORS;
  const fills = w.GEO_STATES.map(s => colors.state(s.fips).fill);
  assert.equal(new Set(fills).size, w.GEO_STATES.length);
  assert.ok(fills.some(s => !s.match(/^hsl\\(2[0-4][0-9] /)), 'Not every state should be blue');
  assert.equal(colors.state('06').fill, colors.state('06').fill);
});
test('county shades stay in their own state color family and remain distinct', () => {
  const w = setup();
  const colors = w.GEO_COLORS;
  const geos = w.US_ATLAS.objects.counties.geometries.filter(c => String(c.id).padStart(5,'0').startsWith('48'));
  const shades = geos.map(c => colors.county('48', String(c.id).padStart(5,'0')).fill);
  assert.equal(shades.length, 254);
  assert.equal(new Set(shades).size, shades.length);
  const stateHue = colors.state('48').hue;
  for (const fips of ['48001','48003','48201','48453']) {
    const county = colors.county('48', fips);
    assert.equal(county.hue, stateHue);
    assert.equal(county.dark, colors.state('48').dark);
  }
});
test('selected state keeps its boundary trace; county selection illuminates its interior only', () => {
  const js=read('assets/js/map.js');
  const css=read('assets/css/politics.css');
  assert.match(js,/stateSelectedBoundary/);
  assert.match(js,/stateLightTrace/);
  assert.match(js,/countySelectedIllumination/);
  assert.match(js,/countyInnerLight/);
  assert.doesNotMatch(js,/countySelectedBoundary|countyLightTrace|countyOutlineBase/);
  assert.doesNotMatch(css,/countySelectedBoundary|countyLightTrace|countyOutlineBase/);
  assert.match(css,/\.county\.active\s*\{/);
  assert.match(css,/\.countyInnerLight/);
  assert.match(css,/stroke-width:\s*\.45/);
});

test('state and county panels expose category metrics directly, not collapsed accordion lists', () => {
  const js = read('assets/js/map.js');
  assert.doesNotMatch(js, /<details class="countyCategory"/);
  assert.match(js, /countyMetricSection/);
  assert.match(js, /metricGrid\\(metrics\\)/);
  assert.match(read('index.html'), /assets\\/js\\/geo-colors\\.js/);
});

test('all 51 colors remain unique and every county stays inside its state color family', () => {
 const w=setup(),states=w.GEO_STATES,colors=w.GEO_COLORS;
 const fills=states.map(s=>colors.state(s.fips).fill);
 assert.equal(new Set(fills).size,51);
 const all=w.US_ATLAS.objects.counties.geometries.map(c=>String(c.id).padStart(5,'0'));
 for(const s of states){
  const base=colors.state(s.fips);
  const list=all.filter(fips=>fips.startsWith(s.fips));
  const countyColors=list.map(fips=>colors.county(s.fips,fips));
  assert.equal(new Set(countyColors.map(c=>c.fill)).size,list.length,'Repeated county shade: '+s.name);
  assert.ok(countyColors.every(c=>c.hue===base.hue),'County hue differs from state: '+s.name);
 }
});

test('unnecessary UI legend copy is removed from both map levels',()=>{
 const map=read('assets/js/map.js');
 const style=read('assets/css/politics.css');
 assert.doesNotMatch(map,/State colors identify geography, not political parties/);
 assert.doesNotMatch(map,/Different shades: counties/);
 assert.match(map,/\\$\\('legend'\\)\\.hidden=true/);
 assert.match(style,/\\.legend\\[hidden\\]\\{display:none!important\\}/);
});

test('copies the exact original Great Lakes state colors to the requested four states',()=>{
 const c=setup().GEO_COLORS;
 const destination={
  '56':'hsl(169 24% 48%)', // Wyoming <- old Minnesota
  '16':'hsl(169 21% 59%)', // Idaho <- old Michigan
  '30':'hsl(169 22% 56%)', // Montana <- old Iowa
  '46':'hsl(169 26% 51%)'  // South Dakota <- old Wisconsin
 };
 for(const [fips,fill] of Object.entries(destination)){
  assert.equal(c.state(fips).fill,fill,'Transferred original color: '+fips);
  assert.equal(c.county(fips,fips+'001').hue,c.state(fips).hue);
 }
});
test('sets North Dakota Persian Green and assigns the four specified source states brown shades',()=>{
 const c=setup().GEO_COLORS;
 const expected={
  '38':'#00A693', // Persian Green
  '27':'#9F8170', // Beaver (Minnesota)
  '26':'#A67B5B', // Cafe au Lait (Michigan)
  '19':'#C19A6B', // Wood Brown (Iowa)
  '55':'#9B7653'  // Dirt (Wisconsin)
 };
 for(const [fips,hex] of Object.entries(expected))assert.equal(c.state(fips).fill,hex,'Exact color for '+fips);
});
test('moves the previous pink Mid-Atlantic color family to all seven Northeast states',()=>{
 const c=setup().GEO_COLORS;
 for(const fips of ['36','09','44','25','50','33','23']){
  assert.equal(c.state(fips).hue,294,'Northeast state receives former pink family: '+fips);
  assert.equal(c.county(fips,fips+'001').hue,294);
 }
 assert.equal(new Set(['36','09','44','25','50','33','23'].map(id=>c.state(id).fill)).size,7);
});
test('uses the six yellows verbatim in the state order requested, while leaving DC unchanged',()=>{
 const c=setup().GEO_COLORS;
 const expected={
  '54':'#F8DE7E', // West Virginia: Mellow Yellow
  '51':'#FFFF66', // Virginia: Unmellow Yellow
  '24':'#FFFD74', // Maryland: Butter
  '10':'#FFFE71', // Delaware: Pastel Yellow
  '34':'#EEE8AA', // New Jersey: Pale Goldenrod
  '42':'#F0E68C'  // Pennsylvania: Light Khaki
 };
 for(const [fips,hex] of Object.entries(expected)){
  assert.equal(c.state(fips).fill,hex,'Exact assigned yellow: '+fips);
  assert.equal(c.county(fips,fips+'001').hue,c.state(fips).hue);
 }
 assert.equal(c.state('11').fill,'hsl(294 24% 45%)');
});
test('does not alter the existing palette of unmentioned states',()=>{
 const c=setup().GEO_COLORS;
 for(const [fips,expectedHue] of [['06',207],['12',355],['48',91],['08',137]]){
  assert.equal(c.state(fips).hue,expectedHue,'Preserve previous hue for '+fips);
 }
});

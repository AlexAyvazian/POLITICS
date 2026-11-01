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

test('geographic families cover all 51 regions and keep both levels subdued', () => {
 const w=setup();
 const states=w.GEO_STATES;
 const fills=states.map(s=>w.GEO_COLORS.state(s.fips).fill);
 assert.equal(new Set(fills).size,51);
 for(const s of states){
  const color=w.GEO_COLORS.state(s.fips);
  assert.notEqual(color.family,undefined,'Missing palette assignment: '+s.name);
  assert.ok(Number(color.fill.match(/ ([\\d.]+)%/)[1])<=35,'State oversaturated: '+s.name);
 }
 const all=w.US_ATLAS.objects.counties.geometries.map(c=>String(c.id).padStart(5,'0'));
 for(const s of states){
  const list=all.filter(fips=>fips.startsWith(s.fips));
  const colors=list.map(fips=>w.GEO_COLORS.county(s.fips,fips));
  assert.equal(new Set(colors.map(c=>c.fill)).size,list.length,'Repeated county color within '+s.name);
  assert.ok(colors.every(c=>c.family===w.GEO_COLORS.state(s.fips).family),'County changed color family');
  assert.ok(colors.every(c=>Number(c.fill.match(/ ([\\d.]+)%/)[1])<=35),'Bright county in '+s.name);
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

test('rebalanced northern and northeastern colors use earthy tones while preserving other regions', () => {
 const w=setup(), color=w.GEO_COLORS;
 // Northwest browns; northern Dakotas softly golden; Northeast warm taupe, not Western blue.
 assert.equal(color.state('30').hue,35); // Montana
 assert.equal(color.state('16').hue,35); // Idaho
 assert.equal(color.state('38').hue,47); // North Dakota
 assert.equal(color.state('46').hue,47); // South Dakota
 assert.equal(color.state('23').hue,22); // Maine
 assert.equal(color.state('36').hue,22); // New York
 // Colorado is a separate dark hunter-green accent, with all its counties matching.
 assert.equal(color.state('08').hue,137);
 assert.ok(Number(color.state('08').fill.match(/ ([\\d.]+)%\\)$/)[1])<=36);
 assert.equal(color.county('08','08031').hue,137);
 // Previously approved regions remain untouched.
 assert.equal(color.state('06').hue,207); // California
 assert.equal(color.state('27').hue,169); // Minnesota
 assert.equal(color.state('48').hue,91);  // Texas
 assert.equal(color.state('12').hue,355); // Florida
});

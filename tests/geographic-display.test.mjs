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
test('geographic boundaries glow on the selected region, without rectangular highlights', () => {
  const js = read('assets/js/map.js');
  const css = read('assets/css/politics.css');
  assert.match(js, /countySelectedBoundary/);
  assert.match(js, /stateSelectedBoundary/);
  assert.match(css, /outline:none\\s*!important/);
  assert.match(css, /countyLightTrace/);
  assert.match(css, /--geo-dark/);
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

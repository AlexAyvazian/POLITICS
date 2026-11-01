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

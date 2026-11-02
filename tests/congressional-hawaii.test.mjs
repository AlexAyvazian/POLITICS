import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const scope={window:{}};
vm.runInNewContext(read('assets/js/congressional-model.js'),scope);
const model=scope.window.CONGRESSIONAL_MODEL;
const vendor={module:{exports:{}}};vendor.exports=vendor.module.exports;
vm.runInNewContext(read('assets/vendor/d3.min.js'),vendor);
const d3=vendor.module.exports;
const polyCount=f=>f.geometry.type==='Polygon'?1:f.geometry.coordinates.length;
const fc=(features)=>({type:'FeatureCollection',features});
test('Hawaii boundaries split into primary and Northwestern island views without losing any polygon',()=>{
 for(const layer of ['house','stateSenate','stateHouse']){
  const original=JSON.parse(read('assets/data/congressional/'+layer+'/15.geojson'));
  const before=JSON.stringify(original);
  const split=model.splitHawaiiIslands(model.rewindForD3(original));
  assert.ok(split.main.features.length>0,layer+' main islands');
  assert.ok(split.northwest.features.length>0,layer+' remote islands');
  const polygonCount=doc=>doc.features.reduce((n,f)=>n+polyCount(f),0);
  assert.equal(polygonCount(split.main)+polygonCount(split.northwest),polygonCount(original),layer+' every polygon accounted for');
  const ids=[...new Set([...split.main.features,...split.northwest.features].map(f=>f.properties.GEOID))];
  assert.deepEqual(ids.sort(),original.features.map(f=>f.properties.GEOID).sort(),layer+' retains all district GEOIDs');
  assert.equal(JSON.stringify(original),before,layer+' does not mutate cache');
  const mainBBox=d3.geoBounds(split.main);
  assert.ok(mainBBox[0][0]>-163,layer+' main view excludes far western atolls');
  assert.ok(mainBBox[1][1]<24,layer+' main view excludes Northwestern islands');
 }
});
test('Hawaii main islands have readable individual House districts, not tiny points or a screen-sized rectangle',()=>{
 const raw=JSON.parse(read('assets/data/congressional/house/15.geojson'));
 const {main,northwest}=model.splitHawaiiIslands(model.rewindForD3(raw));
 const w=1300,h=620;
 const p=d3.geoMercator().fitExtent([[100,60],[w-100,h-60]],main);
 const path=d3.geoPath(p);
 for(const f of main.features){
  assert.ok(path.area(f)>800,'main district '+f.properties.GEOID+' is visible');
  const b=path.bounds(f);
  assert.ok(b[0][0]>=0&&b[1][0]<=w&&b[0][1]>=0&&b[1][1]<=h);
 }
 const insetProjection=d3.geoMercator().fitExtent([[w-300,70],[w-34,205]],northwest);
 const insetPath=d3.geoPath(insetProjection);
 const ib=insetPath.bounds(northwest);
 assert.ok(ib[0][0]>w-310&&ib[1][0]<w-20&&ib[0][1]>55&&ib[1][1]<220);
});
test('Congressional SVG focus never draws a rectangular outline around the district bounding box',()=>{
 const css=read('assets/css/congressional-map.css');
 const js=read('assets/js/congressional-map.js');
 assert.match(css,/#districtMap\s+\.atlasFeature[^\{]*\{[^}]*outline:\s*(?:none|0)\s*!important/);
 assert.match(css,/#districtMap\s+\.atlasFeature:focus-visible[^\{]*\{[^}]*stroke:/);
 assert.match(js,/splitHawaiiIslands\(/);
 assert.match(js,/atlasHawaiiInset/);
 assert.match(js,/plot\(.*group/);
});

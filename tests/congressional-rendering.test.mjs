import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function loadGeometryTools(){
 const scope={window:{}};
 vm.runInNewContext(read('assets/js/congressional-model.js'),scope);
 const vendor={module:{exports:{}}};
 vendor.exports=vendor.module.exports;
 vm.runInNewContext(read('assets/vendor/d3.min.js'),vendor);
 return {model:scope.window.CONGRESSIONAL_MODEL,d3:vendor.module.exports};
}
test('actual cached North Dakota and Wyoming House districts render as centered at-large geography',()=>{
 const {model,d3}=loadGeometryTools();
 for(const state of ['38','56']){
  const data=JSON.parse(read('assets/data/congressional/house/'+state+'.geojson'));
  assert.equal(data.features.length,1,'one at-large House district per state');
  const normalized=model.rewindForD3(data);
  const projection=d3.geoMercator().fitExtent(model.districtViewport(1300,620,1),normalized);
  const path=d3.geoPath(projection),bounds=path.bounds(normalized),centroid=path.centroid(normalized.features[0]);
  assert.ok(bounds[0][0]>200&&bounds[1][0]<1100,'at-large district does not stretch to viewport edges');
  assert.ok(bounds[0][1]>65&&bounds[1][1]<555,'at-large district has vertical breathing room');
  assert.ok(centroid[0]>0&&centroid[0]<1300&&centroid[1]>0&&centroid[1]<620);
  assert.ok(path.area(normalized.features[0])>1000);
  assert.equal(model.districtDisplayName('house',model.districtCode(normalized.features[0].properties,'house')),'At-large');
 }
});
test('real Washington House district map shows 10 separate usable district paths',()=>{
 const {model,d3}=loadGeometryTools();
 const raw=JSON.parse(read('assets/data/congressional/house/53.geojson'));
 assert.equal(raw.features.length,10);
 const data=model.rewindForD3(raw);
 const path=d3.geoPath(d3.geoMercator().fitExtent(model.districtViewport(1300,620,10),data));
 const distinct=new Set();
 for(const feature of data.features){
  distinct.add(feature.properties.GEOID);
  const bounds=path.bounds(feature);
  assert.ok(bounds[0][0]>=0&&bounds[1][0]<=1300&&bounds[0][1]>=0&&bounds[1][1]<=620,'path stays in map');
  assert.ok(path.area(feature)>190,'district receives its own visible label');
 }
 assert.equal(distinct.size,10);
});

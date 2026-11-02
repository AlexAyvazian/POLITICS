import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
function setup(){const ctx={window:{}};vm.runInNewContext(read('assets/js/congressional-model.js'),ctx);return ctx.window.CONGRESSIONAL_MODEL;}
test('separate congressional atlas has selectable federal and both state legislative boundaries',()=>{
 const c=setup();assert.equal(c.LAYERS.house.id,5);assert.equal(c.LAYERS.stateSenate.id,8);assert.equal(c.LAYERS.stateHouse.id,9);
 for(const name of ['house','stateSenate','stateHouse']) {
  const url=new URL(c.censusUrl(name,'06'));
  assert.equal(url.hostname,'tigerweb.geo.census.gov');
  assert.equal(url.searchParams.get('where'),"STATE='06'");
  assert.equal(url.searchParams.get('returnGeometry'),'true');
  assert.equal(url.searchParams.get('f'),'geojson');
 }
 assert.equal(c.censusUrl('stateHouse','00'),null);
});
test('congressional district IDs and at-large state identifiers preserve leading zeros',()=>{
 const c=setup();
 assert.equal(c.districtCode({GEOID:'0605'},'house'),'05');
 assert.equal(c.districtCode({GEOID:'1000',CD119:'00'},'house'),'00');
 assert.equal(c.districtCode({GEOID:'06017'},'stateSenate'),'017');
 assert.equal(c.districtCode({GEOID:'06005'},'stateHouse'),'005');
 assert.equal(c.districtCode({GEOID:'bogus'},'house'),null);
});
test('district mapping only uses matching current term, no county-to-district inference',()=>{
 const c=setup();
 const person={name:{official_full:'Example Member'},id:{bioguide:'X000001'},terms:[
  {type:'rep',state:'CA',district:5,start:'2025-01-03',end:'2027-01-03',party:'Democrat'},
  {type:'rep',state:'CA',district:7,start:'2027-01-03',end:'2029-01-03',party:'Republican'}
 ]};
 assert.equal(c.federalMembers([person],'CA','house','05','2026-11-01')[0].party,'Democrat');
 assert.equal(c.federalMembers([person],'CA','house','07','2026-11-01').length,0);
 assert.equal(c.federalMembers([person],'NY','house','05','2026-11-01').length,0);
});

test('Census GeoJSON rings are normalized to D3 spherical winding without changing boundary coordinates',()=>{
 const c=setup();
 // The real Washington Census 119th district source has a CCW exterior.
 const ccw=[[-124,46],[-123,46],[-123,47],[-124,47],[-124,46]];
 const holeCW=[[-123.8,46.2],[-123.8,46.8],[-123.2,46.8],[-123.2,46.2],[-123.8,46.2]];
 const area=ring=>ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
 const geometry={type:'Polygon',coordinates:[ccw,holeCW]};
 const source={type:'FeatureCollection',features:[{type:'Feature',properties:{GEOID:'5303',STATE:'53'},geometry}]};
 const normalized=c.rewindForD3(source);
 assert.ok(area(normalized.features[0].geometry.coordinates[0])<0,'D3 must receive clockwise exterior');
 assert.ok(area(normalized.features[0].geometry.coordinates[1])>0,'D3 must receive counterclockwise holes');
 assert.equal(normalized.features[0].properties.GEOID,'5303');
 assert.deepEqual(source.features[0].geometry.coordinates[0],ccw,'source coordinates remain untouched');
 assert.deepEqual(c.rewindForD3(normalized).features[0].geometry.coordinates,normalized.features[0].geometry.coordinates,'rewinding is idempotent');
});
test('multipolygon congressional islands rewind each exterior and hole independently',()=>{
 const c=setup();
 const ccw1=[[0,0],[1,0],[1,1],[0,1],[0,0]],ccw2=[[2,2],[3,2],[3,3],[2,3],[2,2]];
 const source={type:'FeatureCollection',features:[{type:'Feature',properties:{GEOID:'5303',STATE:'53'},geometry:{type:'MultiPolygon',coordinates:[[ccw1],[ccw2]]}}]};
 const result=c.rewindForD3(source);
 for(const polygon of result.features[0].geometry.coordinates){
  const ring=polygon[0];let a=0;
  for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length];a+=p[0]*q[1]-q[0]*p[1];}
  assert.ok(a<0);
 }
});

test('D.C. delegate district remains distinct from state at-large district code',()=>{
 const c=setup();
 assert.equal(c.districtCode({GEOID:'1198'},'house'),'98');
 assert.equal(c.districtDisplayName('house','98'),'At-large delegate');
 assert.equal(c.districtDisplayName('house','00'),'At-large');
});
test('nonexistent State House or Senate chambers display an accurate empty-state message',()=>{
 const js=read('assets/js/congressional-map.js');
 assert.match(js,/data\.features\.length===0&&state/);
 assert.doesNotMatch(js,/!Array\.isArray\(data\.features\)\|\|!data\.features\.length/);
});

test('single at-large House district is shown in a restrained centered viewport',()=>{
 const c=setup();
 const one=c.districtViewport(1300,600,1);
 const many=c.districtViewport(1300,600,10);
 assert.ok(one[0][0]>many[0][0],'single district has more horizontal margin than many districts');
 assert.ok(one[0][1]>many[0][1],'single district has more vertical margin than many districts');
 assert.ok(one[1][0]<many[1][0]&&one[1][1]<many[1][1]);
 assert.deepEqual(Array.from(c.districtViewport(1300,600,1)[0]),Array.from(one[0]));
 assert.equal(c.districtDisplayName('house','00'),'At-large');
 assert.equal(c.districtDisplayName('house','05'),'District 5');
 assert.equal(c.districtDisplayName('stateSenate','005'),'District 5');
});
test('at-large states auto-select their sole district with an explicit geographic explanation',()=>{
 const script=read('assets/js/congressional-map.js');
 assert.match(script,/districtViewport\(/);
 assert.match(script,/features\.length===1/);
 assert.match(script,/No internal district boundaries/);
 assert.match(script,/selectFeature\(features\[0\]\)/);
 assert.match(script,/atlasDistrictLabel/);
});
test('congressional atlas is a distinct interactive map-only page',()=>{
 const html=read('congressional.html'),home=read('index.html'),js=read('assets/js/congressional-map.js');
 assert.match(html,/assets\/js\/congressional-map\.js/);
 assert.match(html,/assets\/css\/congressional-map\.css/);
 for(const id of ['districtMap','congressState','districtSelection','districtSearch','congressZoomIn','congressZoomOut','congressZoomReset'])
  assert.match(html,new RegExp('id="'+id+'"'));
 for(const name of ['house','stateSenate','stateHouse','senate','governor','president'])
  assert.match(html,new RegExp('data-atlas-layer="'+name+'"'));
 assert.match(home,/href="congressional\.html"/);
 assert.match(js,/POLITICS_CONGRESSIONAL_ATLAS/);
 assert.match(js,/congressional-atlas:selection/);
 assert.match(js,/model\.rewindForD3\(/,'map must normalize Census geometry before rendering');
 assert.match(js,/geoAlbersUsa/);
 assert.match(js,/zoom\(/);
 assert.doesNotMatch(html,/assets\/js\/map\.js|assets\/js\/congressional\.js|ncsl-control\.js|governors\.js/);
 assert.doesNotMatch(js,/POLITICS_NCSL|GOVERNORS_2026/);
});
test('county atlas source, colors and effects remain independent',()=>{
 const html=read('index.html'),css=read('assets/css/politics.css');
 assert.match(html,/assets\/js\/map\.js/);
 assert.match(html,/assets\/js\/geo-colors\.js/);
 assert.match(css,/statePerimeterOrbit 7\.4s/);
 assert.match(css,/countyInteriorPulse 3\.2s/);
});

test('state executive roster has all fifty verified NGA governor names with clear date',()=>{
 const ctx={window:{}};vm.runInNewContext(read('assets/js/governors.js'),ctx);
 const d=ctx.window.GOVERNORS_2026;
 assert.equal(Object.keys(d.states).length,50);
 assert.equal(d.states.CA,'Gavin Newsom');
 assert.equal(d.states.VA,'Abigail Spanberger');
 assert.equal(d.states.NJ,'Mikie Sherrill');
 assert.equal(d.asOf,'2026-11-01');
 assert.doesNotMatch(read('congressional.html'),/assets\/js\/governors\.js/);
 assert.match(read('assets/js/congressional.js'),/GOVERNORS_2026/);
});

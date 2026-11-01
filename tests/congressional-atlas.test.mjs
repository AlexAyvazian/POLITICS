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
test('congressional atlas is a separate HTML entrypoint linked from existing atlas',()=>{
 const html=read('congressional.html'),home=read('index.html');
 assert.match(html,/assets\/js\/congressional\.js/);
 assert.match(html,/assets\/js\/congressional-model\.js/);
 assert.match(html,/id="districtMap"/);
 assert.match(html,/id="districtLayer"/);
 assert.match(home,/href="congressional\.html"/);
 const js=read('assets/js/congressional.js');
 assert.match(js,/CONGRESSIONAL_MODEL/);
 assert.match(js,/POLITICS_NCSL/);
 assert.match(js,/119th Congress/);
 assert.match(js,/2024/);
 assert.doesNotMatch(js,/POLITICS_COUNTY_CACHE/);
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
 assert.match(read('congressional.html'),/assets\/js\/governors\.js/);
 assert.match(read('assets/js/congressional.js'),/GOVERNORS_2026/);
});

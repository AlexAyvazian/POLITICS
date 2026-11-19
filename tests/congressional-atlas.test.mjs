import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
function setup(){const ctx={window:{}};vm.runInNewContext(read('assets/js/congressional-model.js'),ctx);return ctx.window.CONGRESSIONAL_MODEL;}
test('separate congressional atlas has selectable federal and both state legislative boundaries',()=>{
 const c=setup();assert.equal(c.LAYERS.house.id,0);assert.equal(c.LAYERS.stateSenate.id,8);assert.equal(c.LAYERS.stateHouse.id,9);
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
 for(const id of ['districtMap','congressState','districtSelection','districtSearch','districtFind','congressBack','districtMapLabel'])
  assert.match(html,new RegExp('id="'+id+'"'));
 for(const name of ['house','stateSenate','stateHouse','senate','governor','president'])
  assert.match(html,new RegExp('data-atlas-layer="'+name+'"'));
 assert.match(home,/href="congressional\.html"/);
 assert.match(js,/POLITICS_CONGRESSIONAL_ATLAS/);
 assert.match(js,/congressional-atlas:selection/);
 assert.match(js,/model\.rewindForD3\(/,'map must normalize Census geometry before rendering');
 assert.match(js,/geoAlbersUsa/);
 assert.match(js,/zoom\(/);
 assert.doesNotMatch(html,/assets\/js\/map\.js|assets\/js\/congressional\.js/);
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
 assert.match(read('congressional.html'),/assets\/js\/governors\.js/);
 assert.match(read('assets/js/congressional.js'),/GOVERNORS_2026/);
});


test('statewide elected offices drill into county election results instead of painting one whole state',()=>{
 const js=read('assets/js/congressional-map.js');
 const html=read('congressional.html');
 assert.match(js,/senate:\{title:'U\.S\. Senate',type:'countyElection'/);
 assert.match(js,/governor:\{title:'Governors',type:'countyElection'/);
 assert.match(js,/president:\{title:'President',type:'countyElection'/);
 assert.match(js,/US_ATLAS\.objects\.counties/);
 assert.match(js,/function countyElectionMap/);
 assert.match(js,/countyElectionResult/);
 assert.match(js,/scope:'county'/);
 assert.match(html,/assets\/data\/elections\/ca-statewide\.js/);
});

test('statewide county maps use election winners rather than current officeholder party',()=>{
 const js=read('assets/js/congressional-map.js');
 const political=read('assets/js/congressional-political.js');
 assert.match(js,/data-election-party/);
 assert.match(js,/county winner/i);
 assert.doesNotMatch(political,/else if\(layer==='president'\)incumbentParty=model\.partyClass\('Republican'\)/);
 assert.doesNotMatch(political,/else if\(layer==='governor'\)incumbentParty=model\.partyClass\(NCSL/);
 assert.match(political,/scope==='county'\|\|scope==='electionDistrict'/);
 assert.match(political,/unit=scope==='electionDistrict'\?'House district':'County'/);
});

test('California statewide election cache distinguishes certified historical results from live 2026 canvass',()=>{
 const ctx={window:{}};
 vm.runInNewContext(read('assets/data/elections/ca-statewide.js'),ctx);
 vm.runInNewContext(read('assets/data/elections/ca-governor-2026.js'),ctx);
 const ca=ctx.window.STATEWIDE_ELECTION_RESULTS.states.CA;
 const governor=ctx.window.CA_GOVERNOR_2026_RESULTS;
 assert.equal(ca.president.electionDate,'2024-11-05');
 assert.equal(ca.president.status,'certified');
 assert.equal(ca.senate.electionDate,'2024-11-05');
 assert.equal(ca.senate.status,'certified');
 assert.equal(governor.electionDate,'2026-11-03');
 assert.ok(['pending','unofficial','certified'].includes(governor.status));
 assert.equal(Object.keys(ca.president.counties).length,58);
 assert.equal(Object.keys(ca.senate.counties).length,58);
 assert.ok([0,58].includes(Object.keys(governor.counties).length));
 assert.equal(ca.president.counties['06019'].party,'republican');
 assert.equal(ca.senate.counties['06019'].party,'republican');
});

test('statewide election map labels the election and county-result source instead of state geography',()=>{
 const js=read('assets/js/congressional-map.js');
 assert.match(js,/County results/);
 assert.match(js,/electionDate/);
 assert.match(js,/certified/i);
 assert.match(js,/unofficial/i);
 assert.match(js,/sourceUrl/);
});


test('statewide county-result layers use an election-result legend instead of a vacancy legend',()=>{
 const js=read('assets/js/congressional-map.js');
 assert.match(js,/Democratic '\+unit\+' winner/);
 assert.match(js,/Republican '\+unit\+' winner/);
 assert.match(js,/state==='AK'\?'House district':'county'/);
 assert.match(js,/Result unavailable/);
 assert.match(js,/function updateLegend/);
});


test('Alaska State Senate preserves letter districts A through T',()=>{
 const ctx={window:{}};
 vm.runInNewContext(read('assets/js/congressional-model.js'),ctx);
 vm.runInNewContext(read('assets/js/congressional-political-model.js'),ctx);
 const geo=JSON.parse(read('assets/data/congressional/stateSenate/02.geojson'));
 const model=ctx.window.CONGRESSIONAL_MODEL;
 const political=ctx.window.CONGRESSIONAL_POLITICAL_MODEL;
 const codes=new Set(geo.features.map(f=>model.districtCode(f.properties,'stateSenate')));
 assert.equal(codes.size,20);
 assert.ok(codes.has('A')&&codes.has('T'));
 assert.equal(model.districtDisplayName('stateSenate','A'),'District A');
 assert.equal(political.districtMarker('stateSenate','A'),'A');
});

test('Alaska letter districts join to current senator roster instead of coercing to zero',()=>{
 const ctx={window:{}};
 vm.runInNewContext(read('assets/js/congressional-political-model.js'),ctx);
 const model=ctx.window.CONGRESSIONAL_POLITICAL_MODEL;
 const snapshot={people:[
  {name:'Bert Stedman',party:'Republican',role:'Senator',district:'A'},
  {name:'Jesse Kiehl',party:'Democratic',role:'Senator',district:'B'}
 ]};
 assert.equal(model.stateMembers(snapshot,'stateSenate','A')[0].name,'Bert Stedman');
 assert.equal(model.stateDistrictParty(snapshot,'stateSenate','A'),'republican');
 assert.equal(model.stateDistrictParty(snapshot,'stateSenate','B'),'democratic');
});

test('Alaska legislative districts use an Alaska-centered projection instead of generic Mercator',()=>{
 const js=read('assets/js/congressional-map.js');
 assert.match(js,/function alaskaProjection/);
 assert.match(js,/state==='AK'\?alaskaProjection/);
 assert.match(js,/geoConicEqualArea/);
});

test('Alaska statewide election layers use House districts, not borough county-equivalents',()=>{
 const js=read('assets/js/congressional-map.js');
 assert.match(js,/function alaskaStatewideElectionMap/);
 assert.match(js,/state==='AK'/);
 assert.match(js,/stateHouse\/02\.geojson/);
 assert.match(js,/House district results/i);
 assert.doesNotMatch(js,/Alaska.*county results unavailable/i);
});


test('Alaska statewide election cache has all 40 House districts for Governor Senate and President',()=>{
 const ctx={window:{}};
 vm.runInNewContext(read('assets/data/elections/ak-statewide.js'),ctx);
 const ak=ctx.window.AK_STATEWIDE_ELECTION_RESULTS;
 assert.equal(Object.keys(ak.governor.districts).length,40);
 assert.equal(Object.keys(ak.senate.districts).length,40);
 assert.equal(Object.keys(ak.president.districts).length,40);
 assert.equal(ak.governor.geography,'stateHouseDistrict');
 assert.equal(ak.senate.geography,'stateHouseDistrict');
 assert.equal(ak.president.geography,'stateHouseDistrict');
 assert.equal(Object.values(ak.governor.districts).filter(x=>x.party==='democratic').length,32);
 assert.equal(Object.values(ak.senate.districts).filter(x=>x.party==='democratic').length,24);
});


test('Alaska election-result joins normalize zero-padded House district IDs',()=>{
 const c=setup();
 assert.equal(c.electionDistrictKey('001'),'1');
 assert.equal(c.electionDistrictKey('010'),'10');
 assert.equal(c.electionDistrictKey('040'),'40');
 assert.equal(c.electionDistrictKey('A'),'A');
});


test('national statewide maps color states instead of forcing every state unknown',()=>{
 const js=read('assets/js/congressional-map.js');
 const political=read('assets/js/congressional-political.js');
 assert.match(js,/function nationalStateParty/);
 assert.match(js,/US_PRESIDENT_2024_STATE_WINNERS/);
 assert.doesNotMatch(js,/if\(layers\[layer\]\.type==='countyElection'&&isState\)return 'unknown'/);
 assert.match(political,/layer==='governor'&&scope==='state'/);
 assert.match(political,/layer==='senate'&&scope==='state'/);
 assert.match(political,/incomingSenateParty\(state\)/);
});

test('national statewide legends describe state-level meaning while drilldowns keep local winner legend',()=>{
 const js=read('assets/js/congressional-map.js');
 assert.match(js,/Democratic 2024 state winner/);
 assert.match(js,/Republican 2024 state winner/);
 assert.match(js,/Democratic governor/);
 assert.match(js,/Republican governor/);
 assert.match(js,/Democratic delegation/);
 assert.match(js,/Republican delegation/);
 assert.match(js,/Split delegation/);
 assert.match(js,/Democratic '\+unit\+' winner/);
});

test('certified 2024 presidential state winner cache covers fifty states and DC',()=>{
 const ctx={window:{}};
 vm.runInNewContext(read('assets/data/elections/us-president-2024.js'),ctx);
 const data=ctx.window.US_PRESIDENT_2024_STATE_WINNERS;
 assert.equal(Object.keys(data.states).length,51);
 assert.equal(data.states.CA,'democratic');
 assert.equal(data.states.TX,'republican');
 assert.equal(data.states.ME,'democratic');
 assert.equal(data.states.NE,'republican');
 assert.equal(data.states.DC,'democratic');
 assert.equal(data.status,'certified');
 assert.equal(data.electionDate,'2024-11-05');
});

test('national statewide map labels describe current control or statewide election winner',()=>{
 const js=read('assets/js/congressional-map.js');
 assert.match(js,/Incoming U\.S\. Senate after 2026 election/);
 assert.match(js,/Governor after 2026 election/);
 assert.match(js,/2024 presidential statewide winner/);
 assert.match(js,/Select a state to drill into election results/);
});


test('post-election House atlas uses 120th Congress geography and 2026 election results',()=>{
 const js=read('assets/js/congressional-map.js');
 const html=read('congressional.html');
 assert.match(js,/120th Congress/);
 assert.match(js,/US_2026_ELECTION_RESULTS/);
 assert.match(js,/houseElectionResult/);
 assert.match(js,/2026 U\.S\. House election/);
 assert.match(html,/assets\/data\/elections\/us-2026\.js/);
 assert.match(html,/120th Congress/);
 assert.match(html,/TIGERweb\/Legislative\/MapServer/);
});

test('2026 national Senate and governor maps use election winners while preserving non-up states',()=>{
 const js=read('assets/js/congressional-map.js');
 const political=read('assets/js/congressional-political.js');
 assert.match(js,/US_2026_ELECTION_RESULTS\?\.\[which\]/);
 assert.match(political,/ELECTION\?\.senate/);
 assert.match(political,/ELECTION\?\.governor/);
 assert.match(political,/incomingSenators/);
 assert.match(political,/2026 election · 120th Congress/);
 assert.match(political,/Takes office Jan\. 3, 2027/);
});

test('120th House selection shows election result rather than mapping current 119th member onto redrawn geography',()=>{
 const political=read('assets/js/congressional-political.js');
 assert.match(political,/houseElectionResult/);
 assert.match(political,/Member-elect|2026 winner/);
 assert.doesNotMatch(political,/Current U\.S\. representative.*model\.house\(federal,state,s\.district\)/s);
});


test('published Congressional Atlas manifest is the regenerated 120th Congress House cache',()=>{
 const manifest=JSON.parse(read('assets/data/congressional/manifest.json'));
 assert.equal(manifest.mapVintage.house,'120th Congress (2026 election boundaries)');
 assert.match(manifest.source,/120th Congress House/);
 const total=Object.values(manifest.counts.house).reduce((sum,n)=>sum+n,0);
 assert.equal(total,435);
 assert.equal(manifest.counts.house['06'],52);
 assert.equal(manifest.counts.house['48'],38);
});

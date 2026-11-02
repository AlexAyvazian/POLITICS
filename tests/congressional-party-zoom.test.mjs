import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const context={window:{}};
vm.runInNewContext(read('assets/js/congressional-political-model.js'),context);
const model=context.window.CONGRESSIONAL_POLITICAL_MODEL;

test('specific cached incumbents color U.S. House districts blue or red, including at-large DC',()=>{
 const snapshot={states:{
  MT:{house:[{district:1,party:'Republican'},{district:2,party:'Democrat'}]},
  DC:{house:[{district:0,party:'Democrat'}]}
 }};
 assert.equal(model.houseParty(snapshot,'MT','01'),'republican');
 assert.equal(model.houseParty(snapshot,'MT','02'),'democratic');
 assert.equal(model.houseParty(snapshot,'MT','03'),'unknown','no record does not imply a party');
 assert.equal(model.houseParty(snapshot,'DC','98'),'democratic');
});
test('state legislature colors require a matched incumbent for that exact chamber and district',()=>{
 const sample={state:'MT',totalPeople:150,people:[
  {role:'Senator',district:'22',party:'Republican'},
  {role:'Representative',district:'22',party:'Democratic'},
  {role:'Senator',district:'23',party:'Independent'}
 ]};
 assert.equal(model.stateDistrictParty(sample,'stateSenate','022'),'republican');
 assert.equal(model.stateDistrictParty(sample,'stateHouse','022'),'democratic');
 assert.equal(model.stateDistrictParty(sample,'stateSenate','023'),'other');
 assert.equal(model.stateDistrictParty(sample,'stateSenate','027'),'unknown');
 assert.equal(model.stateDistrictParty(null,'stateSenate','022'),'unknown');
});
test('senate statewide party is labeled split when both members belong to different parties',()=>{
 const d={states:{ME:{senators:[{party:'Republican'},{party:'Independent'}]},
  WA:{senators:[{party:'Democrat'},{party:'Democrat'}]},HI:{senators:[{party:'Democratic'}]}}};
 assert.equal(model.senateParty(d,'ME'),'split');
 assert.equal(model.senateParty(d,'WA'),'democratic');
 assert.equal(model.senateParty(d,'HI'),'unknown','one record must not impersonate both senators');
});
test('political party synonyms classify without treating unknown or missing values as Republican',()=>{
 for(const p of ['D','Democrat','Democratic','Democratic-Farmer-Labor'])assert.equal(model.partyClass(p),'democratic');
 for(const p of ['R','Republican'])assert.equal(model.partyClass(p),'republican');
 for(const p of ['Independent','Nonpartisan'])assert.equal(model.partyClass(p),'other');
 for(const p of [null,'','Not reported'])assert.equal(model.partyClass(p),'unknown');
});
test('zoom maintains constant 12px maximum screen font through an inverse label scale and uses compact number labels',()=>{
 const js=read('assets/js/congressional-map.js');
 assert.match(js,/function syncDistrictLabels\(/);
 assert.match(js,/scale\('\+\(1\s*\/\s*k\)\+\'\)/);
 assert.match(js,/on\('zoom',e=>\{/);
 assert.match(js,/\.text\(f=>model\.districtMarker\(layer,currentCode\(f\)\)\)/);
 assert.equal(model.districtMarker('stateSenate','022'),'22');
 assert.equal(model.districtMarker('house','00'),'AL');
 assert.equal(model.districtMarker('house','98'),'DC');
});
test('party colors are applied only on Congressional Atlas via political snapshot and paint API',()=>{
 const html=read('congressional.html'),css=read('assets/css/congressional-map.css');
 const map=read('assets/js/congressional-map.js'),political=read('assets/js/congressional-political.js');
 assert.match(css,/#districtMap \.atlasFeature\[data-party="democratic"\]/);
 assert.match(css,/#districtMap \.atlasFeature\[data-party="republican"\]/);
 assert.match(html,/id="atlasPartyLegend"/);
 assert.match(map,/setPartyResolver/);
 assert.match(political,/setPartyResolver/);
 assert.match(political,/houseParty\(/);
 assert.match(political,/stateDistrictParty\(/);
 assert.doesNotMatch(read('index.html'),/atlasPartyLegend|congressional-political-model/);
});

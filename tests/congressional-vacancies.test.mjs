import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
function load(){
 const w={};
 vm.runInNewContext(read('assets/js/congressional-political-model.js'),{window:w});
 vm.runInNewContext(read('assets/js/verified-vacancies.js'),{window:w});
 return {model:w.CONGRESSIONAL_POLITICAL_MODEL,vacancies:w.POLITICS_VERIFIED_VACANCIES};
}
test('confirmed Assembly and House vacant seats are distinct from unknown records',()=>{
 const {model,vacancies}=load();
 for(const [layer,state,district] of [['stateHouse','CA','003'],['house','TX','23'],['house','FL','20']]){
  const evidence=model.verifiedVacancy(vacancies,{layer,state,district},'2026-11-02');
  assert.equal(evidence.status,'vacant');
  assert.ok(evidence.sourceUrl.startsWith('https://'));
  assert.equal(model.districtPartyWithVacancies('unknown',evidence),'vacant');
 }
 assert.equal(model.verifiedVacancy(vacancies,{layer:'stateHouse',state:'CA',district:'022'},'2026-11-02'),null);
 assert.equal(model.districtPartyWithVacancies('unknown',null),'unknown');
});
test('verified vacancy records never override a verified current incumbent or remain active past review date',()=>{
 const {model,vacancies}=load();
 const evidence=model.verifiedVacancy(vacancies,{layer:'house',state:'TX',district:'23'},'2026-11-02');
 assert.equal(model.districtPartyWithVacancies('republican',evidence),'republican');
 assert.equal(model.verifiedVacancy(vacancies,{layer:'house',state:'TX',district:'23'},'2026-12-01'),null);
});
test('confirmed vacancies are rendered as distinct gold and displayed as vacant, not unverified',()=>{
 const css=read('assets/css/congressional-map.css');
 const html=read('congressional.html');
 const js=read('assets/js/congressional-political.js');
 assert.match(css,/#districtMap \.atlasFeature\[data-party="vacant"\]/);
 assert.match(html,/Vacant <\/span>|Vacant<\/span>/);
 assert.match(html,/assets\/js\/verified-vacancies\.js/);
 assert.match(js,/verifiedVacancy\(/);
 assert.match(js,/Verified vacancy|Vacant — no current officeholder/);
});

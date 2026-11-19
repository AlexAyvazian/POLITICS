import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {countrySummary,selectedPrincipalRecords,verifiedSpending,documentGroup,documentsForGroup} from '../assets/js/foreign-influence-model.mjs';

test('FARA country summary never presents registry counts as spending',()=>{
 const summary={countries:{SG:{principals:17,activePrincipals:9,registrants:5,financialStatus:'not_extracted',verifiedDisbursementsUsd:null}}};
 const result=countrySummary(summary,'SG');
 assert.equal(result.principals,17);
 assert.equal(result.registrants,5);
 assert.equal(result.disbursements,'Not yet verified');
 assert.notEqual(result.disbursements,0);
});
test('foreign government payment is not inferred from a non-government foreign principal registration',()=>{
 const source={principals:[{principalName:'Enterprise Singapore',registrantName:'Consultants LLC',status:'active',
   documents:[{type:'Exhibit AB',url:'https://efile.fara.gov/docs/7794-Exhibit-AB-20261106-2.pdf',appliesTo:'named principal'}]}]};
 const records=selectedPrincipalRecords(source,'');
 assert.equal(records.length,1);
 assert.equal(records[0].principalName,'Enterprise Singapore');
 assert.equal(records[0].documents.length,1);
 assert.equal(records[0].foreignGovernmentPayment,undefined);
});
test('verified spending requires signed numeric amount and original document',()=>{
 assert.equal(verifiedSpending({verifiedDisbursementsUsd:null}).text,'Not yet verified');
 assert.equal(verifiedSpending({verifiedDisbursementsUsd:12345,spendingSourceUrl:null}).text,'Not yet verified');
 assert.equal(verifiedSpending({verifiedDisbursementsUsd:12345,spendingSourceUrl:'https://efile.fara.gov/docs/7794-Money-20261106.pdf'}).value,12345);
});

test('FARA filing categories make receipts and activities discoverable but do not infer amounts',()=>{
 const docs=[
  {type:'Supplemental Statement',url:'https://efile.fara.gov/docs/7000-Supplemental-Statement-20261001.pdf'},
  {type:'Exhibit AB',url:'https://efile.fara.gov/docs/7000-Exhibit-AB-20261001.pdf'},
  {type:'Informational Materials',url:'https://efile.fara.gov/docs/7000-Informational-20261001.pdf'},
  {type:'Short-Form',url:'https://efile.fara.gov/docs/7000-Short-Form-20261001.pdf'}
 ];
 assert.equal(documentGroup(docs[0]),'supplemental');
 assert.equal(documentGroup(docs[1]),'contracts');
 assert.equal(documentGroup(docs[2]),'communications');
 assert.equal(documentGroup(docs[3]),'other');
 assert.equal(documentsForGroup(docs,'supplemental').length,1);
 assert.equal(documentsForGroup(docs,'all').length,4);
 assert.equal(documentsForGroup(docs,'unknown').length,0);
});

test('country selection highlights on a geographic WORLD map rather than zooming to a country',()=>{
 const js=readFileSync(new URL('../assets/js/foreign-influence.js',import.meta.url),'utf8');
 assert.doesNotMatch(js,/projection\.fitExtent\([^;]+,feature\)/s);
 assert.match(js,/projection\.fitExtent\(\[\[14,14\],\[width-14,height-14\]\],\{type:'Sphere'\}\)/);
 assert.match(js,/selected\?\.iso2===featureCountry\(d\)\?\.iso2\?' selected'/);
});
test('selected country records appear before collapsed country navigation and long source note',()=>{
 const html=readFileSync(new URL('../foreign-influence.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../assets/css/foreign-influence.css',import.meta.url),'utf8');
 const js=readFileSync(new URL('../assets/js/foreign-influence.js',import.meta.url),'utf8');
 assert.ok(html.indexOf('class="facilitySection"')<html.indexOf('id="countryChooser"'));
 assert.match(html,/<details id="countryChooser"/);
 assert.match(js,/\$\('countryChooser'\)\.open=false/);
 assert.match(js,/\$\('countryChooser'\)\.open=true/);
 assert.match(css,/\.foreignInfluence \.facilityList\{/);
 assert.match(html,/<details class="foreignSourceDetails"/);
});

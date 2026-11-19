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

test('foreign government payment is not inferred from a registration',()=>{
 const source={principals:[{principalName:'Enterprise Singapore',registrantName:'Consultants LLC',status:'active',
   documents:[{type:'Exhibit AB',url:'https://efile.fara.gov/docs/7794-Exhibit-AB-20261106-2.pdf',appliesTo:'named principal'}]}]};
 const records=selectedPrincipalRecords(source,'');
 assert.equal(records.length,1);
 assert.equal(records[0].principalName,'Enterprise Singapore');
 assert.equal(records[0].foreignGovernmentPayment,undefined);
});

test('verified spending still requires a source document',()=>{
 assert.equal(verifiedSpending({verifiedDisbursementsUsd:null}).text,'Not yet verified');
 assert.equal(verifiedSpending({verifiedDisbursementsUsd:12345,spendingSourceUrl:null}).text,'Not yet verified');
 assert.equal(verifiedSpending({verifiedDisbursementsUsd:12345,spendingSourceUrl:'https://efile.fara.gov/docs/7794-Money-20261106.pdf'}).value,12345);
});

test('filing categories remain data-model details rather than sidebar controls',()=>{
 const docs=[
  {type:'Supplemental Statement',url:'https://efile.fara.gov/docs/7000-Supplemental-Statement-20261001.pdf'},
  {type:'Exhibit AB',url:'https://efile.fara.gov/docs/7000-Exhibit-AB-20261001.pdf'}
 ];
 assert.equal(documentGroup(docs[0]),'supplemental');
 assert.equal(documentGroup(docs[1]),'contracts');
 assert.equal(documentsForGroup(docs,'all').length,2);
});

test('world map remains world-scale after country selection',()=>{
 const js=readFileSync(new URL('../assets/js/foreign-influence.js',import.meta.url),'utf8');
 assert.doesNotMatch(js,/projection\.fitExtent\([^;]+,feature\)/s);
 assert.match(js,/projection\.fitExtent\(\[\[14,14\],\[width-14,height-14\]\],\{type:'Sphere'\}\)/);
 assert.match(js,/selected\?\.iso2===featureCountry\(d\)\?\.iso2\?' selected'/);
});

test('country focus cannot draw rectangular browser outline over world map',()=>{
 const css=readFileSync(new URL('../assets/css/foreign-influence.css',import.meta.url),'utf8');
 assert.match(css,/\.foreignInfluence #mapSvg path\.country:focus\s*,\s*\.foreignInfluence #mapSvg path\.country:focus-visible\s*\{[^}]*outline:\s*none\s*!important/s);
});

test('foreign influence panel is a registry directory, not a filing explainer',()=>{
 const html=readFileSync(new URL('../foreign-influence.html',import.meta.url),'utf8');
 assert.match(html,/id="registrationDirectory"/);
 assert.match(html,/id="moneyRegistry"/);
 assert.match(html,/id="countryOverview"/);
 assert.equal((html.match(/id="search"/g)||[]).length,1);

 for(const forbidden of [
  'influenceThemeList','purposeList','politicalContactList','activityTimeline',
  'evidenceCoverage','historicalRecords','documentFilter','statusFilter','countryChooser'
 ]){
  assert.doesNotMatch(html,new RegExp('id="'+forbidden+'"'));
 }
 assert.doesNotMatch(html,/What this country is trying to influence/i);
 assert.doesNotMatch(html,/What they hired U\.S\. firms to do/i);
 assert.doesNotMatch(html,/Who was contacted/i);
 assert.doesNotMatch(html,/filing evidence/i);
});

test('registration directory exposes the fields the product is actually for',()=>{
 const js=readFileSync(new URL('../assets/js/foreign-influence.js',import.meta.url),'utf8');
 assert.match(js,/function renderRegistrationDirectory/);
 assert.match(js,/principalName/);
 assert.match(js,/registrantName/);
 assert.match(js,/registrationNumber/);
 assert.match(js,/registeredAt/);
 assert.match(js,/terminatedAt/);
 assert.match(js,/status/);
 assert.doesNotMatch(js,/function renderInfluenceThemes/);
 assert.doesNotMatch(js,/function renderPoliticalContacts/);
 assert.doesNotMatch(js,/function renderTimeline/);
});

test('verified money is displayed only at the registrant registration level',()=>{
 const js=readFileSync(new URL('../assets/js/foreign-influence.js',import.meta.url),'utf8');
 assert.match(js,/function renderMoneyRegistry/);
 assert.match(js,/verified_filing_totals/);
 assert.match(js,/totalReceivedUsd/);
 assert.match(js,/totalDisbursedUsd/);
 assert.match(js,/registrant-level/i);
 assert.doesNotMatch(js,/financialRows/);
 assert.doesNotMatch(js,/moneyBreakdownRow/);
 assert.doesNotMatch(js,/servicesSummary/);
 assert.doesNotMatch(js,/politicalContacts/);
});

test('selected country inspector stays wide enough for directory columns',()=>{
 const css=readFileSync(new URL('../assets/css/foreign-influence.css',import.meta.url),'utf8');
 assert.match(css,/\.foreignInfluence \.app\s*\{[^}]*grid-template-columns:[^;}]*minmax\(540px,/s);
 assert.match(css,/\.foreignInfluence \.registrationDirectory/);
 assert.match(css,/\.foreignInfluence \.moneyRegistry/);
});

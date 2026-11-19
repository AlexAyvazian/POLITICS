import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {countrySummary,selectedPrincipalRecords,verifiedSpending,documentGroup,documentsForGroup,classifyInfluenceText,evidenceCoverage} from '../assets/js/foreign-influence-model.mjs';

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

test('FARA filing categories remain available to the data model without becoming sidebar controls',()=>{
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
 assert.equal(documentsForGroup(docs,'all').length,4);
});

test('country selection highlights on a geographic WORLD map rather than zooming to a country',()=>{
 const js=readFileSync(new URL('../assets/js/foreign-influence.js',import.meta.url),'utf8');
 assert.doesNotMatch(js,/projection\.fitExtent\([^;]+,feature\)/s);
 assert.match(js,/projection\.fitExtent\(\[\[14,14\],\[width-14,height-14\]\],\{type:'Sphere'\}\)/);
 assert.match(js,/selected\?\.iso2===featureCountry\(d\)\?\.iso2\?' selected'/);
});

test('country focus cannot draw rectangular browser outline over world map',()=>{
 const css=readFileSync(new URL('../assets/css/foreign-influence.css',import.meta.url),'utf8');
 assert.match(css,/\.foreignInfluence #mapSvg path\.country:focus\s*,\s*\.foreignInfluence #mapSvg path\.country:focus-visible\s*\{[^}]*outline:\s*none\s*!important/s);
 assert.match(css,/\.foreignInfluence #mapSvg:focus\s*\{[^}]*outline:\s*none\s*!important/s);
});

test('foreign influence panel prioritizes country intelligence over filing filters and country chooser',()=>{
 const html=readFileSync(new URL('../foreign-influence.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/id="statusFilter"/);
 assert.doesNotMatch(html,/id="documentFilter"/);
 assert.doesNotMatch(html,/id="countryChooser"/);
 assert.doesNotMatch(html,/id="regionFilter"/);
 assert.match(html,/id="countryOverview"/);
 assert.match(html,/id="purposeList"/);
 assert.match(html,/id="relationshipList"/);
 assert.match(html,/id="activityTimeline"/);
 assert.match(html,/id="historicalRecords"/);
 assert.match(html,/id="coverageNote"/);
 assert.equal((html.match(/id="search"/g)||[]).length,1);
});

test('country intelligence separates historical records and removes repeated generic boilerplate cards',()=>{
 const js=readFileSync(new URL('../assets/js/foreign-influence.js',import.meta.url),'utf8');
 assert.match(js,/function splitHistoricalRecords/);
 assert.match(js,/function renderCountryOverview/);
 assert.match(js,/function renderRelationshipList/);
 assert.match(js,/function renderTimeline/);
 assert.match(js,/function renderHistoricalRecords/);
 assert.match(js,/async function renderExtractedInsights/);
 assert.doesNotMatch(js,/This U\.S\. registrant has filed a FARA record for the named foreign principal/);
 assert.doesNotMatch(js,/A verified amount has not yet been extracted\. This does not mean no money was received or spent/);
 assert.doesNotMatch(js,/No named officials or contacts have been verified from this record/);
 assert.doesNotMatch(js,/showCount/);
});

test('modern relationship view groups records by U.S. registrant instead of rendering endless principal cards',()=>{
 const js=readFileSync(new URL('../assets/js/foreign-influence.js',import.meta.url),'utf8');
 assert.match(js,/function relationshipGroups/);
 assert.match(js,/Foreign principals → U\.S\. registrants|relationshipFlow/);
 assert.match(js,/DOJ filing index ↗/);
 assert.doesNotMatch(js,/function renderPrincipals/);
 assert.doesNotMatch(js,/className='facility faraPrincipal'/);
});

test('selected country inspector is widened for readable intelligence sections',()=>{
 const css=readFileSync(new URL('../assets/css/foreign-influence.css',import.meta.url),'utf8');
 assert.match(css,/\.foreignInfluence \.app\s*\{[^}]*grid-template-columns:[^;}]*minmax\(520px,/s);
 assert.match(css,/\.foreignInfluence \.relationshipList/);
 assert.match(css,/\.foreignInfluence \.activityTimeline/);
 assert.match(css,/\.foreignInfluence \.historicalRecords/);
 assert.match(css,/\.foreignInfluence \.sidePanel\{[^}]*overflow-y:auto/s);
});


test('country inspector includes verified money evidence and named U.S. political contacts',()=>{
 const html=readFileSync(new URL('../foreign-influence.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../assets/js/foreign-influence.js',import.meta.url),'utf8');
 assert.match(html,/id="moneyEvidenceList"/);
 assert.match(html,/id="politicalContactList"/);
 assert.match(js,/filing-insights\/index\.json/);
 assert.match(js,/function renderMoneyEvidence/);
 assert.match(js,/function renderPoliticalContacts/);
 assert.match(js,/politicalContacts/);
 assert.match(js,/verified_filing_totals/);
});


test('money evidence explains what itemized filing money was for',()=>{
 const js=readFileSync(new URL('../assets/js/foreign-influence.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../assets/css/foreign-influence.css',import.meta.url),'utf8');
 assert.match(js,/financialRows/);
 assert.match(js,/moneyBreakdownRow/);
 assert.match(js,/counterparty/);
 assert.match(js,/purpose/);
 assert.match(css,/\.foreignInfluence \.moneyBreakdownRow/);
});


test('influence themes require explicit reviewed-text evidence',()=>{
 assert.deepEqual(classifyInfluenceText('Public relations, strategic messaging, media monitoring and press outreach'),['media_pr']);
 assert.deepEqual(classifyInfluenceText('Advocacy concerning OFAC sanctions and export-control licenses'),['sanctions_regulation']);
 assert.deepEqual(classifyInfluenceText('Tourism promotion, destination marketing and visitor information'),['tourism']);
 assert.deepEqual(classifyInfluenceText('Legal counsel concerning litigation and court proceedings'),['legal']);
 assert.deepEqual(classifyInfluenceText('General administrative support and scheduling'),[]);
 const mixed=classifyInfluenceText('Defense and national security cooperation involving military technology and energy security');
 assert.ok(mixed.includes('defense_security'));
 assert.ok(mixed.includes('energy_resources'));
 assert.ok(mixed.includes('technology_industry'));
});

test('country inspector summarizes supported influence themes with evidence',()=>{
 const html=readFileSync(new URL('../foreign-influence.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../assets/js/foreign-influence.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../assets/css/foreign-influence.css',import.meta.url),'utf8');
 assert.match(html,/id="influenceThemeList"/);
 assert.match(js,/function renderInfluenceThemes/);
 assert.match(js,/classifyInfluenceText/);
 assert.match(js,/themeEvidence/);
 assert.match(css,/\.foreignInfluence \.influenceThemeRow/);
});


test('evidence coverage counts distinct registrants and reviewed evidence without double counting principals',()=>{
 const records=[
  {registrationNumber:'100',principalName:'A'},
  {registrationNumber:'100',principalName:'B'},
  {registrationNumber:'200',principalName:'C'},
  {registrationNumber:'300',principalName:'D'}
 ];
 const index={registrations:[
  {registrationNumber:'100',hasServices:true,moneyStatus:'verified_filing_totals',politicalContactCount:2,financialRowCount:3},
  {registrationNumber:'200',hasServices:false,moneyStatus:'not_extracted',politicalContactCount:0,financialRowCount:0}
 ]};
 assert.deepEqual(evidenceCoverage(index,records),{
  totalRegistrations:3,reviewedRegistrations:2,purposeRegistrations:1,
  verifiedMoneyRegistrations:1,politicalContacts:2,itemizedFinancialRows:3
 });
});

test('country inspector shows evidence completeness instead of treating missing extraction as absence',()=>{
 const html=readFileSync(new URL('../foreign-influence.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../assets/js/foreign-influence.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../assets/css/foreign-influence.css',import.meta.url),'utf8');
 assert.match(html,/id="evidenceCoverage"/);
 assert.match(js,/function renderEvidenceCoverage/);
 assert.match(js,/reviewedRegistrations/);
 assert.match(js,/Missing extraction is not evidence of no activity/);
 assert.match(css,/\.foreignInfluence \.evidenceCoverage/);
});

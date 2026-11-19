import test from 'node:test';
import assert from 'node:assert/strict';
import {countrySummary,selectedPrincipalRecords,verifiedSpending} from '../assets/js/foreign-influence-model.mjs';

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

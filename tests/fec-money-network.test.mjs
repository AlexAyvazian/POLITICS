import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFecMoneyRow,graphEvidence,selectBatchMembers} from '../workers/fec-money-network.mjs';

test('Schedule A receipts link only identified committees, not employer name guesses',()=>{
 const row={sub_id:'100001',committee_id:'C00000002',committee_name:'Recipient Campaign',
  contributor_id:'C00000001',contributor_name:'Example PAC',contribution_receipt_amount:10000,
  contribution_receipt_date:'2026-06-10',two_year_transaction_period:2026,image_number:'123456789012345678'};
 const edge=normalizeFecMoneyRow('schedule_a',row);
 assert.equal(edge.sourceCommitteeId,'C00000001');
 assert.equal(edge.recipientCommitteeId,'C00000002');
 assert.equal(edge.amountCents,1000000);
 assert.equal(edge.recordId,'schedule_a:100001');
 assert.equal(edge.sourceFeed,'schedule_a');
 assert.match(edge.sourceUrl,/fecimg/);
 assert.equal(normalizeFecMoneyRow('schedule_a',{...row,contributor_id:null,contributor_employer:'EXAMPLE LLC'}),null);
 assert.equal(normalizeFecMoneyRow('schedule_a',{...row,contribution_receipt_amount:-10000}),null);
});

test('Schedule B disbursements preserve direction, memo flag and original filing ID',()=>{
 const row={sub_id:'200001',committee_id:'C00000001',committee_name:'Example PAC',
  recipient_committee_id:'C00000003',recipient_name:'Third Party PAC',disbursement_amount:7000,
  disbursement_date:'2026-10-01',two_year_transaction_period:2026,memo_code:'X',original_sub_id:'195999'};
 const edge=normalizeFecMoneyRow('schedule_b',row);
 assert.equal(edge.sourceCommitteeId,'C00000001');
 assert.equal(edge.recipientCommitteeId,'C00000003');
 assert.equal(edge.memo,true);
 assert.equal(edge.originalSubId,'195999');
 assert.equal(edge.sourceFeed,'schedule_b');
 assert.equal(edge.amountCents,700000);
 assert.equal(normalizeFecMoneyRow('schedule_b',{...row,recipient_committee_id:''}),null);
});

test('evidence never sums A and B cross-filings as if they are separate dollars',()=>{
 const a=normalizeFecMoneyRow('schedule_a',{sub_id:'5',committee_id:'C00000002',contributor_id:'C00000001',contribution_receipt_amount:10000,contribution_receipt_date:'2026-05-11',two_year_transaction_period:2026});
 const b=normalizeFecMoneyRow('schedule_b',{sub_id:'9',committee_id:'C00000001',recipient_committee_id:'C00000002',disbursement_amount:10000,disbursement_date:'2026-05-11',two_year_transaction_period:2026});
 const result=graphEvidence('C00000002',[a,b]);
 assert.equal(result.records.length,2);
 assert.equal(result.summary.total,null);
 assert.equal(result.summary.caution.includes('not additive'),true);
});

test('every roster member is eligible for automatic ingestion without a named politician list',()=>{
 const roster={states:{CA:{house:[{bioguide:'A000001'},{bioguide:'B000001'}],senators:[{bioguide:'C000001'}]},NY:{house:[{bioguide:'D000001'}],senators:[]}}};
 const selected=selectBatchMembers(roster,new Set(['A000001','C000001']),2);
 assert.deepEqual(selected,['B000001','D000001']);
});

/* FARA records remain distinct from FEC donations and direct foreign-government
 * payments. No dollar amount is displayed unless supported by a linked financial
 * disclosure document. */
export const isIso2 = iso => /^[A-Z]{2}$/.test(String(iso||''));
export function countrySummary(data,iso){
 const row=data?.countries?.[iso]||{};
 return {principals:row.principals??null,active:row.activePrincipals??null,
  registrants:row.registrants??null,
  disbursements:verifiedSpending(row).text};
}
export function verifiedSpending(row){
 const value=row?.verifiedDisbursementsUsd;
 const link=row?.spendingSourceUrl;
 if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&
  /^https:\/\/efile\.fara\.gov\/docs\/[^?#]+\.pdf$/i.test(String(link||''))){
  return {text:new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value),
   value,source:link};
 }
 return {text:'Not yet verified',value:null,source:null};
}
export function selectedPrincipalRecords(country,search=''){
 const needle=String(search||'').trim().toLocaleLowerCase();
 return (Array.isArray(country?.principals)?country.principals:[]).filter(x=>
  !needle||[x.principalName,x.registrantName,x.registrationNumber].some(y=>String(y||'').toLocaleLowerCase().includes(needle)));
}
export function safeFaraDocument(url){
 return typeof url==='string'&&/^https:\/\/efile\.fara\.gov\/(?:docs\/[^?#]+\.pdf|api\/v1\/RegDocs\/json\/[0-9]+)$/i.test(url)?url:null;
}

/* Filing-type navigation: a supplemental statement may disclose receipts,
 * disbursements and activities. A link is NOT evidence that money was paid. */
export function documentGroup(doc){
 const t=String(doc?.type||'').toLowerCase();
 if(t.includes('supplemental'))return 'supplemental';
 if(t.includes('exhibit')||t.includes('agreement'))return 'contracts';
 if(t.includes('informational'))return 'communications';
 return 'other';
}
export function documentsForGroup(documents,group='all'){
 if(!Array.isArray(documents))return [];
 const filtered=documents.filter(doc=>safeFaraDocument(doc?.url));
 if(group==='all')return filtered;
 if(!['supplemental','contracts','communications','other'].includes(group))return [];
 return filtered.filter(doc=>documentGroup(doc)===group);
}

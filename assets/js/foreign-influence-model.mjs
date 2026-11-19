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


/* Influence themes are deterministic labels applied only when reviewed filing
 * text contains explicit topic language. They are navigation aids, not claims
 * about a country's overall policy or intent. */
export const INFLUENCE_THEMES=[
 {id:'trade_commerce',label:'Trade & commerce',description:'Trade, market access, investment, imports or exports.',
  patterns:[/\btrade\b/i,/\btariffs?\b/i,/\bmarket access\b/i,/\bimports?\b(?![- ]controls?\b)/i,/\bexports?\b(?![- ]controls?\b)/i,/\bcommercial\b/i,/\bcommerce\b/i,/\binvestment\b/i]},
 {id:'sanctions_regulation',label:'Sanctions & regulation',description:'Sanctions, OFAC, export controls, licenses or regulatory policy.',
  patterns:[/\bsanctions?\b/i,/\bOFAC\b/i,/\bexport controls?\b/i,/\bregulat(?:ion|ory|ions)\b/i,/\blicen[cs](?:e|es|ing)\b/i]},
 {id:'defense_security',label:'Defense & security',description:'Defense, national security, military or intelligence matters.',
  patterns:[/\bdefen[cs]e\b/i,/\bnational security\b/i,/\bmilitary\b/i,/\barmed forces?\b/i,/\bweapons?\b/i,/\bmissiles?\b/i,/\bintelligence\b/i,/\bNATO\b/i]},
 {id:'energy_resources',label:'Energy & resources',description:'Energy, oil, gas, petroleum, LNG, mining or critical minerals.',
  patterns:[/\benergy\b/i,/\boil\b/i,/\bnatural gas\b/i,/\bpetroleum\b/i,/\bLNG\b/i,/\bmining\b/i,/\bminerals?\b/i]},
 {id:'media_pr',label:'Media & public relations',description:'Public relations, media, communications, messaging or advertising.',
  patterns:[/\bpublic relations?\b/i,/\bmedia\b/i,/\bpress outreach\b/i,/\bcommunications?\b/i,/\bstrategic messaging\b/i,/\badvertis(?:ing|ement|ements)\b/i,/\binformational materials?\b/i]},
 {id:'tourism',label:'Tourism promotion',description:'Tourism, destination marketing or visitor promotion.',
  patterns:[/\btourism\b/i,/\btourist(?:s)?\b/i,/\bdestination marketing\b/i,/\bvisitor information\b/i,/\btravel promotion\b/i]},
 {id:'legal',label:'Legal representation',description:'Legal services, counsel, litigation or court proceedings.',
  patterns:[/\blegal services?\b/i,/\blegal counsel\b/i,/\blitigation\b/i,/\bcourt proceedings?\b/i,/\battorney\b/i]},
 {id:'diplomacy_relations',label:'Diplomacy & foreign relations',description:'Diplomatic, bilateral or U.S. foreign-relations activity.',
  patterns:[/\bdiplomatic\b/i,/\bbilateral\b/i,/\bforeign relations\b/i,/\bU\.?S\.?[- ](?:foreign )?relations\b/i,/\bembassy\b/i,/\bdiplomacy\b/i]},
 {id:'technology_industry',label:'Technology & industry',description:'Technology, semiconductors, aerospace, cyber or telecommunications.',
  patterns:[/\btechnology\b/i,/\bsemiconductors?\b/i,/\baerospace\b/i,/\bcyber(?:security)?\b/i,/\btelecommunications?\b/i,/\btelecom\b/i]},
 {id:'agriculture_food',label:'Agriculture & food',description:'Agriculture, livestock, food commodities or farming.',
  patterns:[/\bagricultur(?:e|al)\b/i,/\blivestock\b/i,/\bbeef\b/i,/\blamb\b/i,/\bcoffee\b/i,/\bfarming\b/i,/\bfood commodities\b/i]}
];

export function classifyInfluenceText(text){
 const value=String(text||'').trim();
 if(!value)return [];
 return INFLUENCE_THEMES.filter(theme=>theme.patterns.some(pattern=>pattern.test(value))).map(theme=>theme.id);
}


export function evidenceCoverage(index,records){
 const ids=new Set((Array.isArray(records)?records:[])
  .map(row=>String(row?.registrationNumber||'')).filter(id=>/^\d{1,6}$/.test(id)));
 const byId=new Map((Array.isArray(index?.registrations)?index.registrations:[])
  .map(row=>[String(row?.registrationNumber||''),row]).filter(([id])=>ids.has(id)));
 let purposeRegistrations=0,verifiedMoneyRegistrations=0,politicalContacts=0,itemizedFinancialRows=0;
 for(const row of byId.values()){
  if(row?.hasServices===true)purposeRegistrations++;
  if(row?.moneyStatus==='verified_filing_totals')verifiedMoneyRegistrations++;
  politicalContacts+=Number.isFinite(Number(row?.politicalContactCount))?Number(row.politicalContactCount):0;
  itemizedFinancialRows+=Number.isFinite(Number(row?.financialRowCount))?Number(row.financialRowCount):0;
 }
 return {
  totalRegistrations:ids.size,
  reviewedRegistrations:byId.size,
  purposeRegistrations,
  verifiedMoneyRegistrations,
  politicalContacts,
  itemizedFinancialRows
 };
}

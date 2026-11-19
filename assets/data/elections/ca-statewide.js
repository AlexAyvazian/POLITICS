/* Certified California statewide election county winners.
 * President and U.S. Senate: California Secretary of State 2024 General Election
 * Statement of Vote. These are election outcomes, not current-officeholder party.
 */
(function(root){
'use strict';
const counties={
 '06001':'Alameda','06003':'Alpine','06005':'Amador','06007':'Butte','06009':'Calaveras','06011':'Colusa',
 '06013':'Contra Costa','06015':'Del Norte','06017':'El Dorado','06019':'Fresno','06021':'Glenn','06023':'Humboldt',
 '06025':'Imperial','06027':'Inyo','06029':'Kern','06031':'Kings','06033':'Lake','06035':'Lassen',
 '06037':'Los Angeles','06039':'Madera','06041':'Marin','06043':'Mariposa','06045':'Mendocino','06047':'Merced',
 '06049':'Modoc','06051':'Mono','06053':'Monterey','06055':'Napa','06057':'Nevada','06059':'Orange',
 '06061':'Placer','06063':'Plumas','06065':'Riverside','06067':'Sacramento','06069':'San Benito','06071':'San Bernardino',
 '06073':'San Diego','06075':'San Francisco','06077':'San Joaquin','06079':'San Luis Obispo','06081':'San Mateo',
 '06083':'Santa Barbara','06085':'Santa Clara','06087':'Santa Cruz','06089':'Shasta','06091':'Sierra',
 '06093':'Siskiyou','06095':'Solano','06097':'Sonoma','06099':'Stanislaus','06101':'Sutter','06103':'Tehama',
 '06105':'Trinity','06107':'Tulare','06109':'Tuolumne','06111':'Ventura','06113':'Yolo','06115':'Yuba'
};
const all=Object.keys(counties);
function race({demWinnerCounties,demName,repName,electionDate,title,sourceUrl}){
 const blue=new Set(demWinnerCounties);
 const result={};
 for(const fips of all){
  const democratic=blue.has(fips);
  result[fips]={name:counties[fips],party:democratic?'democratic':'republican',
   winner:democratic?demName:repName,demName,repName};
 }
 return {title,electionDate,status:'certified',sourceUrl,counties:result,
  statewideParty:all.filter(x=>blue.has(x)).length? 'democratic':'unknown'};
}
const president=race({
 title:'President',electionDate:'2024-11-05',demName:'Kamala Harris',repName:'Donald Trump',
 sourceUrl:'https://elections.cdn.sos.ca.gov/sov/2024-general/sov/complete-sov.pdf',
 demWinnerCounties:[
  '06001','06003','06013','06023','06037','06041','06045','06051','06053','06055','06057','06059',
  '06067','06069','06073','06075','06079','06081','06083','06085','06087','06095','06097','06111','06113'
 ]
});
president.statewideParty='democratic';
const senate=race({
 title:'U.S. Senate',electionDate:'2024-11-05',demName:'Adam Schiff',repName:'Steve Garvey',
 sourceUrl:'https://elections.cdn.sos.ca.gov/sov/2024-general/sov/19-uss-ft.pdf',
 demWinnerCounties:[
  '06001','06003','06013','06023','06037','06041','06045','06051','06053','06055','06057',
  '06067','06069','06073','06075','06079','06081','06083','06085','06087','06095','06097','06111','06113'
 ]
});
senate.statewideParty='democratic';
root.STATEWIDE_ELECTION_RESULTS=Object.freeze({
 states:{CA:{president,senate}},
 source:'California Secretary of State'
});
})(typeof window!=='undefined'?window:globalThis);

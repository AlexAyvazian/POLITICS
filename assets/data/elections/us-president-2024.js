/* Certified 2024 presidential statewide winners.
 * Source: National Archives Electoral College certificates/results.
 * State outline color represents the statewide winner, not congressional-district
 * electoral-vote splits in Maine or Nebraska.
 */
(function(root){
'use strict';
const democratic=new Set(['CA','CO','CT','DE','DC','HI','IL','ME','MD','MA','MN','NH','NJ','NM','NY','OR','RI','VT','VA','WA']);
const states={};
for(const code of [
 'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA',
 'MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX',
 'UT','VT','VA','WA','WV','WI','WY'
]) states[code]=democratic.has(code)?'democratic':'republican';
root.US_PRESIDENT_2024_STATE_WINNERS=Object.freeze({
 electionDate:'2024-11-05',
 status:'certified',
 source:'National Archives — 2024 Electoral College Results',
 sourceUrl:'https://www.archives.gov/electoral-college/2024',
 states:Object.freeze(states)
});
})(typeof window!=='undefined'?window:globalThis);

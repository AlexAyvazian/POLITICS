/* National Governors Association public roster, checked 2026-11-01.
 * Static dated names, NOT an automatically refreshed election result.
 * Reverify after gubernatorial transitions. Source:
 * https://www.nga.org/governors/
 */
(function(root){
'use strict';
const list={
 AL:'Kay Ivey',AK:'Mike Dunleavy',AZ:'Katie Hobbs',AR:'Sarah Huckabee Sanders',CA:'Gavin Newsom',
 CO:'Jared Polis',CT:'Ned Lamont',DE:'Matt Meyer',FL:'Ron DeSantis',GA:'Brian Kemp',
 HI:'Josh Green',ID:'Brad Little',IL:'JB Pritzker',IN:'Mike Braun',IA:'Kim Reynolds',
 KS:'Laura Kelly',KY:'Andy Beshear',LA:'Jeff Landry',ME:'Janet Mills',MD:'Wes Moore',
 MA:'Maura Healey',MI:'Gretchen Whitmer',MN:'Tim Walz',MS:'Tate Reeves',MO:'Mike Kehoe',
 MT:'Greg Gianforte',NE:'Jim Pillen',NV:'Joe Lombardo',NH:'Kelly Ayotte',NJ:'Mikie Sherrill',
 NM:'Michelle Lujan Grisham',NY:'Kathy Hochul',NC:'Josh Stein',ND:'Kelly Armstrong',OH:'Mike DeWine',
 OK:'Kevin Stitt',OR:'Tina Kotek',PA:'Josh Shapiro',RI:'Dan McKee',SC:'Henry McMaster',
 SD:'Larry Rhoden',TN:'Bill Lee',TX:'Greg Abbott',UT:'Spencer Cox',VT:'Phil Scott',
 VA:'Abigail Spanberger',WA:'Bob Ferguson',WV:'Patrick Morrisey',WI:'Tony Evers',WY:'Mark Gordon'
};
root.GOVERNORS_2026=Object.freeze({asOf:'2026-11-01',source:'National Governors Association',
 sourceUrl:'https://www.nga.org/governors/',states:Object.freeze(list)});
})(typeof window!=='undefined'?window:globalThis);

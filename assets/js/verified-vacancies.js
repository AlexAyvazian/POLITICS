/* Explicitly verified open seats. Last checked against primary government sources
 * 2026-11-02. This short-lived overlay intentionally expires rather than
 * mislabeling an elected replacement as vacant. Update after the review date.
 * An unknown/unmatched district is NOT automatically a vacancy.
 */
(function(root){
'use strict';
root.POLITICS_VERIFIED_VACANCIES=Object.freeze({
 asOf:'2026-11-02',
 reviewBy:'2026-11-16',
 records:[
  {layer:'stateHouse',state:'CA',district:'003',status:'vacant',
   title:'California Assembly District 3 — vacant',
   detail:'The California State Assembly identifies the District 3 seat as vacant.',
   sourceName:'California State Assembly',
   sourceUrl:'https://www.assembly.ca.gov/assemblymembers/03'},
  {layer:'house',state:'TX',district:'23',status:'vacant',
   title:'Texas Congressional District 23 — vacant',
   detail:'Tony Gonzales resigned on April 14, 2026. The U.S. House Clerk lists the seat as vacant.',
   sourceName:'U.S. House Clerk',
   sourceUrl:'https://clerk.house.gov/members/TX23/vacancy'},
  {layer:'house',state:'FL',district:'20',status:'vacant',
   title:'Florida Congressional District 20 — vacant',
   detail:'The U.S. House Clerk lists District 20 as vacant after the April 21, 2026 resignation.',
   sourceName:'U.S. House Clerk',
   sourceUrl:'https://clerk.house.gov/Members/ViewVacancies'}
 ]
});
})(typeof window!=='undefined'?window:globalThis);

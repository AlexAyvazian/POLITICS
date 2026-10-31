/* State/county selection utilities; no contacts or directory dependencies. */
(function (root) {
  'use strict';
  function parseHash(hash, states, counties) {
    const parts = String(hash || '').replace(/^#/, '').split('/');
    const state = states.find(s => s.abbr === (parts[1] || '').toUpperCase());
    if (parts[0] !== 'map' || !state) return { abbr: null, fips: null };
    const code = parts[2];
    const fips = /^\d{5}$/.test(code || '') && code.startsWith(state.fips) && counties.has(code) ? code : null;
    return { abbr: state.abbr, fips };
  }
  function makeHash(selection) {
    return '#map' + (selection.abbr ? '/' + selection.abbr + (selection.fips ? '/' + selection.fips : '') : '');
  }
  function search(query, states, counties, stateByFips) {
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return [];
    const hits = [];
    for (const s of states) {
      if (s.name.toLowerCase().includes(q) || s.abbr.toLowerCase() === q)
        hits.push({type:'state',abbr:s.abbr,name:s.name});
    }
    for (const county of counties) {
      const fips = String(county.id).padStart(5,'0');
      const state = stateByFips[fips.slice(0,2)];
      if (!state) continue;
      const name = county.properties.name;
      const hay = (name+' County '+state.name+' '+state.abbr+' '+fips).toLowerCase();
      if (hay.includes(q)) hits.push({type:'county',fips,abbr:state.abbr,name,stateName:state.name});
      if (hits.length>=40) break;
    }
    return hits.slice(0,40);
  }
  root.GEO_UTIL={parseHash,makeHash,search};
})(typeof window!=='undefined'?window:globalThis);

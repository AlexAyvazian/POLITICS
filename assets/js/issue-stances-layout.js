/**
 * Corridor layout: political parties are on opposite walls, all candidates
 * are present, and independent/other parties occupy a distinct final section.
 * Geometry stays in the original Galiyaara renderer.
 */
export function classifyParty(party){
 const value=String(party||'').trim().toLowerCase().replace(/[_\s]+/g,' ');
 const dem=/(?:^|[^a-z])dem(?:$|[^a-z])|democrat|democratic|democratic-farmer-labor|dfl\b/.test(value);
 const rep=/(?:^|[^a-z])rep(?:$|[^a-z])|republican|(?:^|[^a-z])gop(?:$|[^a-z])/.test(value);
 if(dem&&rep)return 'other';
 if(dem)return 'democratic';
 if(rep)return 'republican';
 return 'other';
}

/**
 * The supplied ordering is kept within each party, so the closest photos are
 * still the ones chosen by the caller. Each bay can display two politicians,
 * one per wall. No member is dropped, regardless of the directory size.
 */
export function arrangeCorridor(people){
 const democrats=[],republicans=[],others=[];
 const input=Array.isArray(people)?people:[];
 for(const person of input){
  if(!person||!person.slug)continue;
  const wing=classifyParty(person.party);
  if(wing==='democratic')democrats.push(person);
  else if(wing==='republican')republicans.push(person);
  else others.push(person);
 }
 const positions=[];
 const mainBays=Math.max(democrats.length,republicans.length);
 for(let bay=0;bay<mainBays;bay++){
  if(democrats[bay])positions.push({...democrats[bay],side:-1,bay,wing:'democratic'});
  if(republicans[bay])positions.push({...republicans[bay],side:1,bay,wing:'republican'});
 }
 for(let i=0;i<others.length;i++){
  positions.push({...others[i],side:i%2?-1:1,bay:mainBays+Math.floor(i/2),wing:'other'});
 }
 return positions;
}

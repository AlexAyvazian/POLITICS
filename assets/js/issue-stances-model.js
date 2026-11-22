/* Normalizes Voterist public data for source-linked, non-scored issue sheets.
   Does not infer views from party, geography or missing data. */
export function safeImageUrl(value) {
 if(typeof value!=='string')return null;
 try{
  const url=new URL(value);
  return ['http:','https:'].includes(url.protocol)?url.toString():null;
 }catch{return null;}
}
const text=(v,max=500)=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,max):'';
const first=(...values)=>values.map(x=>text(x)).find(Boolean)||'';
const slugOk=v=>typeof v==='string'&&/^[a-z0-9](?:[a-z0-9-]{0,120}[a-z0-9])?$/.test(v);
const imageFrom=obj=>safeImageUrl(obj?.photoUrl||obj?.portraitUrl||obj?.imageUrl||obj?.photo||obj?.headshotUrl||obj?.image||obj?.candidate?.photoUrl||'');
function candidateFrom(value){
 const row=value?.candidate||value||{};
 const slug=first(value?.slug,row.slug);
 if(!slugOk(slug))return null;
 return {
  slug,
  name:first(row.name,row.fullName,row.candidateName,row.displayName,value?.name) || slug.replace(/-/g,' '),
  office:first(row.office,row.officeName,row.race?.office,row.raceName,row.position,row.ballotOffice),
  party:first(row.party,row.partyName,row.partyAffiliation),
  state:first(row.state,row.stateCode,row.jurisdiction?.state,row.stateAbbreviation),
  portrait:imageFrom(row)||imageFrom(value),
  published:row.published===true||value?.published===true
 };
}
export function normalizeDirectory(payload){
 const rows=Array.isArray(payload?.candidates)?payload.candidates:Array.isArray(payload?.data?.candidates)?payload.data.candidates:Array.isArray(payload)?payload:[];
 const seen=new Set();
 return rows.map(candidateFrom).filter(row=>{
  if(!row||seen.has(row.slug))return false;
  seen.add(row.slug);return true;
 });
}
function evidenceList(root,workspace,preview){
 return [
  ...(Array.isArray(workspace?.evidence)?workspace.evidence:[]),
  ...(Array.isArray(root?.evidence)?root.evidence:[]),
  ...(Array.isArray(preview?.evidence)?preview.evidence:[])
 ];
}
export function normalizeIssueSheet(payload,fallback={}){
 const root=payload?.data??payload??{};
 const workspace=root?.record?.workspace||root?.workspace||null;
 const preview=root?.preview||{};
 const raw=workspace||preview;
 const name=first(raw?.candidateName,raw?.name,root?.candidate?.name,root?.candidate?.fullName,fallback.name)||'Candidate';
 const published=!!workspace;
 const rows=Array.isArray(raw?.positions)?raw.positions:Array.isArray(raw?.policyPositions)?raw.policyPositions:[];
 const evidence=evidenceList(root,workspace,preview);
 const sources=new Map(evidence.filter(item=>item&&item.id!==undefined).map(item=>[String(item.id),item]));
 const positions=rows.map(row=>{
  const issue=first(row?.issue,row?.topic,row?.category);
  const statement=first(row?.statement,row?.position,row?.summary,row?.text);
  if(!issue||!statement)return null;
  const source=sources.get(String(row.sourceId??row.evidenceId??''))||null;
  return {
   issue:text(issue,90),
   statement:text(statement,1500),
   sourceUrl:safeImageUrl(source?.url||source?.sourceUrl||row?.sourceUrl||''),
   sourceLabel:text(source?.label||source?.title||'',160),
   sourceStatus:text(source?.status||'',70)
  };
 }).filter(Boolean);
 return {name,published,positions};
}
export function filterCandidates(entries,{query='',party='',state=''}={}){
 const needle=text(query,100).toLowerCase(),p=text(party,100).toLowerCase(),s=text(state,100).toLowerCase();
 return entries.filter(row=>(!p||row.party.toLowerCase()===p)&&(!s||row.state.toLowerCase()===s)&&(!needle||[row.name,row.office,row.party,row.state].join(' ').toLowerCase().includes(needle)));
}

/* Civic records: pure joins. Never infer a missing vote, affiliation, or donor. */
(function(root){
'use strict';
function members(roster){
 const list=[];
 for(const [state,entries] of Object.entries(roster?.states||{})){
  for(const p of entries?.house||[]){
   if(/^[A-Z][0-9]{6}$/.test(String(p.bioguide||'')))
    list.push({...p,state,chamber:'House'});
  }
  for(const p of entries?.senators||[]){
   if(/^[A-Z][0-9]{6}$/.test(String(p.bioguide||'')))
    list.push({...p,state,chamber:'Senate'});
  }
 }
 return list.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
function states(items){
 return (Array.isArray(items)?items:[])
  .filter(x=>x&&typeof x.abbr==='string'&&x.name)
  .slice().sort((a,b)=>a.name.localeCompare(b.name));
}
function delegation(all,state){
 const selected=(Array.isArray(all)?all:[]).filter(p=>p.state===state);
 const senate=selected.filter(p=>p.chamber==='Senate').sort((a,b)=>a.name.localeCompare(b.name));
 const house=selected.filter(p=>p.chamber==='House').sort((a,b)=>Number(a.district)-Number(b.district)||a.name.localeCompare(b.name));
 return {senate,house};
}
function getMember(all,id){return all.find(m=>m.bioguide===id)||null;}
function senateCast(vote,member){
 if(!vote?.members||!member?.name||!member?.state)return null;
 const surname=String(member.name).trim().split(/\s+/).at(-1).replace(/[^\p{L}'-]/gu,'').toLowerCase();
 const matches=vote.members.filter(m=>String(m.state).toUpperCase()===member.state.toUpperCase()
  &&String(m.lastName||'').toLowerCase().replace(/[^\p{L}'-]/gu,'')===surname);
 return matches.length===1?matches[0].cast:null;
}
function memberVotes(snapshot,member){
 if(!Array.isArray(snapshot?.votes)||!member)return [];
 // The per-member static Voteview cache is keyed by Bioguide and already
 // records each actual cast. Reject a wrong member file, don't guess.
 if(snapshot.bioguide){
  return snapshot.bioguide===member.bioguide&&snapshot.chamber===member.chamber?
    snapshot.votes.filter(v=>typeof v.cast==='string'&&v.cast&&Number.isInteger(v.roll))
     .slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.roll)-Number(a.roll)):[];
 }
 const results=[];
 for(const record of snapshot.votes){
  const cast=member.chamber==='House'?record.members?.[member.bioguide]:member.chamber==='Senate'?senateCast(record,member):null;
  if(typeof cast==='string'&&cast)results.push({...record,cast});
 }
 return results.sort((a,b)=>Number(b.year)-Number(a.year)||Number(b.roll)-Number(a.roll));
}
function countVotes(votes){
 const counts={Yea:0,Nay:0,Present:0,'Not Voting':0};
 for(const x of votes)if(Object.hasOwn(counts,x.cast))counts[x.cast]++;
 return counts;
}
function voteDistribution(votes){
 const result={yes:0,no:0,other:0,absent:0,total:0};
 for(const vote of Array.isArray(votes)?votes:[]){
  const cast=vote?.cast;
  if(['Yea','Aye','Paired Yea','Announced Yea'].includes(cast))result.yes++;
  else if(['Nay','No','Paired Nay','Announced Nay'].includes(cast))result.no++;
  else if(cast==='Present')result.other++;
  else if(cast==='Not Voting')result.absent++;
  else continue;
  result.total++;
 }
 return result;
}
function filterVotes(votes,query){
 const q=String(query||'').trim().toLowerCase();
 if(!q)return votes;
 return votes.filter(v=>[v.question,v.measure,v.result,v.date,String(v.roll),v.cast].join(' ').toLowerCase().includes(q));
}
root.POLITICS_RECORDS_MODEL=Object.freeze({members,states,delegation,getMember,senateCast,memberVotes,countVotes,voteDistribution,filterVotes});
})(typeof window!=='undefined'?window:globalThis);

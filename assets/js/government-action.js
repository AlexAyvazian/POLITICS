'use strict';
const GATEWAY='https://crimson-mud-d254.alxayvazian.workers.dev';
const $=id=>document.getElementById(id);
let active='register',requestId=0;
const CONFIG={
 register:{
  kicker:'FEDERAL REGISTER',title:'Rules, proposed rules and notices',
  explanation:'The Federal Register is the official daily publication for rules, proposed rules, notices, and presidential documents published by federal agencies.',
  endpoint:'federalregister',source:'Federal Register'
 },
 regulations:{
  kicker:'REGULATIONS.GOV',title:'Regulatory documents and dockets',
  explanation:'Regulations.gov publishes rulemaking documents, supporting material and other docket records. A document appearing here is not automatically a final rule.',
  endpoint:'regulations',source:'Regulations.gov'
 },
 govinfo:{
  kicker:'U.S. GOVERNMENT PUBLISHING OFFICE',title:'Official government publications',
  explanation:'GovInfo searches official publications and metadata from the Government Publishing Office. Enter a topic to search across current GovInfo content.',
  endpoint:'govinfo',source:'GovInfo'
 },
 congress:{
  kicker:'CONGRESS.GOV',title:'Latest federal legislation',
  explanation:'Congress.gov is the official source for federal legislative information. This view lists recently returned federal bills; a listed bill has not necessarily passed either chamber or become law.',
  endpoint:'congress',source:'Congress.gov'
 }
};
function dateLabel(value){
 if(!value)return 'Date not reported';
 const d=new Date(value);return Number.isNaN(d.valueOf())?String(value):d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
}
function text(value,max=500){return String(value??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function card({type,date,title,meta,description,url}){
 const el=document.createElement('article');el.className='governmentActionCard';
 const top=document.createElement('div');top.className='governmentActionTop';
 const badge=document.createElement('span');badge.className='governmentActionType';badge.textContent=type||'Official record';
 const when=document.createElement('span');when.className='governmentActionDate';when.textContent=dateLabel(date);top.append(badge,when);el.append(top);
 const h=document.createElement('h3');h.textContent=title||'Untitled government record';el.append(h);
 if(meta){const m=document.createElement('div');m.className='governmentActionMeta';m.textContent=meta;el.append(m);}
 if(description){const p=document.createElement('p');p.textContent=text(description,650);el.append(p);}
 if(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open official record ↗';el.append(a);}
 return el;
}
function renderRegister(payload){
 const rows=Array.isArray(payload?.data?.results)?payload.data.results:[];
 return rows.map(item=>card({
  type:item.type||'Federal Register',
  date:item.publication_date,title:item.title,
  meta:(item.agencies||[]).map(a=>a.name).filter(Boolean).join(' · '),
  description:item.abstract||item.excerpts,url:item.html_url
 }));
}
function renderRegulations(payload){
 const rows=Array.isArray(payload?.data?.data)?payload.data.data:[];
 return rows.map(item=>{const a=item?.attributes||{};return card({
  type:a.documentType||item.type||'Regulatory document',
  date:a.postedDate,title:a.title||item.id,
  meta:[a.agencyId,a.docketId].filter(Boolean).join(' · '),
  description:a.docAbstract||a.subject||'Regulatory document posted to Regulations.gov.',
  url:item.id?'https://www.regulations.gov/document/'+encodeURIComponent(item.id):null
 });});
}
function renderGovInfo(payload){
 const rows=Array.isArray(payload?.data?.results)?payload.data.results:[];
 return rows.map(item=>card({
  type:item.collectionCode||'Official publication',
  date:item.dateIssued||item.lastModified,title:item.title,
  meta:Array.isArray(item.governmentAuthor)?item.governmentAuthor.join(' · '):'U.S. Government Publishing Office',
  description:[item.packageId,item.granuleId].filter(Boolean).join(' · '),
  url:item.packageId?'https://www.govinfo.gov/app/details/'+encodeURIComponent(item.packageId)+(item.granuleId?'/'+encodeURIComponent(item.granuleId):''):null
 }));
}
function renderCongress(payload){
 const rows=Array.isArray(payload?.data?.bills)?payload.data.bills:[];
 return rows.map(item=>card({
  type:'Federal bill · '+[item.type,item.number].filter(Boolean).join(' '),
  date:item.updateDate||item.latestAction?.actionDate,title:item.title,
  meta:[item.congress?'Congress '+item.congress:null,item.latestAction?.text].filter(Boolean).join(' · '),
  description:'Federal bill record from Congress.gov. A returned bill is not necessarily enacted law.',
  url:typeof item.url==='string'?item.url:null
 }));
}
const RENDER={register:renderRegister,regulations:renderRegulations,govinfo:renderGovInfo,congress:renderCongress};
function empty(message){
 const p=document.createElement('div');p.className='governmentEmpty';p.textContent=message;$('governmentResults').replaceChildren(p);
}
async function load(query=''){
 const id=++requestId,conf=CONFIG[active],status=$('governmentStatus'),root=$('governmentResults');
 if(active==='govinfo'&&!query){
  status.textContent='GovInfo search is ready.';
  empty('Enter a topic above to search official GovInfo publications.');
  return;
 }
 status.textContent='Loading '+conf.source+' records…';root.replaceChildren();
 try{
  const params=new URLSearchParams({limit:'18'});if(query)params.set('q',query);
  const response=await fetch(GATEWAY+'/api/'+conf.endpoint+'?'+params.toString(),{headers:{Accept:'application/json'},credentials:'omit'});
  if(!response.ok)throw Error(conf.source+' HTTP '+response.status);
  const payload=await response.json();if(id!==requestId)return;
  const cards=RENDER[active](payload);
  status.textContent=(query?'Search results from ':'Latest records from ')+conf.source+' · '+cards.length+' shown';
  if(!cards.length){empty('No records were returned for this search. Try a broader term or another source.');return;}
  root.replaceChildren(...cards);
 }catch(error){
  if(id!==requestId)return;
  status.textContent=conf.source+' could not be loaded.';
  empty('This source is temporarily unavailable. No absence of records should be inferred from this error.');
 }
}
function activate(key){
 if(!CONFIG[key])key='register';active=key;
 document.querySelectorAll('[data-government-tab]').forEach(btn=>btn.setAttribute('aria-selected',String(btn.dataset.governmentTab===key)));
 $('governmentSourceKicker').textContent=CONFIG[key].kicker;$('governmentTitle').textContent=CONFIG[key].title;$('governmentExplanation').textContent=CONFIG[key].explanation;
 const q=$('governmentQuery');q.placeholder=key==='govinfo'?'Search official publications…':key==='congress'?'Optional: filters the returned latest bills…':'Search this government source…';
 load(key==='congress'?'':q.value.trim());
}
document.querySelectorAll('[data-government-tab]').forEach(btn=>btn.addEventListener('click',()=>activate(btn.dataset.governmentTab)));
$('governmentSearch').addEventListener('submit',event=>{event.preventDefault();load($('governmentQuery').value.trim());});
activate('register');

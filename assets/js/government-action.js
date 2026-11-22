'use strict';
const GATEWAY='https://crimson-mud-d254.alxayvazian.workers.dev';
const $=id=>document.getElementById(id);
let requestId=0,activeFilter='all',allActions=[],searchTerm='';

const clean=(value,max=900)=>String(value??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
function dateLabel(value){
 if(!value)return 'Date not reported';
 const d=new Date(value);
 return Number.isNaN(d.valueOf())?String(value):d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
}
function timeValue(value){
 const d=new Date(value||0);return Number.isNaN(d.valueOf())?0:d.valueOf();
}
function federalCategory(type=''){
 const t=String(type).toLowerCase();
 if(t.includes('proposed'))return 'proposed';
 if(t==='rule'||t.includes('final rule'))return 'final';
 if(t.includes('presidential'))return 'presidential';
 return 'other';
}
function federalStatus(type=''){
 const category=federalCategory(type);
 if(category==='proposed')return 'Proposed rule';
 if(category==='final')return 'Final rule';
 if(category==='presidential')return 'Presidential action';
 if(String(type).toLowerCase().includes('notice'))return 'Agency notice';
 return clean(type,80)||'Federal action';
}
function normalizeFederalRegister(payload){
 const rows=Array.isArray(payload?.data?.results)?payload.data.results:[];
 return rows.map(item=>({
  category:federalCategory(item.type),
  statusLabel:federalStatus(item.type),
  title:clean(item.title,360)||'Untitled federal action',
  whatHappened:clean(item.abstract||item.excerpts,950)||'The Federal Register entry does not provide a short abstract in this feed.',
  actor:[...new Set((item.agencies||[]).map(a=>clean(a?.name,100)).filter(Boolean))].join(' · ')||'Federal agency',
  date:item.publication_date||null,
  dateLabel:'Published',
  source:'Federal Register',
  sourceDetail:item.document_number?('Document '+item.document_number):'Official federal record',
  url:item.html_url||null
 }));
}
function congressStatus(item){
 const action=String(item?.latestAction?.text||'');
 if(/became (public|private) law|signed by president/i.test(action))return 'Enacted law';
 if(/passed (house|senate)|agreed to in (house|senate)/i.test(action))return 'Passed chamber';
 if(/referred to|committee/i.test(action))return 'In committee';
 if(/introduced|read twice/i.test(action))return 'Introduced';
 return 'Legislative action';
}
function congressUrl(item){
 const types={
  HR:'house-bill',S:'senate-bill',HJRES:'house-joint-resolution',SJRES:'senate-joint-resolution',
  HCONRES:'house-concurrent-resolution',SCONRES:'senate-concurrent-resolution',
  HRES:'house-resolution',SRES:'senate-resolution'
 };
 const type=types[String(item?.type||'').toUpperCase()];
 return type&&item?.congress&&item?.number
  ?'https://www.congress.gov/bill/'+item.congress+'th-congress/'+type+'/'+item.number
  :(typeof item?.url==='string'?item.url:null);
}
function normalizeCongress(payload){
 const rows=Array.isArray(payload?.data?.bills)?payload.data.bills:[];
 return rows.map(item=>({
  category:'legislation',
  statusLabel:congressStatus(item),
  title:clean(item.title,360)||([item.type,item.number].filter(Boolean).join(' ')||'Federal legislation'),
  whatHappened:item?.latestAction?.text?('Latest action: '+clean(item.latestAction.text,750)):'No latest-action text was returned by Congress.gov.',
  actor:[item.originChamber?item.originChamber+' of origin':null,item.congress?'Congress '+item.congress:null].filter(Boolean).join(' · ')||'U.S. Congress',
  date:item?.latestAction?.actionDate||item.updateDate||item.introducedDate||null,
  dateLabel:'Latest action',
  source:'Congress.gov',
  sourceDetail:[item.type,item.number].filter(Boolean).join(' ')||'Bill record',
  url:congressUrl(item)
 }));
}
function matchesSearch(item,q){
 if(!q)return true;
 const hay=[item.title,item.whatHappened,item.actor,item.statusLabel,item.source,item.sourceDetail].join(' ').toLowerCase();
 return hay.includes(q.toLowerCase());
}
function filteredActions(){
 return allActions.filter(item=>(activeFilter==='all'||item.category===activeFilter)&&matchesSearch(item,searchTerm));
}
function actionCard(item){
 const el=document.createElement('article');el.className='governmentActionCard '+item.category;
 const rail=document.createElement('div');rail.className='governmentActionRail';el.append(rail);

 const body=document.createElement('div');body.className='governmentActionBody';
 const top=document.createElement('div');top.className='governmentActionTop';
 const status=document.createElement('span');status.className='governmentActionType';status.textContent=item.statusLabel;
 const when=document.createElement('span');when.className='governmentActionDate';when.textContent=(item.dateLabel||'Date')+' · '+dateLabel(item.date);
 top.append(status,when);body.append(top);

 const h=document.createElement('h3');h.textContent=item.title;body.append(h);

 const what=document.createElement('div');what.className='governmentActionWhat';
 const label=document.createElement('span');label.textContent='WHAT HAPPENED';
 const p=document.createElement('p');p.textContent=item.whatHappened;
 what.append(label,p);body.append(what);

 const facts=document.createElement('div');facts.className='governmentActionFacts';
 const actor=document.createElement('div');actor.innerHTML='<span>WHO</span><strong></strong>';actor.querySelector('strong').textContent=item.actor;
 const source=document.createElement('div');source.innerHTML='<span>OFFICIAL SOURCE</span><strong></strong>';source.querySelector('strong').textContent=item.source+' · '+item.sourceDetail;
 facts.append(actor,source);body.append(facts);

 if(item.url){
  const a=document.createElement('a');a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open official record ↗';body.append(a);
 }
 el.append(body);return el;
}
function render(){
 const rows=filteredActions(),root=$('governmentResults');root.replaceChildren();
 $('actionCount').textContent=allActions.length.toLocaleString('en-US');
 $('finalCount').textContent=allActions.filter(x=>x.category==='final').length.toLocaleString('en-US');
 $('proposedCount').textContent=allActions.filter(x=>x.category==='proposed').length.toLocaleString('en-US');
 $('legislationCount').textContent=allActions.filter(x=>x.category==='legislation').length.toLocaleString('en-US');
 const titles={all:'All recent actions',final:'Final / effective actions',proposed:'Proposed / in-progress actions',presidential:'Presidential actions',legislation:'Current Congress legislation'};
 $('governmentFeedTitle').textContent=titles[activeFilter]||titles.all;
 $('governmentStatus').textContent=(searchTerm?'Search · ':'')+rows.length+' action'+(rows.length===1?'':'s')+' shown';
 if(!rows.length){
  const empty=document.createElement('div');empty.className='governmentEmpty';
  empty.textContent='No actions in the current feed match this filter. Try another action type or a broader search.';
  root.append(empty);return;
 }
 root.append(...rows.map(actionCard));
}
async function fetchJson(path){
 const response=await fetch(GATEWAY+path,{headers:{Accept:'application/json'},credentials:'omit'});
 if(!response.ok)throw Error('HTTP '+response.status);
 return response.json();
}
async function load(query=''){
 const id=++requestId;
 $('governmentStatus').textContent='Loading current federal actions…';
 const params=new URLSearchParams({limit:'25'});if(query)params.set('q',query);
 const [registerResult,congressResult]=await Promise.allSettled([
  fetchJson('/api/federalregister?'+params.toString()),
  fetchJson('/api/congress?limit=25')
 ]);
 if(id!==requestId)return;
 const items=[];
 if(registerResult.status==='fulfilled')items.push(...normalizeFederalRegister(registerResult.value));
 if(congressResult.status==='fulfilled')items.push(...normalizeCongress(congressResult.value));
 items.sort((a,b)=>timeValue(b.date)-timeValue(a.date));
 allActions=items;searchTerm=query.trim();
 if(!items.length){
  $('governmentStatus').textContent='Official sources could not be loaded.';
  const empty=document.createElement('div');empty.className='governmentEmpty';
  empty.textContent='The current federal action feed is temporarily unavailable.';
  $('governmentResults').replaceChildren(empty);return;
 }
 render();
}
document.querySelectorAll('[data-action-filter]').forEach(btn=>btn.addEventListener('click',()=>{
 activeFilter=btn.dataset.actionFilter||'all';
 document.querySelectorAll('[data-action-filter]').forEach(x=>x.setAttribute('aria-selected',String(x===btn)));
 render();
}));
$('governmentSearch').addEventListener('submit',event=>{
 event.preventDefault();load($('governmentQuery').value.trim());
});
load('');

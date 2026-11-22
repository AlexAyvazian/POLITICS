import {normalizeDirectory,normalizeIssueSheet,filterCandidates,safeImageUrl} from './issue-stances-model.js';

const GATEWAY='https://crimson-mud-d254.alxayvazian.workers.dev';
const VOTERIST='https://www.voterist.com';
const $=id=>document.getElementById(id);
let directory=[],selectedSlug='',visibleLimit=20,loadSequence=0;
const detailsCache=new Map();

async function getJson(url){
 const response=await fetch(url,{headers:{Accept:'application/json'},credentials:'omit'});
 if(!response.ok){
  const error=new Error('HTTP '+response.status);
  error.status=response.status;throw error;
 }
 return response.json();
}
async function publicVoterist(type,slug=''){
 const route=new URL(GATEWAY+'/api/voterist');
 route.searchParams.set('type',type);
 if(type==='candidate')route.searchParams.set('slug',slug);
 try {
  const result=await getJson(route.toString());
  return result.data||result;
 } catch(err){
  // An older Cloudflare deployment may not have this route yet.
  // Never circumvent rate limiting: only fall back when the route itself is missing.
  if(err.status!==404)throw err;
  const path=type==='candidates'?'/api/public/candidates':'/api/public/candidates/'+encodeURIComponent(slug);
  return getJson(VOTERIST+path);
 }
}
const initials=name=>String(name||'').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join('');
const politicianLink=slug=>VOTERIST+'/candidate/'+encodeURIComponent(slug);
function element(tag,cls='',content=''){
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(content)node.textContent=content;
 return node;
}
function populateFilter(id,values){
 const select=$(id),current=select.value;
 select.replaceChildren(new Option(id==='issueState'?'All states':'All parties',''));
 values.filter(Boolean).sort((a,b)=>a.localeCompare(b)).forEach(value=>select.append(new Option(value,value)));
 if([...select.options].some(opt=>opt.value===current))select.value=current;
}
function updateFilters(){
 populateFilter('issueState',[...new Set(directory.map(x=>x.state))]);
 populateFilter('issueParty',[...new Set(directory.map(x=>x.party))]);
}
function card(person,index){
 const btn=element('button','issuesGalleryCard');
 btn.type='button';btn.setAttribute('role','listitem');
 btn.setAttribute('aria-pressed',String(selectedSlug===person.slug));
 btn.setAttribute('aria-label','Open '+person.name+' issue sheet');
 const image=element('div','issuesCardImage');
 if(person.portrait){
  const img=document.createElement('img');
  img.src=person.portrait;img.alt='';img.loading='lazy';
  img.onerror=()=>{image.replaceChildren(element('span','issuesInitials',initials(person.name)));};
  image.append(img);
 }else image.append(element('span','issuesInitials',initials(person.name)));
 image.append(element('span','issuesCardIndex',String(index+1).padStart(2,'0')+' / FILE'));
 const caption=element('div','issuesCardInfo');
 caption.append(element('small','', 'ISSUE SHEET'),element('strong','',person.name),element('span','',[person.office,person.state].filter(Boolean).join(' · ')||person.party||'Public candidate record'));
 btn.append(image,caption);
 btn.addEventListener('click',()=>openSheet(person));
 return btn;
}
function renderGallery(){
 const q=$('issueSearch').value,party=$('issueParty').value,state=$('issueState').value;
 const filtered=filterCandidates(directory,{query:q,party,state});
 $('issueCount').textContent=filtered.length.toLocaleString('en-US')+' profiles';
 const root=$('issueGallery');
 root.replaceChildren(...filtered.slice(0,visibleLimit).map((person,i)=>card(person,i)));
 $('issuesMore').hidden=filtered.length<=visibleLimit;
 if(directory.length && !filtered.length)$('issueStatus').textContent='No candidates match these filters.';
 else if(directory.length)$('issueStatus').textContent='';
}
function renderSheet(person,sheet){
 const root=$('issueSheet');root.replaceChildren();
 const header=element('header','issuesSheetHeader');
 const text=element('div');
 text.append(element('div','issuesSheetKicker','DOCUMENTED ISSUE POSITIONS'),element('h2','',sheet.name),element('p','',[person.office,person.state,person.party].filter(Boolean).join(' · ')));
 const link=element('a','issuesSheetLink','View Voterist profile');
 link.href=politicianLink(person.slug);link.target='_blank';link.rel='noopener noreferrer';
 header.append(text,link);
 const items=element('div','issuesSheetItems');
 if(sheet.positions.length){
  for(const stance of sheet.positions){
   const row=element('article','issuesItem');
   row.append(element('span','issuesItemTopic',stance.issue),element('p','',stance.statement));
   if(stance.sourceUrl){
    const a=element('a','','View supporting source');
    a.href=stance.sourceUrl;a.rel='noopener noreferrer';a.target='_blank';
    row.append(a);
    if(stance.sourceLabel)row.append(element('small','issuesItemMeta',stance.sourceLabel));
   }else{
    row.append(element('small','issuesItemMeta','Supporting source not linked in this record'));
   }
   items.append(row);
  }
 }else items.append(element('p','issuesSheetNoPositions','No documented issue positions are currently available for this politician.'));
 root.append(header,items);
}
async function openSheet(person){
 const id=++loadSequence;
 selectedSlug=person.slug;
 document.querySelectorAll('.issuesGalleryCard').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.getAttribute('aria-label')==='Open '+person.name+' issue sheet')));
 $('issueSheet').replaceChildren(element('p','issuesSheetNoPositions','Loading '+person.name+"'s issue positions…"));
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches===false)
  $('issueSheet').scrollIntoView({behavior:'smooth',block:'nearest'});
 try {
  const data=detailsCache.has(person.slug)?detailsCache.get(person.slug):await publicVoterist('candidate',person.slug);
  if(id!==loadSequence)return;
  detailsCache.set(person.slug,data);
  renderSheet(person,normalizeIssueSheet(data,person));
 }catch(error){
  if(id!==loadSequence)return;
  $('issueSheet').replaceChildren(element('p','issuesSheetNoPositions',
   'The issue positions for this candidate could not be loaded. Try again or use their public Voterist profile.'));
  const a=element('a','issuesSheetLink','Open Voterist profile');
  a.href=politicianLink(person.slug);a.target='_blank';a.rel='noopener noreferrer';
  $('issueSheet').append(a);
 }
}
function bind(){
 ['issueSearch','issueState','issueParty'].forEach(id=>$(id).addEventListener(id==='issueSearch'?'input':'change',()=>{
  visibleLimit=20;renderGallery();
 }));
 $('issuesMore').addEventListener('click',()=>{visibleLimit+=20;renderGallery();});
 const gallery=$('issueGallery');
 $('issuesPrevious').addEventListener('click',()=>gallery.scrollBy({left:-Math.max(250,gallery.clientWidth*.65),behavior:'smooth'}));
 $('issuesNext').addEventListener('click',()=>gallery.scrollBy({left:Math.max(250,gallery.clientWidth*.65),behavior:'smooth'}));
}
async function init(){
 bind();
 try{
  const response=await publicVoterist('candidates');
  directory=normalizeDirectory(response);
  updateFilters();
  if(!directory.length){
   $('issueStatus').textContent='The public candidate directory currently has no records available.';
   return;
  }
  renderGallery();
 }catch(error){
  $('issueStatus').textContent='Unable to load Voterist candidate records at the moment. Please try refreshing this page.';
  $('issueCount').textContent='Unavailable';
 }
}
init();

/* POLITICS source explorer: calls the named Cloudflare Worker, not provider keys. */
const gateway='https://crimson-mud-d254.alxayvazian.workers.dev';
const $=id=>document.getElementById(id);
let catalog=[],current=null,filter='all';
function button(parent,label,click,active=false,subtitle=''){
 const b=document.createElement('button');b.type='button';b.textContent=label;if(active)b.classList.add('active');
 if(subtitle){const sm=document.createElement('small');sm.textContent=subtitle;b.appendChild(sm);}
 b.addEventListener('click',click);parent.appendChild(b);
}
function render(){
 const groups=['all',...new Set(catalog.map(x=>x.category))];
 $('filters').replaceChildren();for(const g of groups)button($('filters'),g==='all'?'All':g[0].toUpperCase()+g.slice(1),()=>{filter=g;render();},filter===g);
 $('sources').replaceChildren();
 for(const item of catalog.filter(x=>filter==='all'||x.category===filter)){
  button($('sources'),item.id.toUpperCase(),()=>{current=item;render();$('providerTitle').textContent=item.id.toUpperCase();$('description').textContent=item.description;},current?.id===item.id,item.category+' · '+(item.configured?'binding found':'not configured'));
 }
}
async function boot(){
 try{const response=await fetch(gateway+'/api/catalog',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();if(!Array.isArray(data.providers))throw Error('Catalog missing');
  catalog=data.providers;$('status').textContent=catalog.length+' source connections available · retrieved from Cloudflare';
  render();
 }catch(e){$('status').textContent='Gateway not reachable: '+e.message+' · the GitHub source does not itself deploy Cloudflare code';$('output').textContent='Connection pending. Worker deployment or origin configuration may still be needed.';}
}
$('queryForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!current)return;
 const btn=$('run');btn.disabled=true;$('responseStatus').textContent='Requesting '+current.id+'…';
 const p=new URLSearchParams(new FormData(e.target));for(const [k,v] of [...p])if(!String(v).trim())p.delete(k);
 try{const r=await fetch(gateway+'/api/'+encodeURIComponent(current.id)+'?'+p.toString(),{signal:AbortSignal.timeout(15000)});
  const result=await r.json();$('responseStatus').textContent='HTTP '+r.status+(result.retrievedAt?' · '+result.retrievedAt:'');
  $('output').textContent=JSON.stringify(result,null,2);
 }catch(e){$('responseStatus').textContent='Request failed';$('output').textContent=String(e.message);}
 finally{btn.disabled=false;}
});
boot();

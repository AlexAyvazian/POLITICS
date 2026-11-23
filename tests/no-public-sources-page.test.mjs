import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

test('Data Sources stays internal and is never deployed as a public page or navigation destination',()=>{
  assert.equal(existsSync(new URL('sources.html',root)),false,'sources.html must not be deployed publicly');
  for(const page of ['index.html','records.html','congressional.html','foreign-influence.html','issues.html']){
    const html=read(page);
    assert.doesNotMatch(html,/href=["']sources\.html(?:[#?][^"']*)?["']/i,page+' must not link to Data Sources');
    assert.doesNotMatch(html,/>\s*Data Sources\s*</i,page+' must not expose a Data Sources navigation label');
    assert.doesNotMatch(html,/assets\/js\/sources\.js/i,page+' must not load the retired Sources UI bundle');
  }
});

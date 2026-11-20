import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('BLS county labor market refresh is scheduled and writes the static snapshot',()=>{
 const yml=read('.github/workflows/refresh-bls-county.yml');
 assert.match(yml,/schedule:/);
 assert.match(yml,/update_bls_county_laus\.py/);
 assert.match(yml,/assets\/data\/county\/bls-laus\.json/);
 assert.match(yml,/test_bls_county_laus\.py/);
});

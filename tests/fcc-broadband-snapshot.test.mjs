import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('FCC county broadband is collected nationwide and stored, not fetched from FCC on county clicks',()=>{
 const script=read('scripts/update_fcc_broadband.py');
 const workflow=read('.github/workflows/refresh-fcc-broadband.yml');
 const map=read('assets/js/map.js');
 const gateway=read('workers/politics-gateway.mjs');
 assert.match(script,/areaGeography\/fixed/);
 for(const speed of ['s1','s2','s3','s4','s5','s6'])assert.match(script,new RegExp('"'+speed+'"'));
 assert.match(script,/area_type.*urban|\("urban"/s);
 assert.match(script,/area_type.*rural|\("rural"/s);
 assert.match(script,/len\(rows\)<3100/);
 assert.match(workflow,/schedule:/);
 assert.match(workflow,/update_fcc_broadband\.py/);
 assert.match(map,/assets\/data\/county\/fcc-broadband-availability\.json/);
 assert.match(map,/residentialCoveragePct/);
 assert.match(map,/100_20/);
 assert.match(map,/1000_100/);
 assert.doesNotMatch(map,/\/api\/fcc_broadband\?county=/);
 assert.doesNotMatch(gateway,/geography\/summary\/.*fccCounty/s);
});

test('Data Sources health recognizes the stored FCC county dataset',()=>{
 const sources=read('assets/js/sources.js');
 assert.match(sources,/fcc_broadband:\{[^}]*match:\['fcc_broadband_county'\]/s);
 assert.match(sources,/fcc-broadband-availability\.json/);
 assert.match(sources,/fcc_broadband_county/);
});

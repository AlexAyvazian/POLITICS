import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {corinthianColumnPositions} from '../galiyaara/js/roman-architecture.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Roman engaged columns stand on both walls directly beneath matching arches',()=>{
 const opts={halfWidth:3.5,start:5.5,seg:3,archSpacing:12,length:785};
 const {arches,columns}=corinthianColumnPositions(opts);
 assert.ok(arches.length>60);
 assert.equal(columns.length,arches.length*2);
 for(let i=0;i<arches.length;i++){
  const pair=columns.slice(i*2,i*2+2);
  assert.deepEqual(pair.map(x=>x.side),[-1,1]);
  assert.equal(pair[0].z,arches[i].z);
  assert.equal(pair[1].z,arches[i].z);
  assert.equal(pair[0].x,-3.45);
  assert.equal(pair[1].x,3.45);
 }
});

test('column supports sit between image bays rather than cutting across portraits',()=>{
 const {arches,columns}=corinthianColumnPositions({halfWidth:3.5,start:5.5,seg:3,archSpacing:12,length:785});
 const artZ=Array.from({length:247},(_,bay)=>-(5.5+bay*3));
 for(const column of columns){
  const minDistance=Math.min(...artZ.map(z=>Math.abs(z-column.z)));
  assert.ok(minDistance>=1.5-1e-8,'column too close to portrait: '+column.z);
 }
 assert.equal(arches[0].z,-7);
 assert.equal(arches[1].z,-19);
});

test('architectural column components run from floor to sky arch with Corinthian capitals',()=>{
 const source=read('galiyaara/js/roman-architecture.js');
 for(const item of ['createCorinthianColonnade','InstancedMesh','CylinderGeometry','BoxGeometry','TorusGeometry','acanthus','fluted','abacus','capital','base']){
  assert.match(source,new RegExp(item,'i'),item);
 }
 assert.match(source,/y:\s*0/,'the column plinth rests on the floor');
 assert.match(source,/archSpringY/,'column tops connect to the arch spring');
 assert.doesNotMatch(source,/canvasTex|wallpaperLoader|gallery\.jpg/);
});

test('the original Galiyaara scene contains attached Roman columns and aligned overhead arches',()=>{
 const source=read('galiyaara/js/gallery.js');
 assert.match(source,/createCorinthianColonnade/);
 assert.match(source,/corinthianColumnPositions/);
 assert.match(source,/scene\.add\(corinthianColumns\)/);
 assert.match(source,/arch(?:es)?\.setMatrixAt/);
 assert.doesNotMatch(source,/const pillars = new THREE\.InstancedMesh/);
 assert.doesNotMatch(source,/scene\.add\(arch, pillars\)/);
 assert.match(source,/options\.wallpapers/);
 assert.match(source,/const pickables = \[\]/);
});

test('Roman colonnade keeps party portraits and Galiyaara's controls, with no duplicate gallery',()=>{
 const html=read('issues.html');
 const app=read('assets/js/issue-stances.js');
 assert.match(html,/class="unifiedTopNav"/);
 assert.match(html,/id="stage"/);
 assert.match(app,/createGallery/);
 assert.match(app,/arrangeCorridor\(people\)/);
 assert.match(app,/gallery\?\.walkBy/);
 assert.doesNotMatch(html,/issueGalleryCard/);
});

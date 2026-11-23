import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {corinthianColumnPositions, ROMAN_SHAFT_RADIUS, ROMAN_ARCH_TUBE_RADIUS, ROMAN_ENGAGEMENT_DEPTH} from '../galiyaara/js/roman-architecture.js';

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
  assert.equal(pair[0].x,-3.18);
  assert.equal(pair[1].x,3.18);
 }
});

test('most of each round column is IN FRONT of the wallpaper, not embedded in the wall',()=>{
 const halfWidth=3.5, wallSurface=halfWidth-0.019;
 const {columns}=corinthianColumnPositions({halfWidth,start:5.5,seg:3,archSpacing:12,length:785});
 assert.ok(ROMAN_SHAFT_RADIUS>=0.32,'Roman columns need substantial cylindrical shafts');
 assert.ok(ROMAN_ENGAGEMENT_DEPTH>=0.30,'Move shafts toward corridor rather than burying them');
 for(const col of columns){
  const protrusion=wallSurface-Math.abs(col.x);
  assert.ok(protrusion/ROMAN_SHAFT_RADIUS>0.80,'most of the shaft circumference must be visible');
  assert.ok(protrusion<ROMAN_SHAFT_RADIUS,'columns should remain engaged with the wall');
 }
 assert.ok(ROMAN_ARCH_TUBE_RADIUS>=0.23,'stone arch must be thick enough to read as architecture');
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
 assert.match(source,/ROMAN_ARCH_TUBE_RADIUS/);
 assert.match(source,/HALF_W - ROMAN_ENGAGEMENT_DEPTH/);
 assert.match(source,/archFascia/,'a second rounded marble molding should give the sky arch depth');
 assert.doesNotMatch(source,/const pillars = new THREE\.InstancedMesh/);
 assert.doesNotMatch(source,/scene\.add\(arch, pillars\)/);
 assert.match(source,/options\.wallpapers/);
 assert.match(source,/const pickables = \[\]/);
});

test('Roman colonnade retains portrait placement, walking controls, and original gallery',()=>{
 const html=read('issues.html');
 const app=read('assets/js/issue-stances.js');
 assert.match(html,/class="unifiedTopNav"/);
 assert.match(html,/id="stage"/);
 assert.match(app,/createGallery/);
 assert.match(app,/arrangeCorridor\(people\)/);
 assert.match(app,/gallery\?\.walkBy/);
 assert.doesNotMatch(html,/issueGalleryCard/);
});

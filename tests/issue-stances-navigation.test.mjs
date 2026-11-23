import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advanceCorridorZ,wheelCorridorMetres} from '../assets/js/issue-corridor-navigation.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('wheel/trackpad moves forward or backward with bounded, proportional movement',()=>{
 assert.equal(wheelCorridorMetres(100,0),2.4);
 assert.equal(wheelCorridorMetres(-100,0),-2.4);
 assert.equal(wheelCorridorMetres(5000,0),7);
 assert.equal(wheelCorridorMetres(-5000,0),-7);
 assert.ok(Math.abs(wheelCorridorMetres(3,1)-2.4)<1e-9);
 assert.equal(wheelCorridorMetres(1,2),7);
 assert.equal(wheelCorridorMetres(0,0),0);
 assert.equal(wheelCorridorMetres(NaN,0),0);
});

test('moving through the long gallery respects both ends; movement never jumps to portraits',()=>{
 const length=800;
 assert.equal(advanceCorridorZ(-20,5,length),-25);
 assert.equal(advanceCorridorZ(-20,-5,length),-15);
 assert.equal(advanceCorridorZ(-20,5000,length),-(length-24));
 assert.equal(advanceCorridorZ(-20,-5000,length),10);
 assert.equal(advanceCorridorZ(-20,NaN,length),-20);
});

test('the unified-shell view offers an obvious separate hallway navigation dock',()=>{
 const page=read('issues.html');
 for(const id of ['issueWalkBack','issueWalkForward','issueAutoWalk']){
  assert.match(page,new RegExp('id="'+id+'"'),id);
 }
 assert.match(page,/SCROLL/i);
 assert.match(page,/id="issueToolsPanel"[^>]*hidden/);
 assert.match(page,/SWIPE/i);
 assert.match(page,/FORWARD/i);
 assert.match(page,/aria-pressed="false"/);
 assert.match(page,/id="issueSheetPrevious"/);
 assert.match(page,/id="issueSheetNext"/);
 assert.match(page,/class="unifiedTopNav"/);
});

test('Galiyaara WebGL corridor handles wheel, vertical touch swipe, and press-to-walk',()=>{
 const code=read('galiyaara/js/gallery.js');
 assert.match(code,/listenCanvas\('wheel'/);
 assert.match(code,/passive:\s*false/);
 assert.match(code,/e\.preventDefault\(\)/);
 assert.match(code,/e\.pointerType\s*===\s*'touch'/);
 assert.match(code,/walkBy\(/);
 assert.match(code,/setAutoWalk\(/);
 assert.match(code,/autoWalk/);
 assert.match(code,/travelTargetZ/);
 assert.match(code,/stopAutoWalk/);
 assert.match(code,/events\.abort\(\)/);
});

test('buttons move the camera instead of selecting the next or previous portrait',()=>{
 const code=read('assets/js/issue-stances.js');
 assert.match(code,/issueWalkForward/);
 assert.match(code,/issueWalkBack/);
 assert.match(code,/issueAutoWalk/);
 assert.match(code,/gallery\?\.walkBy\(/);
 assert.match(code,/gallery\?\.setStick\(/);
 assert.match(code,/gallery\.setAutoWalk\(/);
 assert.doesNotMatch(code,/\['issuePrevious','prev'\]/);
 assert.doesNotMatch(code,/\['issueNext','next'\]/);
});

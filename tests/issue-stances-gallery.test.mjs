import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const exists=p=>existsSync(new URL('../'+p,import.meta.url));

test('Issue Stances embeds the actual Galiyaara WebGL corridor, not a recreated carousel',()=>{
 const html=read('issues.html'),js=read('assets/js/issue-stances.js');
 const original=read('galiyaara/js/gallery.js');
 assert.match(html,/<canvas[^>]+id="stage"/);
 assert.match(js,/import\s*\{\s*createGallery\s*\}\s*from\s*['"].*galiyaara\/js\/gallery\.js/);
 assert.match(js,/createGallery\(/);
 assert.match(original,/new THREE\.WebGLRenderer/);
 assert.match(original,/new THREE\.InstancedMesh/);
 assert.match(original,/const pickables = \[\]/);
 assert.doesNotMatch(html,/id="issueGallery"/);
 assert.doesNotMatch(html,/issuesGalleryCard/);
 assert.match(html,/class="unifiedTopNav"/);
 assert.match(html,/href="issues\.html" aria-current="page"/);
});

test('Original Galiyaara Three.js distribution is self-hosted and unchanged',()=>{
 const code=read('galiyaara/vendor/three.module.min.js');
 const core=read('galiyaara/vendor/three.core.min.js');
 assert.match(code,/Copyright 2010-2025 Three\.js Authors/);
 assert.match(code,/from"\.\/three\.core\.min\.js"/);
 assert.match(core,/MIT/);
 assert.ok(exists('galiyaara/vendor/THREE-LICENSE'));
});

test('Only actual wallpaper uploads are used as 3D wall textures',async()=>{
 const manifest=await import('../assets/js/issue-stances-wallpapers.js');
 const urls=manifest.WALLPAPER_IMAGES;
 assert.equal(urls.length,25,'25 image assets plus .gitkeep make 26 entries in wallpaper directory');
 assert.equal(new Set(urls).size,25);
 for(const p of urls)assert.ok(exists(p),'Missing wallpaper: '+p);
 const corridor=read('galiyaara/js/gallery.js');
 assert.match(corridor,/options\.wallpapers/);
 assert.match(corridor,/new THREE\.TextureLoader/);
 assert.match(corridor,/new THREE\.PlaneGeometry/);
});

test('Issue sheet overlays the original corridor and only reports actual sourced stances',()=>{
 const html=read('issues.html'),js=read('assets/js/issue-stances.js');
 assert.match(html,/id="issueSheet"/);
 assert.match(js,/normalizeIssueSheet/);
 assert.match(js,/onFocus/);
 assert.match(js,/onPass/);
 assert.doesNotMatch(html,/Quick Record|Top donor sectors|Fundraising summary|Leadership PAC/i);
 assert.doesNotMatch(js,/Quick Record|Top donor sectors|Fundraising summary|Leadership PAC/i);
});

test('no portraits are invented and verified Congress members may reuse existing official photo source',()=>{
 const js=read('assets/js/issue-stances.js');
 assert.match(js,/https:\/\/unitedstates\.github\.io\/images\/congress\/225x275\//);
 assert.doesNotMatch(js,/pravatar\.cc|randomuser\.me|unsplash\.com\/.*person/);
});

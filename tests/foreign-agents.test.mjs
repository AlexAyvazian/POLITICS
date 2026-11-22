import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONTINENTS,continentForCountry,flagAsset} from '../assets/js/foreign-agents-model.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Foreign Agents is a separate top-level directory with exactly six continent selectors',()=>{
 const html=read('foreign-agents.html');
 assert.match(html,/<h1>Foreign Agents<\/h1>/);
 assert.match(html,/id="continentGrid"/);
 assert.match(html,/id="countryGrid"/);
 assert.match(html,/id="agentDirectory"/);
 assert.equal(CONTINENTS.length,6);
 assert.deepEqual(CONTINENTS.map(x=>x.slug),['north-america','south-america','europe','asia','africa','oceania']);
 assert.doesNotMatch(JSON.stringify(CONTINENTS),/antarctica/i);
});

test('continent assignment follows the requested POLITICS grouping',()=>{
 assert.deepEqual(continentForCountry('CA'),['north-america']);
 assert.deepEqual(continentForCountry('US'),['north-america']);
 assert.deepEqual(continentForCountry('MX'),['north-america']);
 assert.deepEqual(continentForCountry('GL'),['north-america']);
 for(const iso of ['BZ','GT','HN','SV','NI','CR','PA','CU','JM','HT','DO','TT','BB','BS']){
  assert.ok(continentForCountry(iso).includes('south-america'),iso+' should be grouped with South America');
  assert.ok(!continentForCountry(iso).includes('north-america'),iso+' must not be grouped with North America');
 }
 for(const iso of ['AM','GE'])assert.ok(continentForCountry(iso).includes('europe'),iso+' should be grouped with Europe');
 assert.ok(continentForCountry('RU').includes('europe'),'Russia should appear in Europe');
 assert.ok(continentForCountry('RU').includes('asia'),'Russia should also appear in Asia because it is transcontinental');
});

test('continent maps are the controls themselves with no glass/card border',()=>{
 const css=read('assets/css/foreign-agents.css');
 assert.match(css,/\.continentButton\s*\{[^}]*background:\s*none[^}]*border:\s*0[^}]*box-shadow:\s*none/s);
 assert.match(css,/\.continentMap\s*\{[^}]*filter:/s);
 assert.match(css,/\.continentButton:hover\s+\.continentMap[\s\S]*drop-shadow/s);
 assert.match(css,/\.continentButton:focus-visible\s+\.continentMap[\s\S]*drop-shadow/s);
 assert.doesNotMatch(css,/\.continentButton[^}]*backdrop-filter/s);
});

test('continent click drills into flag/name countries and country click drills into people',()=>{
 const js=read('assets/js/foreign-agents.js');
 assert.match(js,/function showContinent/);
 assert.match(js,/function showCountry/);
 assert.match(js,/flagAsset/);
 assert.match(js,/countryGrid/);
 assert.match(js,/agentDirectory/);
 assert.match(js,/assets\/data\/foreign-agents\/countries\//);
 assert.match(js,/history\.replaceState/);
 assert.equal(flagAsset('US'),'assets/img/foreign-agents/flags/us.svg');
});

test('uploaded continent assets are wired directly into the selectors',()=>{
 const assets=CONTINENTS.map(x=>x.asset);
 assert.deepEqual(assets,[
  'assets/img/foreign-agents/north-america.png',
  'assets/img/foreign-agents/south-america.png',
  'assets/img/foreign-agents/europe.png',
  'assets/img/foreign-agents/asia.png',
  'assets/img/foreign-agents/africa.png',
  'assets/img/foreign-agents/oceania.png'
 ]);
});

test('all public top-level navigation includes Foreign Agents',()=>{
 for(const page of ['index.html','congressional.html','records.html','foreign-influence.html','government-action.html','foreign-agents.html']){
  const html=read(page);
  assert.match(html,/href="foreign-agents\.html"/,page+' should link Foreign Agents');
 }
});

test('country directory uses the uploaded vector flag set rather than emoji flags',()=>{
 const js=read('assets/js/foreign-agents.js');
 const model=read('assets/js/foreign-agents-model.mjs');
 assert.match(js,/flagAsset\(country\.iso2\)/);
 assert.match(js,/flagAsset\(iso\)/);
 assert.match(model,/assets\/img\/foreign-agents\/flags\//);
 assert.doesNotMatch(js,/flagEmoji|String\.fromCodePoint/);
});

test('continent assets are valid nontrivial PNG images',()=>{
 const pngSignature=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
 for(const continent of CONTINENTS){
  const asset=readFileSync(new URL('../'+continent.asset,import.meta.url));
  assert.ok(asset.length>4000,continent.slug+' image is suspiciously small');
  assert.deepEqual(asset.subarray(0,8),pngSignature,continent.slug+' must be a valid PNG');
 }
});

test('country flags themselves are the unboxed clickable controls',()=>{
 const css=read('assets/css/foreign-agents.css');
 assert.match(css,/\.countryButton\s*\{[^}]*border:\s*0[^}]*background:\s*none[^}]*box-shadow:\s*none/s);
 assert.match(css,/\.countryButton:hover\s+\.flag\s+img[\s\S]*drop-shadow/s);
 assert.match(css,/\.countryButton:focus-visible\s+\.flag\s+img[\s\S]*drop-shadow/s);
 assert.doesNotMatch(css,/\.countryButton\s*\{[^}]*border-radius:/s);
});

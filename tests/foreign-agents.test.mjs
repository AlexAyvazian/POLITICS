import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONTINENTS,continentForCountry,flagEmoji} from '../assets/js/foreign-agents-model.mjs';

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
 assert.match(js,/flagEmoji/);
 assert.match(js,/countryGrid/);
 assert.match(js,/agentDirectory/);
 assert.match(js,/assets\/data\/foreign-agents\/countries\//);
 assert.match(js,/history\.replaceState/);
 assert.equal(flagEmoji('US'),'🇺🇸');
});

test('uploaded continent assets are wired directly into the selectors',()=>{
 const assets=CONTINENTS.map(x=>x.asset);
 assert.deepEqual(assets,[
  'assets/img/foreign-agents/north-america.webp',
  'assets/img/foreign-agents/south-america.webp',
  'assets/img/foreign-agents/europe.webp',
  'assets/img/foreign-agents/asia.webp',
  'assets/img/foreign-agents/africa.webp',
  'assets/img/foreign-agents/oceania.webp'
 ]);
});

test('all public top-level navigation includes Foreign Agents',()=>{
 for(const page of ['index.html','congressional.html','records.html','foreign-influence.html','government-action.html','foreign-agents.html']){
  const html=read(page);
  assert.match(html,/href="foreign-agents\.html"/,page+' should link Foreign Agents');
 }
});

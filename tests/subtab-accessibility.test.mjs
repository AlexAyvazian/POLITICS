import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('all subtab navigation remains reachable without relying on a hidden horizontal scrollbar',()=>{
  const records=read('assets/css/records-editorial.css');
  const government=read('assets/css/government-action.css');
  const map=read('assets/css/map.css');
  assert.match(records,/\.recordsProfileTabs\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(government,/\.governmentTabs\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(map,/#view-map \.countyDataTabs\s*\{[^}]*flex-wrap:\s*wrap/s);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../assets/js/geo-stats.js',import.meta.url),'utf8');
const context={window:{}};vm.runInNewContext(source,context);
const stats=context.window.POLITICS_GEO_STATS;
test('state view computes equal-weight arithmetic mean for EACH county metric',()=>{
 const counties={'23001':{population:100,medianHouseholdIncome:30000,povertyRate:10,medianGrossRent:500},'23003':{population:900,medianHouseholdIncome:90000,povertyRate:30,medianGrossRent:1500},'06019':{population:99999,medianHouseholdIncome:200000}};
 const result=stats.getStateAverages({core:{counties},categories:{housing:{fields:{medianHomeValue:{unit:'currency'}},counties:{'23001':{medianHomeValue:100000},'23003':{medianHomeValue:300000}}}}},'23');
 assert.equal(result.overview.avgCountyPopulation,500);
 assert.equal(result.overview.avgCountyMedianHouseholdIncome,60000);
 assert.equal(result.overview.avgCountyPovertyRate,20);
 assert.equal(result.overview.avgCountyMedianGrossRent,1000);
 assert.equal(result.housing.medianHomeValue,200000);
});
test('only available county values contribute; missing is not zero',()=>{
 const x={counties:{'23001':{a:0},'23003':{a:null},'23005':{a:30},'23007':{}}};
 assert.equal(stats.countyAverage(x,'23','a'),15);
 assert.equal(stats.countyAverage(x,'23','other'),null);
 assert.equal(stats.countyAverage(x,'06','a'),null);
});
test('state and county selection both remain in one map and no click uses fetch',()=>{
 const m=readFileSync(new URL('../assets/js/map.js',import.meta.url),'utf8');
 assert.match(m,/stateLightTrace/);
 assert.match(m,/showStateFacts/);
 assert.match(m,/showCountyFacts/);
 assert.doesNotMatch(m,/\bfetch\s*\(/);
});

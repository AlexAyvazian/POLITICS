/* Audit every public congressional atlas boundary file with the SAME D3 v7 renderer.
 * This runs in GitHub Actions after scheduled cache generation and map changes.
 * It never calls Census or any API; inspect only committed geometry.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const manifest=JSON.parse(read('assets/data/congressional/manifest.json'));
const d3Module={exports:{}};
vm.runInNewContext(read('assets/vendor/d3.min.js'),{module:d3Module,exports:d3Module.exports});
const d3=d3Module.exports;
const modelScope={window:{}};
vm.runInNewContext(read('assets/js/congressional-model.js'),modelScope);
const model=modelScope.window.CONGRESSIONAL_MODEL;
const W=1300,H=620;
const layers=['house','stateSenate','stateHouse'];
const report={date:new Date().toISOString(),states:manifest.states.length,layers:{},checks:0,
  filesChecked:0,featuresChecked:0,issues:[],warnings:[],results:[]};
const fail=(layer,state,issue,info={})=>report.issues.push({layer,state,issue,...info});
const warn=(layer,state,issue,info={})=>report.warnings.push({layer,state,issue,...info});
const finitePair=(v)=>v.length===2&&v.every(Number.isFinite);
for(const layer of layers){
 report.layers[layer]={views:0,features:0,empty:0,atLarge:0};
 for(const state of manifest.states){
  report.checks++;
  report.filesChecked++;
  const expected=manifest.counts[layer][state];
  const name='assets/data/congressional/'+layer+'/'+state+'.geojson';
  let doc;
  try{doc=JSON.parse(read(name));}
  catch(err){fail(layer,state,'missing-or-invalid-file',{detail:String(err)});continue;}
  if(doc?.type!=='FeatureCollection'||!Array.isArray(doc?.features)){
   fail(layer,state,'invalid-feature-collection');continue;
  }
  const features=doc.features,summary={layer,state,count:features.length,expected,screenBound:null,
   coveragePercent:null,minArea:null,invalidShapes:0,districtLabels:0};
  report.results.push(summary);
  report.layers[layer].views++;
  report.layers[layer].features+=features.length;
  report.featuresChecked+=features.length;
  if(features.length!==expected)fail(layer,state,'district-count-mismatch',{expected,actual:features.length});
  if(features.length===0){
   report.layers[layer].empty++;
   if(expected!==0)fail(layer,state,'unexpected-empty-file');
   continue;
  }
  const ids=new Set();
  for(const f of features){
   const id=f?.properties?.GEOID;
   if(typeof id!=='string'||(layer==='house'?id.length!==4:id.length!==5)||!id.startsWith(state))
    fail(layer,state,'invalid-geoid',{id});
   if(ids.has(id))fail(layer,state,'duplicate-district',{id});
   ids.add(id);
   if(f?.geometry?.type!=='Polygon'&&f?.geometry?.type!=='MultiPolygon')
    fail(layer,state,'invalid-geometry-type',{id,geometry:f?.geometry?.type});
  }
  if(layer==='house'&&features.length===1){
   report.layers[layer].atLarge++;
   if(!['00',...(state==='11'?['98']:[])].includes(model.districtCode(features[0].properties,layer)))
    fail(layer,state,'one-district-state-not-at-large');
  }
  try{
   const normalized=model.rewindForD3(doc);
   const extent=model.districtViewport(W,H,features.length);
   const projection=d3.geoMercator().fitExtent(extent,normalized);
   const geometryPath=d3.geoPath(projection);
   const bounds=geometryPath.bounds(normalized),area=geometryPath.area(normalized);
   summary.screenBound=bounds.map(pair=>pair.map(x=>Number(x.toFixed(2))));
   summary.coveragePercent=Number((100*area/(W*H)).toFixed(2));
   if(!bounds.every(finitePair)||!Number.isFinite(area)||area<=0)
    fail(layer,state,'non-finite-or-empty-screen-geometry',{bounds,area});
   const epsilon=1.1;
   if(bounds[0][0]<-epsilon||bounds[0][1]<-epsilon||bounds[1][0]>W+epsilon||bounds[1][1]>H+epsilon)
    fail(layer,state,'projected-shape-outside-svg',{bounds});
   if(area>W*H*1.02)
    fail(layer,state,'inverted-global-fill',{area,viewportArea:W*H});
   const minDimension=Math.min(bounds[1][0]-bounds[0][0],bounds[1][1]-bounds[0][1]);
   if(minDimension<55)warn(layer,state,'overall-map-very-thin',{minDimension});
   const expectedScreenMargin=features.length===1;
   if(expectedScreenMargin&&(bounds[0][0]<W*.13||bounds[1][0]>W*.87||bounds[0][1]<H*.12||bounds[1][1]>H*.88))
    warn(layer,state,'single-district-near-edges',{bounds});
   let minArea=Infinity;
   for(const f of normalized.features){
    const id=f.properties.GEOID;
    const a=geometryPath.area(f);
    const b=geometryPath.bounds(f);
    const c=geometryPath.centroid(f);
    if(!Number.isFinite(a)||a<=0||!b.every(finitePair)||b[0][0]<-epsilon||b[0][1]<-epsilon||
       b[1][0]>W+epsilon||b[1][1]>H+epsilon){
      fail(layer,state,'invalid-district-projection',{id,area:a,bounds:b});
      summary.invalidShapes++;
    }
    if(!finitePair(c))warn(layer,state,'non-finite-label-centroid',{id});
    if(a>190)summary.districtLabels++;
    if(a<minArea)minArea=a;
   }
   summary.minArea=Number(minArea.toFixed(3));
   if(summary.districtLabels===0)
    warn(layer,state,'no-district-large-enough-to-label');
  }catch(err){fail(layer,state,'projection-exception',{detail:String(err)});}
 }
}
const output='audit-results';mkdirSync(output,{recursive:true});
writeFileSync(path.join(output,'congressional-map-audit.json'),JSON.stringify(report,null,2)+'\n');
const lines=['# Congressional Atlas complete geometry audit','',
 'Generated '+report.date,'',
 '| Layer | Views | Districts | Empty expected chambers | At-large |',
 '|---|---:|---:|---:|---:|',
 ...Object.entries(report.layers).map(([layer,s])=>`| ${layer} | ${s.views} | ${s.features} | ${s.empty} | ${s.atLarge} |`),
 '',`Views tested: ${report.filesChecked}. Individual districts: ${report.featuresChecked}.`,
 `Failures: ${report.issues.length}. Warnings: ${report.warnings.length}.`,'',
 '## Failures','',...(report.issues.length?report.issues.map(x=>'- '+JSON.stringify(x)):['None']),
 '','## Warnings','',...(report.warnings.length?report.warnings.map(x=>'- '+JSON.stringify(x)):['None']),''];
writeFileSync(path.join(output,'congressional-map-audit.md'),lines.join('\n'));
console.log(JSON.stringify({layers:report.layers,filesChecked:report.filesChecked,
 featuresChecked:report.featuresChecked,issues:report.issues.slice(0,50),
 issueCount:report.issues.length,warnings:report.warnings.slice(0,30),warningCount:report.warnings.length},null,2));
if(report.issues.length)process.exitCode=1;

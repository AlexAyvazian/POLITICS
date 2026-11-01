/* Harmonized U.S. geographic palette.
 * Modeled on Healthcare-Directory's geographically ordered family palette and
 * deterministic subdivision shade ramp. Colors carry no data classification.
 * Region families are intentionally muted to work with the dark map background.
 */
(function(root){
 'use strict';
 // Geographic neighbors use related families; order moves broadly west -> east.
 // All 51 state/DC FIPS codes are assigned exactly once.
 const FAMILIES=[
  {name:'pacific',hue:207,sat:28,states:['02','15','53','41','06']},
  {name:'northwest',hue:185,sat:25,states:['16','30','56']},
  {name:'southwest',hue:231,sat:27,states:['32','49','04','35']},
  {name:'rockies',hue:152,sat:24,states:['08','38','46']},
  {name:'plains',hue:91,sat:24,states:['31','20','40','48']},
  {name:'great-lakes',hue:169,sat:24,states:['27','19','55','26']},
  {name:'heartland',hue:42,sat:28,states:['29','17','18','39']},
  {name:'south-central',hue:19,sat:27,states:['05','22','28','01']},
  {name:'southeast',hue:355,sat:24,states:['47','21','13','12','45','37']},
  {name:'mid-atlantic',hue:294,sat:21,states:['51','54','24','10','11','42','34']},
  {name:'northeast',hue:219,sat:24,states:['36','09','44','25','50','33','23']}
 ];
 const byState=new Map();
 for(const family of FAMILIES){
  family.states.forEach((fips,index)=>byState.set(fips,{...family,index}));
 }
 // Neighboring states within the same family are different enough to read,
 // without sudden changes to saturated red, lime or neon turquoise.
 const STATE_LIGHT=[48,56,51,59,45,54,50];
 const STATE_SAT=[0,-2,2,-3,3,1,-1];
 const mod=(n,d)=>((n%d)+d)%d;
 const paint=(h,s,l)=>`hsl(${h} ${s}% ${l}%)`;
 function state(stateFips){
  const fips=String(stateFips).padStart(2,'0');
  const f=byState.get(fips);
  // Neutral fall-through only for unexpected/unrecognized geometry.
  if(!f)return {hue:0,fill:'#586274',hover:'#718096',dark:'#202A3A',glow:'#9CAABE'};
  const i=f.index,hue=f.hue;
  const saturation=f.sat+STATE_SAT[mod(i,STATE_SAT.length)];
  const lightness=STATE_LIGHT[mod(i,STATE_LIGHT.length)];
  return {
   hue,
   family:f.name,
   fill:paint(hue,saturation,lightness),
   hover:paint(hue,Math.min(43,saturation+6),Math.min(72,lightness+10)),
   dark:paint(hue,Math.min(52,saturation+12),24),
   glow:paint(hue,Math.min(43,saturation+8),64)
  };
 }
 function county(stateFips,countyFips){
  const base=state(stateFips),fips=String(countyFips).padStart(5,'0');
  const number=Number(fips.slice(-3));
  // Interleaved, distinguishable positions along a muted version of the
  // parent state's shade ramp. Decimal steps keep large states unique.
  const offset=mod(number*197,1009)/1009;
  const saturation=23+((number*29)%117)/10;
  const lightness=41+offset*23;
  return {
   hue:base.hue,
   family:base.family,
   fill:paint(base.hue,saturation.toFixed(2),lightness.toFixed(2)),
   hover:paint(base.hue,Math.min(43,saturation+6).toFixed(2),Math.min(75,lightness+8).toFixed(2)),
   dark:base.dark,
   glow:base.glow
  };
 }
 root.GEO_COLORS={state,county};
})(typeof window!=='undefined'?window:globalThis);

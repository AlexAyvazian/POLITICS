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
  {name:'northwest',hue:35,sat:28,states:['16','30','56']},
  {name:'southwest',hue:231,sat:27,states:['32','49','04','35']},
  {name:'rockies',hue:47,sat:29,states:['08','38','46']},
  {name:'plains',hue:91,sat:24,states:['31','20','40','48']},
  {name:'great-lakes',hue:169,sat:24,states:['27','19','55','26']},
  {name:'heartland',hue:42,sat:28,states:['29','17','18','39']},
  {name:'south-central',hue:19,sat:27,states:['05','22','28','01']},
  {name:'southeast',hue:355,sat:24,states:['47','21','13','12','45','37']},
  {name:'mid-atlantic',hue:294,sat:21,states:['51','54','24','10','11','42','34']},
  {name:'northeast',hue:22,sat:22,states:['36','09','44','25','50','33','23']}
 ];
 // These are fixed state swatches, not approximations. Hex values are preserved verbatim.
 // Six yellow assignments follow the exact state order specified by the user.
 const STATE_SWATCHES=Object.freeze({
  '38':'#00A693', // North Dakota: Persian Green
  '27':'#9F8170', // Minnesota: Beaver
  '26':'#A67B5B', // Michigan: Cafe au Lait
  '19':'#C19A6B', // Iowa: Wood Brown
  '55':'#9B7653', // Wisconsin: Dirt
  '54':'#F8DE7E', // West Virginia: Mellow Yellow
  '51':'#FFFF66', // Virginia: Unmellow Yellow
  '24':'#FFFD74', // Maryland: Butter
  '10':'#FFFE71', // Delaware: Pastel Yellow
  '34':'#EEE8AA', // New Jersey: Pale Goldenrod
  '42':'#F0E68C'  // Pennsylvania: Light Khaki
 });
 // Capture each donor's PREVIOUS color, including its hover and selection identity.
 // Do not resolve these transfers recursively after donor states change to brown/yellow.
 const ORIGINAL_COLOR_TRANSFERS=Object.freeze({
  '56':'27', // Wyoming gets old Minnesota
  '16':'26', // Idaho gets old Michigan
  '30':'19', // Montana gets old Iowa
  '46':'55', // South Dakota gets old Wisconsin
  '36':'51', // New York gets old Virginia pink
  '09':'54', // Connecticut gets old West Virginia pink
  '44':'24', // Rhode Island gets old Maryland pink
  '25':'10', // Massachusetts gets old Delaware pink
  '50':'34', // Vermont gets old New Jersey pink
  '33':'42'  // New Hampshire gets old Pennsylvania pink
 });
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
 // Legacy colors are computed separately, so a transfer always uses the donor's
 // original visual identity even after that donor gets reassigned a new swatch.
 function originalState(stateFips){
  const fips=String(stateFips).padStart(2,'0');
  const f=byState.get(fips);
  // Neutral fall-through only for unexpected/unrecognized geometry.
  if(!f)return {hue:0,fill:'#586274',hover:'#718096',dark:'#202A3A',glow:'#9CAABE'};
  const i=f.index;
  // Colorado: darker hunter green, independent of the North Dakota/South Dakota golden family.
  const colorado=fips==='08';
  const hue=colorado?137:f.hue;
  const saturation=colorado?28:f.sat+STATE_SAT[mod(i,STATE_SAT.length)];
  const lightness=colorado?34:STATE_LIGHT[mod(i,STATE_LIGHT.length)];
  return {
   hue,
   family:f.name,
   fill:paint(hue,saturation,lightness),
   hover:paint(hue,Math.min(43,saturation+6),Math.min(72,lightness+10)),
   dark:paint(hue,Math.min(52,saturation+12),24),
   glow:paint(hue,Math.min(43,saturation+8),64)
  };
 }
 function swatch(hex){
  const rgb=[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)/255);
  const hi=Math.max(...rgb),lo=Math.min(...rgb),delta=hi-lo;
  let h=0,s=0,l=(hi+lo)/2;
  if(delta){
   s=delta/(1-Math.abs(2*l-1));
   const [r,g,b]=rgb;
   switch(hi){
    case r:h=((g-b)/delta)%6;break;
    case g:h=(b-r)/delta+2;break;
    default:h=(r-g)/delta+4;
   }
   h=(h*60+360)%360;
  }
  const hue=Math.round(h),sat=Math.round(s*100),light=Math.round(l*100);
  return {
   hue,fill:hex,family:'custom-'+hue,
   hover:paint(hue,Math.min(85,Math.max(35,Math.round(sat*.8))),Math.min(83,light+9)),
   dark:paint(hue,Math.min(58,Math.max(28,Math.round(sat*.7))),24),
   glow:paint(hue,Math.min(55,Math.max(28,Math.round(sat*.65))),64)
  };
 }
 function state(stateFips){
  const fips=String(stateFips).padStart(2,'0');
  if(STATE_SWATCHES[fips])return swatch(STATE_SWATCHES[fips]);
  if(ORIGINAL_COLOR_TRANSFERS[fips])return originalState(ORIGINAL_COLOR_TRANSFERS[fips]);
  // The Northeast has seven states; the sixth transferred pink swatch is
  // supplemented with a seventh distinct shade for Maine.
  if(fips==='23'){
   const pink=originalState('11');
   return {
    ...pink,
    fill:paint(294,25,62),
    hover:paint(294,31,72),
    dark:paint(294,37,24),
    glow:paint(294,33,64)
   };
  }
  return originalState(fips);
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

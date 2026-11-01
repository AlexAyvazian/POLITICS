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
 // Explicit state swatches and transfers override only the requested places.
 // Hex values are deliberate fills; other states retain existing family colors.
 const STATE_SWATCHES=Object.freeze({
  // Great Lakes brown range (Wisconsin specifically uses the requested Mocha).
  '27':'#725648', // Minnesota — dark tobacco brown
  '26':'#8C624B', // Michigan — warm brown
  '19':'#C2A276', // Iowa — light sand brown
  '55':'#3C280D', // Wisconsin — MOCHA
  '46':'#8A9A75', // South Dakota — former North Dakota sage olive
  '08':'#587966', // Colorado — muted dark green

  // Exact blues requested: HI first, Alaska second.
  '15':'#589BD5', // Hawaii
  '02':'#9ACAF4', // Alaska

  // Transfer colors from their former owners (snapshots before this change).
  '17':'#857B5B', // Illinois takes old Pennsylvania
  '54':'#B9B68A', // West Virginia takes old Virginia
  '39':'#C2AB7B', // Ohio takes old New Jersey

  // Explicit latest Mid-Atlantic swatches: exact where unqualified; muted only when requested.
  '42':'#FFB6C1', // Pennsylvania — LIGHT PINK, exact
  '10':'#DEBAC3', // Delaware — muted PASTEL PINK #FFD1DC
  '51':'#C46381', // Virginia — muted DARK PINK #E75480
  '34':'#FFA6C9', // New Jersey — CARNATION, exact
  '24':'#F6ADC6', // Maryland — NADESHIKO PINK, exact

  // New muted choices: low-saturation adaptations of supplied hex values.
  // Missouri #FEBA4F -> muted pastel orange; Kentucky #A91B0D -> muted Apple.
  // Tennessee uses the exact supplied Berry #7A1712 option.
  '29':'#D6A55C', // Missouri — muted PASTEL ORANGE #FEBA4F
  '21':'#9F3B30', // Kentucky — muted APPLE #A91B0D
  '47':'#7A1712', // Tennessee — BERRY, exact

  // Northern pink group: use requested Prince Charming for NH.
  '36':'#86627B', // New York
  '09':'#9F83B2', // Connecticut
  '44':'#784B88', // Rhode Island — muted EMINENCE #6C3082
  '25':'#645394', // Massachusetts — ULTRA VIOLET, exact
  '50':'#AEA0B8', // Vermont
  '33':'#493F5E', // New Hampshire — PRINCE CHARMING
  '23':'#B18BA2'  // Maine
 });
 // Capture each donor's PREVIOUS color, including its hover and selection identity.
 // Do not resolve these transfers recursively after donor states change to brown/yellow.
 const ORIGINAL_COLOR_TRANSFERS=Object.freeze({
  '56':'27', // Wyoming gets the old Minnesota teal
  '16':'26', // Idaho gets the old Michigan teal
  '30':'19', // Montana gets the old Iowa teal
  '38':'55'  // North Dakota gets former South Dakota's old Wisconsin teal
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

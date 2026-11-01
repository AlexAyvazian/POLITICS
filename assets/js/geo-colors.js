/* Geographic palette. Colors identify places only: not voting, parties, or ideology.
   Every state owns one hue; its counties vary saturation and lightness within that hue. */
(function(root){
  'use strict';
  const HUE_STEP=137.508;
  function stateHue(stateFips){
    return Math.round((Number(stateFips)*HUE_STEP+19)%360);
  }
  function state(stateFips){
    const n=Number(stateFips),hue=stateHue(stateFips);
    const saturation=58+(n%4)*5;
    const lightness=47+(n%3)*3;
    return {
      hue,
      fill:`hsl(${hue} ${saturation}% ${lightness}%)`,
      hover:`hsl(${hue} ${Math.min(85,saturation+8)}% ${Math.min(70,lightness+10)}%)`,
      dark:`hsl(${hue} 94% 29%)`,
      glow:`hsl(${hue} 96% 57%)`
    };
  }
  function county(stateFips,countyFips){
    const parent=state(stateFips);
    const number=Number(String(countyFips).padStart(5,'0').slice(-3));
    // Coprime cycles produce unique shades for counties within each state's FIPS range.
    const saturation=48+(number*11)%29;
    const lightness=35+(number*17)%31;
    return {
      hue:parent.hue,
      fill:`hsl(${parent.hue} ${saturation}% ${lightness}%)`,
      hover:`hsl(${parent.hue} ${Math.min(89,saturation+9)}% ${Math.min(78,lightness+12)}%)`,
      dark:parent.dark,
      glow:parent.glow
    };
  }
  root.GEO_COLORS={state,county};
})(typeof window!=='undefined'?window:globalThis);

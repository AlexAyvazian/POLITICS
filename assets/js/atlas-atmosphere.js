/* Healthcare Directory-style cursor halo for the separate Congressional Atlas.
 * Appearance only. Does not inspect or modify SVG districts, fills, or selection.
 * The County Atlas already has its own cursor movement in map.js.
 */
(function(){
 'use strict';
 const halo=document.getElementById('cursorGlow');
 if(!halo||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 document.addEventListener('pointermove',event=>{
  halo.style.left=event.clientX+'px';
  halo.style.top=event.clientY+'px';
 },{passive:true});
})();

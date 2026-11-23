/** Directional navigation utilities for the original Galiyaara corridor.
 * Positive metres means farther INTO the hallway (negative world Z).
 */
export function advanceCorridorZ(currentZ,forwardMetres,length){
 if(!Number.isFinite(currentZ))return 0;
 if(!Number.isFinite(forwardMetres)||!Number.isFinite(length)||length<=24)return currentZ;
 return Math.max(-(length-24),Math.min(10,currentZ-forwardMetres));
}

/** Mouse wheel/trackpad magnitudes differ; accept pixel, line and page deltas. */
export function wheelCorridorMetres(deltaY,deltaMode=0){
 if(!Number.isFinite(deltaY))return 0;
 const unit=deltaMode===1?0.8:deltaMode===2?8:0.024;
 const metres=deltaY*unit;
 return Math.max(-7,Math.min(7,metres));
}

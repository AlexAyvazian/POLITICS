/* NCSL 2026 State Partisan Composition, updated October 6, 2026.
 * Manually transcribed snapshot of publicly published NCSL state table.
 * D=Democratic, R=Republican, S=split/divided. Does not describe county
 * government or post-November-2026 election results.
 * For each state: House D/R/other/vacant, Senate D/R/other/vacant,
 * legislative control, governor party, overall state control.
 * Nebraska is unicameral/nonpartisan and its chamber is in the Senate slot.
 */
(function(root){
 'use strict';
 const rows="AL 29 76 0 0 8 27 0 0 R R R\nAK 14 21 5 0 9 11 0 0 R R R\nAZ 27 33 0 0 13 17 0 0 R D S\nAR 20 79 0 1 6 28 0 1 R R R\nCA 60 19 0 1 30 10 0 0 D D D\nCO 43 22 0 0 23 12 0 0 D D D\nCT 102 49 0 0 25 11 0 0 D D D\nDE 27 14 0 0 15 6 0 0 D D D\nFL 34 82 0 4 12 26 1 1 R R R\nGA 80 99 0 1 22 33 0 1 R R R\nHI 41 10 0 0 22 3 0 0 D D D\nID 9 61 0 0 6 29 0 0 R R R\nIL 78 40 0 0 40 19 0 0 D D D\nIN 30 69 1 0 10 40 0 0 R R R\nIA 33 67 0 0 17 32 0 1 R R R\nKS 37 88 0 0 9 31 0 0 R D S\nKY 20 80 0 0 6 32 0 0 R D S\nLA 32 72 0 1 10 28 0 1 R R R\nME 75 73 3 0 20 14 1 0 S D S\nMD 102 39 0 0 34 13 0 0 D D D\nMA 131 25 1 3 35 5 0 0 D D D\nMI 52 58 0 0 20 18 0 0 S D S\nMN 67 66 0 1 34 33 0 0 S D S\nMS 41 77 2 2 18 34 0 0 R R R\nMO 52 105 0 6 10 23 0 1 R R R\nMT 42 58 0 0 18 32 0 0 R R R\nNE 0 0 0 0 0 0 49 0 Nonpartisan R N/A\nNV 27 15 0 0 13 8 0 0 D R S\nNH 169 212 1 18 8 16 0 0 R R R\nNJ 57 23 0 0 25 15 0 0 D D D\nNM 42 26 0 2 26 16 0 0 D D D\nNY 103 47 0 0 40 22 0 1 D D D\nNC 47 71 2 0 20 29 0 1 R D S\nND 11 83 0 0 5 42 0 0 R R R\nOH 34 65 0 0 9 23 0 1 R R R\nOK 19 81 0 1 8 40 0 0 R R R\nOR 37 23 0 0 18 12 0 0 D D D\nPA 102 100 0 1 23 27 0 0 S D S\nRI 64 10 1 0 34 4 0 0 D D D\nSC 35 89 0 0 12 34 0 0 R R R\nSD 5 65 0 0 3 32 0 0 R R R\nTN 24 75 0 0 6 27 0 0 R R R\nTX 62 87 0 1 12 18 0 1 R R R\nUT 14 61 0 0 6 22 1 0 R R R\nVT 87 55 8 0 16 13 1 0 D R S\nVA 63 36 0 1 21 19 0 0 D D D\nWA 59 39 0 0 30 19 0 0 D D D\nWV 9 91 0 0 2 32 0 0 R R R\nWI 45 54 0 0 15 18 0 0 R D S\nWY 6 56 0 0 2 29 0 0 R R R";
 const states={};
 for(const line of rows.split('\n')){
  const [abbr,hd,hr,ho,hv,sd,sr,so,sv,legislature,governor,stateControl]=line.split(' ');
  const house={dem:Number(hd),rep:Number(hr),other:Number(ho),vacant:Number(hv)};
  const senate={dem:Number(sd),rep:Number(sr),other:Number(so),vacant:Number(sv)};
  states[abbr]=Object.freeze({house:Object.freeze(house),senate:Object.freeze(senate),legislature,governor,stateControl});
 }
 root.POLITICS_NCSL=Object.freeze({
  asOf:'2026-10-06',
  source:'National Conference of State Legislatures (NCSL)',
  sourceUrl:'https://www.ncsl.org/about-state-legislatures/state-partisan-composition',
  caveat:'Party counts are published snapshots, not official results of the next election. Coalition arrangements may differ from numerical control.',
  states:Object.freeze(states)
 });
})(typeof window!=='undefined'?window:globalThis);

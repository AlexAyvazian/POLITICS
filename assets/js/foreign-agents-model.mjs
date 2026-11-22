export const CONTINENTS=Object.freeze([
 {slug:'north-america',name:'North America',asset:'assets/img/foreign-agents/north-america.webp',glow:'#68C8FF',
  countries:['CA','US','MX','GL']},
 {slug:'south-america',name:'South America',asset:'assets/img/foreign-agents/south-america.webp',glow:'#FF5A4A',
  countries:['AR','BO','BR','CL','CO','EC','FK','GF','GY','PY','PE','SR','UY','VE',
   'BZ','CR','SV','GT','HN','NI','PA',
   'AI','AG','AW','BS','BB','BQ','VG','KY','CU','CW','DM','DO','GD','GP','HT','JM','MQ','MS','PR','BL','KN','LC','MF','VC','SX','TT','TC','VI']},
 {slug:'europe',name:'Europe',asset:'assets/img/foreign-agents/europe.webp',glow:'#D88BFF',
  countries:['AL','AD','AM','AT','BY','BE','BA','BG','HR','CY','CZ','DK','EE','FI','FR','GE','DE','GR','HU','IS','IE','IT',
   'XK','LV','LI','LT','LU','MT','MD','MC','ME','NL','MK','NO','PL','PT','RO','RU','SM','RS','SK','SI','ES','SE','CH','UA','GB','VA']},
 {slug:'asia',name:'Asia',asset:'assets/img/foreign-agents/asia.webp',glow:'#FFB64D',
  countries:['AF','AZ','BH','BD','BT','BN','KH','CN','HK','IN','ID','IR','IQ','IL','JP','JO','KZ','KW','KG','LA','LB','MO','MY','MV','MN','MM',
   'NP','KP','OM','PK','PS','PH','QA','RU','SA','SG','KR','LK','SY','TW','TJ','TH','TL','TR','TM','AE','UZ','VN','YE']},
 {slug:'africa',name:'Africa',asset:'assets/img/foreign-agents/africa.webp',glow:'#E5B96B',
  countries:['DZ','AO','BJ','BW','BF','BI','CV','CM','CF','TD','KM','CD','CG','CI','DJ','EG','GQ','ER','SZ','ET','GA','GM','GH','GN','GW','KE',
   'LS','LR','LY','MG','MW','ML','MR','MU','MA','MZ','NA','NE','NG','RW','ST','SN','SC','SL','SO','ZA','SS','SD','TZ','TG','TN','UG','ZM','ZW','EH']},
 {slug:'oceania',name:'Oceania',asset:'assets/img/foreign-agents/oceania.webp',glow:'#7BE69A',
  countries:['AU','FJ','KI','MH','FM','NR','NZ','PW','PG','WS','SB','TO','TV','VU','NC','PF','GU','MP','AS']}
]);

export function continentForCountry(iso2){
 const iso=String(iso2||'').toUpperCase();
 return CONTINENTS.filter(c=>c.countries.includes(iso)).map(c=>c.slug);
}
export function continentBySlug(slug){
 return CONTINENTS.find(c=>c.slug===slug)||null;
}
export function flagAsset(iso2){
 const iso=String(iso2||'').toLowerCase();
 return /^[a-z]{2}$/.test(iso)?'assets/img/foreign-agents/flags/'+iso+'.svg':null;
}

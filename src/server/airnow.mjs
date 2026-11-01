/** EPA AirNow current reporting-area AQI observations. No directory records or inferred loss data. */
export const AIRNOW_OBSERVATION_URL='https://www.airnowapi.org/aq/observation/current/ziplatlong/';
const jsonHeaders={'Content-Type':'application/json; charset=utf-8'};
const reply=(body,status=200,ok=false)=>new Response(JSON.stringify(body),{status,headers:{...jsonHeaders,'Cache-Control':ok?'public, max-age=300, s-maxage=1800':'no-store'}});
const str=value=>typeof value==='string'?(value.trim()||null):typeof value==='number'&&Number.isFinite(value)?String(value):null;
const toAqi=row=>{
 const val=row.nowcastAQI??row.NowcastAQI??row.nowCastAQI??row.AQI??row.aqi;
 if(val==null||val==='')return null;
 const num=Number(val);
 return Number.isFinite(num)&&num>=0?num:null;
};
export function normalizeAirNowRows(payload){
 if(!Array.isArray(payload))throw new TypeError('Unexpected AirNow response structure');
 return payload.filter(row=>row&&typeof row==='object').map(row=>({
  pollutant:str(row.parameterName??row.ParameterName??row.parameter),
  aqi:toAqi(row),
  category:str(row.category?.name??row.category?.Name??row.Category?.Name??row.categoryName),
  reportingArea:str(row.reportingArea??row.ReportingArea),
  stateCode:str(row.stateCode??row.StateCode),
  dateObserved:str(row.dateObserved??row.DateObserved),
  hourObserved:str(row.hourObserved??row.HourObserved),
  localTimeZone:str(row.localTimeZone??row.LocalTimeZone),
  siteName:str(row.siteName??row.SiteName)
 }));
}
export async function handleAirNowObservations(request,env,{fetchImpl=fetch,clock=()=>new Date()}={}){
 const zip=new URL(request.url).searchParams.get('zip')||'';
 if(!/^\d{5}$/.test(zip))return reply({error:'Enter a valid five-digit ZIP code.'},400);
 if(!env?.AIRNOW_AQS_API_KEY||typeof env.AIRNOW_AQS_API_KEY!=='string')return reply({error:'AirNow is not configured yet.'},503);
 const url=new URL(AIRNOW_OBSERVATION_URL);
 url.searchParams.set('format','application/json');
 url.searchParams.set('zipcode',zip);
 url.searchParams.set('distance','25');
 url.searchParams.set('API_KEY',env.AIRNOW_AQS_API_KEY);
 let response;
 try{response=await fetchImpl(url.toString(),{headers:{Accept:'application/json'}});}
 catch(_){return reply({error:'AirNow is currently unreachable.'},502);}
 if(!response?.ok)return reply({error:response?.status===429?'AirNow rate limit reached.':'AirNow request failed.'},response?.status===429?503:502);
 let observations;
 try{observations=normalizeAirNowRows(await response.json());}
 catch(_){return reply({error:'AirNow sent an unexpected response.'},502);}
 return reply({
  source:'AirNow (U.S. EPA and participating air-quality agencies)',
  sourceDocumentation:'https://docs.airnowapi.org/webservices',
  dataType:'preliminary current AQI observations',
  scope:'AirNow reporting area, not a countywide or disaster-loss estimate',
  zip,retrievedAt:clock().toISOString(),observations
 },200,true);
}

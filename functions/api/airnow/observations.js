// Cloudflare Pages Function: GET /api/airnow/observations?zip=93720
// Configure the actual API key as AIRNOW_AQS_API_KEY in Cloudflare Pages runtime variables.
import {handleAirNowObservations} from '../../../src/server/airnow.mjs';
export async function onRequestGet({request,env}){
 return handleAirNowObservations(request,env);
}

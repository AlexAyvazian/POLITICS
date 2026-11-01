/* Public read-only AirNow endpoint for the standalone POLITICS Cloudflare Worker.
   The Cloudflare dashboard supplies AIRNOW_AQS_API_KEY as a regular runtime variable. */
import { handleAirNowObservations } from '../src/server/airnow.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};
function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) headers.set(key, value);
  return new Response(response.body, {status: response.status, headers});
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/airnow/observations') {
      return withCors(new Response(JSON.stringify({error: 'Not found'}), {status:404, headers:{'Content-Type':'application/json'}}));
    }
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:cors});
    if (request.method !== 'GET') {
      return withCors(new Response(JSON.stringify({error: 'Method not allowed'}), {status:405, headers:{'Content-Type':'application/json', Allow:'GET, OPTIONS'}}));
    }
    return withCors(await handleAirNowObservations(request, env));
  }
};

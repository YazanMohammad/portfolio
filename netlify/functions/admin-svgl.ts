import type { Config } from '@netlify/functions';
import { adminHandler } from '../../server/handlers';
import { fail, json, notFound } from '../../server/http';
import { searchSvgl } from '../../server/svgl';
import { clientIp, hashIp } from '../../server/ip';
import { reserveSvglSearch } from '../../server/rate-limit';
export default adminHandler(async (req,ctx)=>{
 if(req.method!=='GET') throw notFound();
 const search=new URL(req.url).searchParams.get('search')?.trim()??'';
 if(!search || search.length>100) throw fail('validation','Enter 1 to 100 characters.');
 const reservation=await reserveSvglSearch(hashIp(clientIp(req,ctx)));
 if(!reservation.allowed) throw fail('rate_limited','Too many icon searches. Try again shortly.',{retryAfter:reservation.retryAfter});
 try { return json(await searchSvgl(search)); }
 catch { throw fail('server','Icon search is unavailable. Try again or upload an SVG.'); }
});
export const config: Config = { path: '/api/admin/svgl', method: 'GET' };

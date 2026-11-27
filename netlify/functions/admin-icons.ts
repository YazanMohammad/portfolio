import type { Config } from '@netlify/functions';
import { adminHandler } from '../../server/handlers';
import { fail, json, notFound } from '../../server/http';
import { searchIcons, type IconVariant } from '../../server/icons';
import { checkOrigin } from '../../server/origin';
import { clientIp, hashIp } from '../../server/ip';
import { reserveIconSearch } from '../../server/rate-limit';
export default adminHandler(async (req,ctx)=>{
 if(req.method!=='GET') throw notFound();
 if(req.headers.has('Origin')) checkOrigin(req);
 const params=new URL(req.url).searchParams;
 const search=params.get('search')?.trim()??'';
 const variant=params.get('variant')??'auto';
 if(!['auto','dark','mono','default'].includes(variant)) throw fail('validation','Choose a supported icon variant.');
 if(!search || search.length>100) throw fail('validation','Enter 1 to 100 characters.');
 const reservation=await reserveIconSearch(hashIp(clientIp(req,ctx)));
 if(!reservation.allowed) throw fail('rate_limited','Too many icon searches. Try again shortly.',{retryAfter:reservation.retryAfter});
 try { return json(await searchIcons(search,variant as IconVariant)); }
 catch { throw fail('server','Icon search is unavailable. Try again or upload an SVG.'); }
});
export const config: Config = { path: '/api/admin/icons', method: 'GET' };

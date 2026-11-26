import {it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({settings:vi.fn(),rows:vi.fn()}));
vi.mock('../../db/client',()=>({db:{query:{siteSettings:{findFirst:m.settings}},select:()=>({from:()=>({limit:async()=>[{id:1}],then:(resolve:(v:unknown)=>void)=>Promise.resolve([]).then(resolve)})})}}));
vi.mock('../../server/index',()=>({handle:(fn:unknown)=>fn,json:(v:unknown)=>Response.json(v),notFound:()=>Error(),publicCacheHeaders:()=>({}),toPublicContent:()=>({profile:{name:'Owner'}})}));
import handler from '../../netlify/functions/content';
it('missing settings table falls back and logs only once',async()=>{m.settings.mockRejectedValue(Error('missing table'));const log=vi.spyOn(console,'warn').mockImplementation(()=>{});for(let i=0;i<2;i++){const response=await handler(new Request('https://site.test/api/content'), {} as never);expect(response.status).toBe(200);expect((await response.json()).settings.theme.hue).toBe(73);}expect(log).toHaveBeenCalledTimes(1);log.mockRestore();});

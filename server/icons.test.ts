import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const item=(slug='react',variants=['default','mono','dark'])=>({slug,title:slug==='react'?'React':slug,aliases:['UI library'],categories:['Frontend'],license:'MIT',variants});
const svg='<svg viewBox="0 0 1 1" onload="bad()"><path fill="currentColor"/></svg>';
const registry=(icons=[item()])=>new Response(JSON.stringify({total:icons.length,icons}));
beforeEach(()=>vi.resetModules());afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('uses only fixed registry/icon URLs, searches aliases, defaults dark and sanitises previews',async()=>{
 const f=vi.fn().mockResolvedValueOnce(registry()).mockResolvedValueOnce(new Response(svg));vi.stubGlobal('fetch',f);
 const {searchIcons}=await import('./icons');const icons=await searchIcons('UI library');
 expect(String(f.mock.calls[0][0])).toBe('https://thesvg.org/api/registry.json');
 expect(String(f.mock.calls[1][0])).toBe('https://thesvg.org/icons/react/dark.svg');
 for(const [,options]of f.mock.calls)expect(options).toMatchObject({redirect:'error',signal:expect.any(AbortSignal)});
 expect(icons[0]).toMatchObject({title:'React',slug:'react',variants:['default','mono','dark'],variant:'dark',license:'MIT'});
 expect(icons[0].iconSvg).not.toContain('onload');expect(icons[0].preview).toBe('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(icons[0].iconSvg));
});
it('caches the registry for 24h and supports explicit mono/default variants',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-27T00:00:00Z'));
 const f=vi.fn((url:URL)=>Promise.resolve(String(url).endsWith('registry.json')?registry():new Response(svg)));vi.stubGlobal('fetch',f);
 const {searchIcons}=await import('./icons');const mono=await searchIcons('react','mono');expect(mono[0].iconSvg).toContain('#f4f4f4');expect(mono[0].variant).toBe('mono');
 await searchIcons('react','default');expect(f.mock.calls.filter(([url])=>String(url).endsWith('registry.json'))).toHaveLength(1);
 await vi.advanceTimersByTimeAsync(24*60*60*1000+1);await searchIcons('react');expect(f.mock.calls.filter(([url])=>String(url).endsWith('registry.json'))).toHaveLength(2);
});
it('coalesces concurrent registry misses and caps results and preview concurrency',async()=>{
 let active=0,peak=0,registryCalls=0;
 const f=vi.fn(async(url:URL)=>{
  if(String(url).endsWith('registry.json')){registryCalls++;await new Promise(r=>setTimeout(r,5));return registry(Array.from({length:30},(_,i)=>item('react-'+i)));}
  active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return new Response(svg);
 });vi.stubGlobal('fetch',f);const {searchIcons}=await import('./icons');
 const [first]=await Promise.all([searchIcons('react'),searchIcons('missing')]);expect(first).toHaveLength(24);expect(peak).toBeLessThanOrEqual(4);
 // Cached requests never refetch the manifest. Each request owns a four-worker preview pool.
 await Promise.all([searchIcons('none'),searchIcons('missing')]);expect(registryCalls).toBe(1);
});
it('rejects oversized streamed registries without Content-Length',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(' '.repeat(5*1024*1024+1))));
 const {searchIcons}=await import('./icons');await expect(searchIcons('react')).rejects.toThrow();
});
it('drops oversized icons and never uses manifest URLs or unsafe slugs',async()=>{
 const bad={...item('../evil'),url:'https://evil.test/x.svg'};
 const f=vi.fn().mockResolvedValueOnce(registry([bad,item()])).mockResolvedValueOnce(new Response('<svg>'+' '.repeat(16384)+'</svg>'));vi.stubGlobal('fetch',f);
 const {searchIcons}=await import('./icons');expect(await searchIcons('')).toEqual([]);expect(f).toHaveBeenCalledTimes(2);
 expect(String(f.mock.calls[1][0])).toBe('https://thesvg.org/icons/react/dark.svg');
});
it('times out stalled registry fetches and does not cache failure',async()=>{
 vi.useFakeTimers();const f=vi.fn((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout')))));vi.stubGlobal('fetch',f);
 const {searchIcons}=await import('./icons');const pending=searchIcons('react');const assertion=expect(pending).rejects.toThrow();await vi.advanceTimersByTimeAsync(8001);await assertion;
 f.mockImplementation(()=>Promise.resolve(registry([])));expect(await searchIcons('react')).toEqual([]);expect(f).toHaveBeenCalledTimes(2);
});

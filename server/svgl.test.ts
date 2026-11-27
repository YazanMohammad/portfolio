import { afterEach, expect, it, vi } from 'vitest';
import { searchSvgl } from './svgl';
afterEach(()=>vi.unstubAllGlobals());
const icon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" onload="bad()"><path fill="#fff"/></svg>';
it('uses a fixed API host, dark variant, sanitised data previews and deadline', async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{title:'React',route:{dark:'https://svgl.app/library/react_dark.svg',light:'https://svgl.app/library/react.svg'}}]))).mockResolvedValueOnce(new Response(icon));
 vi.stubGlobal('fetch',fetcher);
 const results=await searchSvgl('https://evil.test/?x=react');
 expect(String(fetcher.mock.calls[0][0])).toBe('https://api.svgl.app/?search=https%3A%2F%2Fevil.test%2F%3Fx%3Dreact');
 expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:'error',signal:expect.any(AbortSignal)});
 expect(String(fetcher.mock.calls[1][0])).toBe('https://svgl.app/library/react_dark.svg');
 expect(results).toEqual([{title:'React',iconSvg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path fill="#fff"/></svg>',preview:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path fill="#fff"/></svg>')}]);
});
it('never fetches arbitrary hosts or redirect targets',async()=>{
 const f=vi.fn().mockResolvedValue(new Response(JSON.stringify([{title:'Evil',route:'https://evil.test/a.svg'},{title:'Evil',route:'https://svgl.app.evil/library/a.svg'},{title:'Evil',route:'http://svgl.app/library/a.svg'}])));
 vi.stubGlobal('fetch',f); expect(await searchSvgl('x')).toEqual([]); expect(f).toHaveBeenCalledTimes(1);
});
it('caps the streamed API response even without Content-Length',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(' '.repeat(262145))));
 await expect(searchSvgl('react')).rejects.toThrow();
});
it('drops oversized icons',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{title:'Big',route:'https://svgl.app/library/big.svg'}]))).mockResolvedValueOnce(new Response('<svg>'+' '.repeat(16384)+'</svg>')));
 expect(await searchSvgl('big')).toEqual([]);
});
it('times out stalled upstream calls',async()=>{
 vi.useFakeTimers();
 vi.stubGlobal('fetch',vi.fn((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout'))))));
 const promise=searchSvgl('react'); const assertion=expect(promise).rejects.toThrow();
 await vi.advanceTimersByTimeAsync(8001); await assertion; vi.useRealTimers();
});

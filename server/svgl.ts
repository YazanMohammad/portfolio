import { sanitizeSvg, SVG_MAX_BYTES, svgDataUri } from '../shared/svg';
export type SvglIcon = { title: string; iconSvg: string; preview: string };
const API_CAP = 256 * 1024;
async function boundedText(url: URL, signal: AbortSignal, cap: number): Promise<string> {
 const response=await fetch(url,{signal,redirect:'error',headers:{Accept:url.hostname==='api.svgl.app'?'application/json':'image/svg+xml'}});
 if(!response.ok || Number(response.headers.get('content-length'))>cap) throw new Error('Icon service response rejected.');
 if(!response.body) throw new Error('Empty icon service response.');
 const reader=response.body.getReader(); const chunks:Uint8Array[]=[]; let size=0;
 try {
  while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>cap) throw new Error('Icon service response too large.'); chunks.push(value); }
 } finally { await reader.cancel().catch(()=>{}); }
 const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks){ bytes.set(chunk,offset); offset+=chunk.length; }
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
function iconUrl(route: unknown): URL | null {
 if(typeof route!=='string') return null;
 try {
  const url=new URL(route);
  return url.origin==='https://svgl.app' && !url.username && !url.password && !url.search && !url.hash && /^\/library\/[\w./-]+\.svg$/.test(url.pathname) ? url : null;
 } catch { return null; }
}
export async function searchSvgl(search: string): Promise<SvglIcon[]> {
 const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),8000);
 try {
  const api=new URL('https://api.svgl.app/'); api.searchParams.set('search',search.slice(0,100));
  const data:unknown=JSON.parse(await boundedText(api,controller.signal,API_CAP));
  if(!Array.isArray(data)) throw new Error('Invalid icon service response.');
  const icons=await Promise.all(data.slice(0,12).map(async(item):Promise<SvglIcon|null>=>{
   if(!item || typeof item.title!=='string') return null;
   const route=typeof item.route==='object' && item.route ? item.route.dark ?? item.route.light : item.route;
   const url=iconUrl(route); if(!url) return null;
   try {
    const iconSvg=sanitizeSvg(await boundedText(url,controller.signal,SVG_MAX_BYTES));
    return {title:item.title.slice(0,100),iconSvg,preview:svgDataUri(iconSvg)};
   } catch { return null; }
  }));
  return icons.filter((icon):icon is SvglIcon=>icon!==null);
 } finally { clearTimeout(timeout); }
}

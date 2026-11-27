import {lightenMonochromeSvg,sanitizeSvg,SVG_MAX_BYTES,svgDataUri} from '../shared/svg';
export type IconVariant = 'auto'|'dark'|'mono'|'default';
type RegistryIcon = {slug:string;title:string;aliases:string[];variants:string[];license:string};
export type IconResult = RegistryIcon & {variant:string;iconSvg:string;preview:string};
const REGISTRY_CAP=5*1024*1024, CACHE_MS=24*60*60*1000;
const TIMEOUT_MS=8000, MAX_RESULTS=24, PREVIEW_CONCURRENCY=4;
let cached:{icons:RegistryIcon[];expiresAt:number}|undefined;
let loading:Promise<RegistryIcon[]>|undefined;
async function boundedText(url: URL,signal:AbortSignal,cap:number):Promise<string>{
 const response=await fetch(url,{signal,redirect:'error',headers:{Accept:url.pathname.endsWith('.json')?'application/json':'image/svg+xml'}});
 if(!response.ok||Number(response.headers.get('content-length'))>cap)throw new Error('Icon service response rejected.');
 if(!response.body)throw new Error('Empty icon service response.');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>cap)throw new Error('Icon service response too large.');chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
async function registry(signal:AbortSignal):Promise<RegistryIcon[]>{
 if(cached&&Date.now()<cached.expiresAt)return cached.icons;
 if(loading)return loading;
 loading=(async()=>{
  const data:unknown=JSON.parse(await boundedText(new URL('https://thesvg.org/api/registry.json'),signal,REGISTRY_CAP));
  if(!data||typeof data!=='object'||!('icons'in data)||!Array.isArray(data.icons))throw new Error('Invalid icon registry.');
  const icons:RegistryIcon[]=[];
  for(const item of data.icons){
   if(!item||typeof item.slug!=='string'||!/^[-a-z0-9]+$/.test(item.slug)||item.slug.length>100||typeof item.title!=='string'||!Array.isArray(item.variants))continue;
   const variants=item.variants.filter((v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9-]+$/.test(v)&&v.length<=50);
   if(!variants.length)continue;
   icons.push({slug:item.slug,title:item.title.trim().slice(0,100),aliases:Array.isArray(item.aliases)?item.aliases.filter((a:unknown):a is string=>typeof a==='string').slice(0,30).map((a:string)=>a.slice(0,100)):[],variants:[...new Set<string>(variants)],license:typeof item.license==='string'?item.license.slice(0,100):'unspecified'});
  }
  cached={icons,expiresAt:Date.now()+CACHE_MS};return icons;
 })();
 try{return await loading;}finally{loading=undefined;}
}
function pickVariant(item:RegistryIcon,preferred:IconVariant):string{
 if(preferred!=='auto'&&item.variants.includes(preferred))return preferred;
 return ['dark','mono','default'].find(v=>item.variants.includes(v))??item.variants[0];
}
export async function searchIcons(search:string,preferred:IconVariant='auto'):Promise<IconResult[]>{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),TIMEOUT_MS);
 try{
  const q=search.trim().toLowerCase(),all=await registry(controller.signal);
  const ranked=all.flatMap(icon=>{
   const fields=[icon.slug,icon.title.toLowerCase(),...icon.aliases.map(a=>a.toLowerCase())];
   if(!fields.some(f=>f.includes(q)))return [];
   const exact=fields.findIndex(f=>f===q),rank=exact>=0?Math.min(exact,2):fields.some(f=>f.startsWith(q))?3:4;
   return [{icon,rank}];
  }).sort((a,b)=>a.rank-b.rank||a.icon.title.localeCompare(b.icon.title)).slice(0,MAX_RESULTS);
  const results:(IconResult|null)[]=new Array(ranked.length).fill(null);let cursor=0;
  await Promise.all(Array.from({length:Math.min(PREVIEW_CONCURRENCY,ranked.length)},async()=>{
   while(cursor<ranked.length){
    const index=cursor++,item=ranked[index].icon,variant=pickVariant(item,preferred);
    // Never use manifest URL fields: both host and path structure are constructed here.
    const url=new URL(`https://thesvg.org/icons/${item.slug}/${variant}.svg`);
    try{
     const source=await boundedText(url,controller.signal,SVG_MAX_BYTES);
     const iconSvg=variant==='mono'?lightenMonochromeSvg(source):sanitizeSvg(source);
     results[index]={...item,variant,iconSvg,preview:svgDataUri(iconSvg)};
    }catch{/* One invalid/oversized icon must not discard other search results. */}
   }
  }));
  return results.filter((r):r is IconResult=>r!==null);
 }finally{clearTimeout(timeout);}
}

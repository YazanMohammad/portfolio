/** Inert XML vector allow-list. Output is canonical/idempotent, standalone SVG and capped too.
 * Only XML's five predefined entities are decoded; DTDs, numeric/custom entities are rejected.
 */
export const SVG_MAX_BYTES = 16 * 1024;
const elements = new Set('svg g path rect circle ellipse line polyline polygon defs linearGradient radialGradient stop clipPath mask use title desc'.split(' '));
const attributes = new Set('viewBox width height x y x1 x2 y1 y2 cx cy r rx ry d points fill fill-rule fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity transform id gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity clip-path clip-rule mask maskUnits maskContentUnits preserveAspectRatio vector-effect color href xlink:href xmlns xmlns:xlink'.split(' '));
const predefined: Record<string,string> = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
function decode(value: string): string {
 return value.replace(/&([^;\s&]*);|&/g, (_match, entity: string | undefined) => {
  if (!entity || !Object.hasOwn(predefined,entity)) throw new Error('SVG custom and numeric entities are not allowed.');
  return predefined[entity];
 });
}
const escapeText = (value: string) => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escapeAttribute = (value: string) => escapeText(value).replace(/"/g,'&quot;');
function checkSize(source: string): void {
 if (new TextEncoder().encode(source).length > SVG_MAX_BYTES) throw new Error('SVG must be at most 16 KB.');
}
export function sanitizeSvg(source: string): string {
 checkSize(source);
 if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(source)) throw new Error('SVG declarations and entities are not allowed.');
 source=source.replace(/<\?xml\s[^?]*\?>/g,'').replace(/<!--[\s\S]*?-->/g,'').trim();
 const stack: {name:string; keep:boolean}[]=[];
 let output='', cursor=0, roots=0;
 const tokens=/<\/?[A-Za-z][^<>]*>/g;
 for (const match of source.matchAll(tokens)) {
  const between=source.slice(cursor,match.index); cursor=match.index!+match[0].length;
  if (/[<>]/.test(between) || (!stack.length && between.trim())) throw new Error('Invalid SVG.');
  const text=decode(between);
  if (stack.length && stack.every(s=>s.keep) && text.trim()) output+=escapeText(text);
  const token=match[0], closing=token.startsWith('</'), selfClosing=token.endsWith('/>');
  const name=/^<\/?([A-Za-z][\w:.-]*)/.exec(token)![1];
  if (closing) {
   if (!/^<\/[\w:.-]+\s*>$/.test(token)) throw new Error('Invalid SVG closing tag.');
   const top=stack.pop(); if(!top || top.name!==name) throw new Error('Invalid SVG nesting.');
   if(top.keep) output+=`</${name}>`;
   continue;
  }
  const root=stack.length===0;
  if(root && (++roots!==1 || name!=='svg')) throw new Error('Use one SVG root.');
  const keep=elements.has(name) && stack.every(s=>s.keep);
  const raw=token.slice(1+name.length, selfClosing?-2:-1);
  let attrs=root?' xmlns="http://www.w3.org/2000/svg"':'', pos=0;
  const seen=new Set<string>(), emitted=new Set<string>();
  // Sticky scans only start at the cursor; long trailing whitespace is consumed once.
  const whitespace=/\s*/y;
  const attribute=/([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
  while(pos<raw.length) {
   whitespace.lastIndex=pos; const space=whitespace.exec(raw)!; const start=whitespace.lastIndex;
   if(start===raw.length) break;
   if(!space[0]) throw new Error('Invalid SVG attribute separator.');
   attribute.lastIndex=start; const a=attribute.exec(raw);
   if(!a) throw new Error('Invalid SVG attribute.');
   pos=attribute.lastIndex;
   const key=a[1], value=decode(a[2]??a[3]).replace(/[\t\n\r]/g,' ');
   if(seen.has(key)) throw new Error('Duplicate SVG attribute.'); seen.add(key);
   if(!attributes.has(key) || /[<>\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) continue;
   // Canonical root namespace cannot be overridden. SVG2 href needs no xlink declaration.
   if(key==='xmlns'||key==='xmlns:xlink') continue;
   const outputKey=key==='xlink:href'?'href':key;
   if(outputKey==='href' && !/^#[\w.-]+$/.test(value)) continue;
   if(/url\s*\(/i.test(value) && !/^url\(#[\w.-]+\)$/.test(value)) continue;
   if(/javascript:|data:|https?:|\/\//i.test(value)) continue;
   if(emitted.has(outputKey)) throw new Error('Duplicate SVG attribute.'); emitted.add(outputKey);
   attrs+=` ${outputKey}="${escapeAttribute(value)}"`;
  }
  if(keep) output+=`<${name}${attrs}${selfClosing?'/':''}>`;
  if(!selfClosing) stack.push({name,keep});
 }
 if(stack.length || roots!==1 || source.slice(cursor).trim()) throw new Error('Invalid SVG.');
 checkSize(output);
 return output;
}
/** Monochrome registry variants inherit a light ink on the site's black background. */
export function lightenMonochromeSvg(source: string): string {
 let cleaned=sanitizeSvg(source).replace(/\b(fill|stroke|stop-color|color)="([^"]*)"/g,(_match,key:string,value:string)=>
  `${key}="${value==='none'||value==='transparent'||value.startsWith('url(')?value:'#f4f4f4'}"`);
 cleaned=cleaned.replace(/^<svg\b([^>]*?)(\/?)>/,(_match,attrs:string,slash:string)=>{
  const fill=/\bfill=/.test(attrs)?'':' fill="#f4f4f4"';
  const color=/\bcolor=/.test(attrs)?'':' color="#f4f4f4"';
  return `<svg${attrs}${fill}${color}${slash}>`;
 });
 return sanitizeSvg(cleaned);
}
export const svgDataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Small XML allow-list, not an HTML cleaner. Unknown subtrees are discarded.
 * Only inert vector primitives and local paint/use references can survive.
 * Kept browser-compatible so the form schema and server enforce the same rules.
 */
export const SVG_MAX_BYTES = 16 * 1024;
const elements = new Set('svg g path rect circle ellipse line polyline polygon defs linearGradient radialGradient stop clipPath mask use title desc'.split(' '));
const attributes = new Set('viewBox width height x y x1 x2 y1 y2 cx cy r rx ry d points fill fill-rule fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity transform id gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity clip-path clip-rule mask maskUnits maskContentUnits preserveAspectRatio vector-effect color href xlink:href xmlns xmlns:xlink'.split(' '));
const escape = (value: string) => value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function sanitizeSvg(source: string): string {
 if (new TextEncoder().encode(source).length > SVG_MAX_BYTES) throw new Error('SVG must be at most 16 KB.');
 if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(source)) throw new Error('SVG declarations and entities are not allowed.');
 source=source.replace(/<\?xml\s[^?]*\?>/g,'').replace(/<!--[\s\S]*?-->/g,'').trim();
 // Entity references are deliberately rejected, not expanded (including in attributes).
 if (/&/.test(source)) throw new Error('SVG entities are not allowed.');
 const stack: {name:string; keep:boolean}[]=[];
 let output='', cursor=0, roots=0;
 const tokens=/<\/?[A-Za-z][^<>]*>/g;
 for (const match of source.matchAll(tokens)) {
  const between=source.slice(cursor,match.index); cursor=match.index!+match[0].length;
  if (/[<>]/.test(between) || (!stack.length && between.trim())) throw new Error('Invalid SVG.');
  if (stack.length && stack.every(s=>s.keep) && between.trim()) output+=escape(between);
  const token=match[0], closing=token.startsWith('</'), selfClosing=token.endsWith('/>');
  const name=/^<\/?([A-Za-z][\w:.-]*)/.exec(token)![1];
  if (closing) {
   if (!/^<\/[\w:.-]+\s*>$/.test(token)) throw new Error('Invalid SVG closing tag.');
   const top=stack.pop(); if(!top || top.name!==name) throw new Error('Invalid SVG nesting.');
   if(top.keep) output+=`</${name}>`;
   continue;
  }
  if(!stack.length && (++roots!==1 || name!=='svg')) throw new Error('Use one SVG root.');
  const keep=elements.has(name) && stack.every(s=>s.keep);
  const raw=token.slice(1+name.length, selfClosing?-2:-1);
  let attrs='', pos=0;
  const seen=new Set<string>();
  const re=/\s+([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for(const a of raw.matchAll(re)) {
   if(raw.slice(pos,a.index).trim()) throw new Error('Invalid SVG attribute.');
   pos=a.index!+a[0].length;
   const key=a[1], value=a[2]??a[3];
   if(seen.has(key)) throw new Error('Duplicate SVG attribute.'); seen.add(key);
   if(!attributes.has(key) || /[<>\x00-\x1f]/.test(value)) continue;
   if(key==='xmlns' && value!=='http://www.w3.org/2000/svg') continue;
   if(key==='xmlns:xlink' && value!=='http://www.w3.org/1999/xlink') continue;
   if((key==='href'||key==='xlink:href') && !/^#[\w.-]+$/.test(value)) continue;
   if(/url\s*\(/i.test(value) && !/^url\(#[\w.-]+\)$/.test(value)) continue;
   if(/javascript:|data:|https?:|\/\//i.test(value) && !key.startsWith('xmlns')) continue;
   attrs+=` ${key}="${escape(value)}"`;
  }
  if(raw.slice(pos).trim()) throw new Error('Invalid SVG attribute.');
  if(keep) output+=`<${name}${attrs}${selfClosing?'/':''}>`;
  if(!selfClosing) stack.push({name,keep});
 }
 if(stack.length || roots!==1 || source.slice(cursor).trim()) throw new Error('Invalid SVG.');
 return output;
}
export const svgDataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

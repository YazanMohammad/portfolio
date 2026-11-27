import { describe, expect, it } from 'vitest';
import { sanitizeSvg, SVG_MAX_BYTES } from './svg';
const ns='xmlns="http://www.w3.org/2000/svg"';
describe('SVG review regressions',()=>{
 it('preserves multi-line path and points values, normalising XML whitespace',()=>{
  const raw='<svg><path d="M0 0\nL1 1\rL2 2\tZ"/><polyline points="0,0\n1,1\t2,2"/></svg>';
  expect(sanitizeSvg(raw)).toBe(`<svg ${ns}><path d="M0 0 L1 1 L2 2 Z"/><polyline points="0,0 1,1 2,2"/></svg>`);
 });
 it.each([
  '<svg><title>Say "hi"</title></svg>',
  '<svg><title>Say &quot;hi&quot; &amp; goodbye</title></svg>',
  `<svg><path id='a"b' d="M0 0"/></svg>`,
  '<svg><use xlink:href="#logo"/></svg>',
  '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#logo"/></svg>',
  '<svg><path d="M0 0\nL1 1"/></svg>',
  '<svg><style>.x{fill:red}</style><path class="x" fill="#fff"/></svg>',
 ])('is idempotent: %s',raw=>{
  const cleaned=sanitizeSvg(raw);expect(sanitizeSvg(cleaned)).toBe(cleaned);
 });
 it('always emits root xmlns and rewrites xlink references to SVG2 href',()=>{
  expect(sanitizeSvg('<svg><use xlink:href="#a"/></svg>')).toBe(`<svg ${ns}><use href="#a"/></svg>`);
 });
 it('canonicalises predefined XML entities without enabling encoded URLs or markup',()=>{
  expect(sanitizeSvg('<svg><title>A &lt;b&gt; &amp; &quot;c&quot;</title><use href="javascript:alert(&quot;x&quot;)"/></svg>'))
   .toBe(`<svg ${ns}><title>A &lt;b&gt; &amp; "c"</title><use/></svg>`);
  expect(()=>sanitizeSvg('<svg><use href="&#x6a;avascript:x"/></svg>')).toThrow();
 });
 it('caps canonical output too, so any accepted icon can be safely saved twice',()=>{
  const source='<svg><path id=\''+'"'.repeat(4000)+'\'/></svg>';
  expect(new TextEncoder().encode(source).length).toBeLessThan(SVG_MAX_BYTES);
  expect(()=>sanitizeSvg(source)).toThrow(/16 KB/);
 });
 it('handles a cap-sized whitespace run without quadratic scanning',()=>{
  const source='<svg'+' '.repeat(16000)+'/>';
  expect(sanitizeSvg(source)).toBe(`<svg ${ns}/>`);
 });
});

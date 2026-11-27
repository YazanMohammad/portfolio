import { describe, expect, it } from "vitest";
import * as svg from "./svg";
const valid = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" d="M0 0h24v24z"/></svg>';
describe('SVG allow-list', () => {
 it('keeps a valid icon and viewBox', () => expect(svg.sanitizeSvg(valid)).toBe(valid));
 it.each(['<script>alert(1)</script>', '<foreignObject><div>bad</div></foreignObject>', '<style>path{fill:url(https://evil)}</style>'])('strips active subtree %s', attack => {
  const cleaned=svg.sanitizeSvg(valid.replace('<path',attack+'<path'));
  expect(cleaned).toBe(valid);
 });
 it.each(['onload="alert(1)"','href="javascript:alert(1)"','xlink:href="https://evil/x"','href="data:image/svg+xml,x"', 'style="fill:url(https://evil)"'])('strips unsafe attribute %s', attack => {
  expect(svg.sanitizeSvg(valid.replace('<path',`<path ${attack}`))).toBe(valid);
 });
 it.each(['<!DOCTYPE svg [<!ENTITY x "oops">]><svg>&x;</svg>','<html/>','<svg/><svg/>','<svg>','<svg>'+ ' '.repeat(16384)+'</svg>'])('rejects invalid or oversized input', input => expect(()=>svg.sanitizeSvg(input)).toThrow());
 it('keeps local gradient references only',()=>expect(svg.sanitizeSvg('<svg viewBox="0 0 1 1"><path fill="url(#a)" stroke="url(https://evil)"/></svg>')).toBe('<svg viewBox="0 0 1 1"><path fill="url(#a)"/></svg>'));
});

import {expect,it} from 'vitest';
import * as svg from './svg';
it('makes monochrome SVGs light without filling transparent or unfilled strokes',()=>{
 const source='<svg viewBox="0 0 10 10" fill="none"><path stroke="currentColor" d="M0 0h10"/><path fill="#000" d="M0 1h10"/></svg>';
 const result=svg.lightenMonochromeSvg(source);
 expect(result).toContain('fill="none"');expect(result).toContain('stroke="#f4f4f4"');expect(result).toContain('fill="#f4f4f4"');expect(result).not.toContain('currentColor');
 expect(svg.sanitizeSvg(result)).toBe(result);expect(svg.lightenMonochromeSvg(result)).toBe(result);
});

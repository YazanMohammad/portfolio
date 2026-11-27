import { expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { seedSkills } from './seed-data';
import fallback from '../src/content/fallback.json';
import { sanitizeSvg } from '../shared/svg';
it('uses a light monochrome Linux silhouette on the black background',()=>{
 const icon=readFileSync('db/seed-icons/linux.svg','utf8');
 expect(icon).toContain('fill="#f4f4f4"');
 expect(icon).not.toMatch(/fill="#000(?:000)?"/i);
});
it('ships real, sanitised SVG seed files and identical offline public fallback',()=>{
 expect(seedSkills.filter(s=>s.iconSvg)).toHaveLength(18);
 for(const skill of seedSkills) {
  const cached=fallback.skills.find(s=>s.name===skill.name) as {iconSvg?:string|null}|undefined;
  expect(cached?.iconSvg).toBe(skill.iconSvg);
  if(skill.iconSvg) expect(sanitizeSvg(skill.iconSvg)).toBe(skill.iconSvg);
 }
 expect(existsSync('db/seed-icons/mcp.svg')).toBe(true);
 expect(readFileSync('db/seed-icons/claude-code.svg','utf8')).toBe(seedSkills.find(s=>s.name==='Claude coding agents')!.iconSvg);
});

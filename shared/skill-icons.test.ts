import { expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { SkillInput } from "./schemas";
import { skillToRow, toSkill } from "../server/mappers";
it('sanitises skill writes and returns database icons',()=>{
 const icon='<svg viewBox="0 0 1 1" onload="bad()"><path d="M0 0"/></svg>';
 const row=skillToRow(SkillInput.parse({name:'Test',category:'Tools',iconSlug:null,iconSvg:icon,isVisible:true,sortOrder:0}));
 expect(row).toHaveProperty('iconSvg','<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>');
 expect(toSkill({...row,id:1}).iconSvg).toBe(row.iconSvg);
});
it('migration 0004 only adds the nullable SVG column',()=>{
 const file=readdirSync('db/migrations').find(f=>/^0004.*sql$/.test(f));
 expect(file).toBeDefined();
 expect(readFileSync(`db/migrations/${file}`,'utf8').trim()).toBe('ALTER TABLE "skills" ADD COLUMN "icon_svg" text;');
});

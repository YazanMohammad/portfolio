import { SectionLabel } from "./SectionLabel";
import icons from "@/content/icons.json";
import { svgDataUri } from "@shared/svg";
import type { PublicContent } from "@shared/index";
import { Dither } from "./Dither";
import { useSiteCopy, useSiteTheme } from "@/lib/site/settings";
function SkillName({skill}:{skill:PublicContent["skills"][number]}) {
  const src=skill.iconSvg ? svgDataUri(skill.iconSvg) : skill.iconSlug && icons.includes(skill.iconSlug) ? `/icons/${skill.iconSlug}.svg` : null;
  return <>{src && <img className="skill-icon" src={src} alt="" width={16} height={16}/>}{skill.name}</>;
}
export function SkillsSection({skills}:{skills:PublicContent["skills"]}) {
  const siteCopy = useSiteCopy();
  const theme = useSiteTheme();
  if(!skills.length) return null;
  const groups = new Map<string, PublicContent["skills"]>();
  for (const skill of skills) groups.set(skill.category, [...(groups.get(skill.category) ?? []), skill]);
  return <section className="section skills-band" id="skills" aria-labelledby="skills-h">
    <div className="wrap editorial-grid"><Dither shape={2} className="section-art" /><div className="section-heading"><p className="eyebrow"><SectionLabel text={siteCopy.skills.sectionLabel}/></p><h2 id="skills-h">{siteCopy.skills.heading}</h2></div></div>
    {theme.marquee && <div className="skills-marquee" aria-hidden="true"><div className="skills-marquee__track">{[0,1].map(copy => <span className="skills-marquee__copy" key={copy}>{skills.map(skill => <span key={skill.id}><SkillName skill={skill}/><i> / </i></span>)}</span>)}</div></div>}
    <div className="wrap editorial-grid"><div className="skills-list">{Array.from(groups,([category,items])=><div className="skills__group" key={category}><h3>{category}</h3><ul>{items.map(skill=><li key={skill.id}><SkillName skill={skill}/></li>)}</ul></div>)}</div></div>
  </section>;
}

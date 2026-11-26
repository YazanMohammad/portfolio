import { SectionLabel } from "./SectionLabel";
import type { PublicContent } from "@shared/index";
import { Dither } from "./Dither";
import { useSiteCopy } from "@/lib/site/settings";
import { formatRange } from "@/lib/site/format";
export function TimelineSection({experience,education}:{experience:PublicContent["experience"];education:PublicContent["education"]}) {
  const siteCopy = useSiteCopy();
  if(!experience.length&&!education.length) return null;
  return <section className="section experience-band" id="experience" aria-labelledby="experience-h"><div className="wrap editorial-grid">
    <Dither shape={1} className="section-art" /><div className="section-heading"><p className="eyebrow"><SectionLabel text={siteCopy.timeline.sectionLabel}/></p><h2 id="experience-h">{siteCopy.timeline.heading}</h2></div>
    <div className="timeline">
    {experience.length>0 && <div className="timeline__group"><h3>{siteCopy.timeline.experience}</h3><ul className="rows">{experience.map(e=>{
      const hasMeta=Boolean(e.company || e.location);
      return <li key={e.id}><p className="rows__date">{formatRange(e.startDate,e.endDate,e.current,siteCopy.dates)}</p><div><h4>{e.position}</h4>{hasMeta && <p className="timeline__meta">{[e.company,e.location].filter(Boolean).join(" / ")}</p>}{e.bullets.length>0 && <ul className="timeline__bullets">{e.bullets.map((b,i)=><li key={i}>{b}</li>)}</ul>}</div></li>;
    })}</ul></div>}
    {education.length>0 && <div className="timeline__group"><h3>{siteCopy.timeline.education}</h3><ul className="rows">{education.map(e=><li key={e.id}><p className="rows__date">{formatRange(e.startDate,e.endDate,false,siteCopy.dates)}</p><div><h4>{e.degree}</h4><p className="timeline__meta">{[e.school,e.location].filter(Boolean).join(" / ")}</p></div></li>)}</ul></div>}
    </div>
  </div></section>;
}

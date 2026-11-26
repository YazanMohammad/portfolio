import { SectionLabel } from "./SectionLabel";
import type { ProjectCard as ProjectCardData } from "@shared/index";
import { Dither } from "./Dither";
import { useSiteCopy } from "@/lib/site/settings";
import { ProjectCard } from "./ProjectCard";
export function WorkSection({projects}:{projects:ProjectCardData[]}) {
  const siteCopy = useSiteCopy();
  if (!projects.length) return null;
  return <section className="section work-section" id="work" aria-labelledby="work-h"><div className="wrap">
    <Dither shape={2} className="section-art" /><div className="section-heading"><p className="eyebrow"><SectionLabel text={siteCopy.work.sectionLabel}/></p><h2 id="work-h">{siteCopy.work.heading}</h2></div>
    <div className="project-index">{projects.map((p,i)=><ProjectCard key={p.id} project={p} index={i} />)}</div>
  </div></section>;
}

import type { ProjectCard } from "@shared/index";
import { fileUrl } from "@/lib/api";
import { ProjectTitle } from "./ProjectTitle";
import { Dither } from "./Dither";
export function ProjectFrame({project,index=0}:{project:ProjectCard;index?:number}) {
  if(project.imageKey) return <div className="project-frame"><img src={fileUrl(project.imageKey)} alt={project.imageAlt ?? project.title} loading="lazy" decoding="async"/></div>;
  const words=project.title.split(/\s+/);
  return <div className={`project-frame type-plate type-plate--${index % 3}`} aria-hidden="true">
    <Dither shape={index % 3} /><span className="type-plate__label" aria-hidden="true">{project.category}</span>
    <span className="type-plate__title" aria-hidden="true">{words.map((word,i)=><span className="type-plate__word" key={i}><ProjectTitle title={word}/>{i<words.length-1 && " "}</span>)}</span>
    <span className="type-plate__foot" aria-hidden="true">{project.technologies[0]}</span>
  </div>;
}

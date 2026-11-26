import { useEffect, useRef, useState } from "react";
import { useSiteTheme } from "@/lib/site/settings";
import { useMedia } from "./Poster";
import { Link } from "wouter";
import type { ProjectCard as ProjectCardData } from "@shared/index";
import { ProjectFrame } from "./ProjectFrame";
import { ProjectLinks } from "./ProjectLinks";
import { ProjectTitle } from "./ProjectTitle";
export function Tags({ items }: { items: string[] }) {
  return items.length ? <ul className="tags">{items.map(t=><li key={t}>{t}</li>)}</ul> : null;
}
export function ProjectText({project}:{project:ProjectCardData}) {
  return <><p className="project-card__cat eyebrow">{project.category}</p><h3><Link href={`/projects/${project.slug}`}><ProjectTitle title={project.title}/></Link></h3><p className="project-summary">{project.summary}</p><Tags items={project.technologies}/><ProjectLinks project={project}/></>;
}
export function ProjectCard({project,index=0}:{project:ProjectCardData;index?:number}) {
  const theme = useSiteTheme();
  const fine = useMedia("(hover: hover) and (pointer: fine)");
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const [hovered, setHovered] = useState(false);
  const [point, setPoint] = useState({x: 0, y: 0});
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return <article onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onPointerMove={event => {
    if (!fine || reduced) return;
    const {clientX, clientY} = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setPoint({x: Math.min(clientX + 32, window.innerWidth - 380), y: Math.min(clientY - 100, window.innerHeight - 300)}));
  }} className="project-entry" id={`project-${project.slug}`}><div className="project-margin"><span className="project-number">{String(index+1).padStart(2,"0")}</span><Tags items={project.technologies}/></div><div className="project-text"><ProjectText project={project}/></div><div className="project-visual"><ProjectFrame project={project} index={index}/></div>{theme.cursorPreview && fine && !reduced && <div className={`cursor-plate${hovered ? " is-visible" : ""}`} aria-hidden="true" style={{transform: `translate3d(${point.x}px, ${point.y}px, 0)`}}><ProjectFrame project={project} index={index}/></div>}</article>;
}

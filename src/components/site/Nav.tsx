import { useEffect, useId, useRef, useState } from "react";
import type { PublicContent } from "@shared/index";

import { useSiteCopy } from "@/lib/site/settings";
import "./site.css";
import "./poster.css";
import { setMotionPaused, useMotionPaused } from "./motion";
export type NavSection = { id: string; label: string };
export function Nav({ sections, name = "" }: { sections: NavSection[]; name?: string; projects?: PublicContent["projects"] }) {
  const siteCopy = useSiteCopy();
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState<string|undefined>();
  const paused=useMotionPaused();
  useEffect(()=>{const shell=document.querySelector(".site-shell");if(paused)shell?.setAttribute("data-motion","paused");else shell?.removeAttribute("data-motion");},[paused]);
  const key=sections.map(s=>s.id).join();
  useEffect(()=>{
    if(typeof IntersectionObserver==="undefined") return;
    const seen=new Map<string,boolean>();
    const observer=new IntersectionObserver(entries=>{
      for(const e of entries) seen.set(e.target.id,e.isIntersecting);
      setActive(sections.find(s=>seen.get(s.id))?.id);
    },{rootMargin:"-30% 0px -60% 0px"});
    for(const s of sections){const el=document.getElementById(s.id);if(el)observer.observe(el);}
    return ()=>observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key]);
  const id=useId();
  const toggle=useRef<HTMLButtonElement>(null);
  return <header className="nav" onKeyDown={e=>{if(e.key==="Escape"){setOpen(false);toggle.current?.focus();}}}><div className="wrap nav__bar">
    <a className="skip-link" href="#top">{siteCopy.skipLink}</a>
    <a className="nav__logo" href="/#top">{name}</a>
    <button ref={toggle} className="nav__toggle" type="button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>{open ? siteCopy.menuClose : siteCopy.menuOpen}</button>
    <button className="nav__pause" type="button" aria-pressed={paused} onClick={()=>setMotionPaused(!paused)}>{paused ? siteCopy.a11y.playMotion : siteCopy.a11y.pauseMotion}</button>
    <nav id={id} className={`nav__links${open ? " is-open" : ""}`} aria-label={siteCopy.mainNavLabel}>
      {sections.map(s=><a key={s.id} href={`#${s.id}`} aria-current={active === s.id ? "location" : undefined} onClick={()=>{if(open)toggle.current?.focus();setOpen(false);setActive(s.id);}}>{s.label}</a>)}
    </nav>
  </div></header>;
}

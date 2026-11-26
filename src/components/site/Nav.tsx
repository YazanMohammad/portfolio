import { useId, useRef, useState } from "react";
import type { PublicContent } from "@shared/index";

import { useSiteCopy } from "@/lib/site/settings";
import "./site.css";
import "./poster.css";
export type NavSection = { id: string; label: string };
export function Nav({ sections, name = "" }: { sections: NavSection[]; name?: string; projects?: PublicContent["projects"] }) {
  const siteCopy = useSiteCopy();
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(sections[0]?.id);
  const id=useId();
  const toggle=useRef<HTMLButtonElement>(null);
  return <header className="nav" onKeyDown={e=>{if(e.key==="Escape"){setOpen(false);toggle.current?.focus();}}}><div className="wrap nav__bar">
    <a className="skip-link" href="#top">{siteCopy.skipLink}</a>
    <a className="nav__logo" href="/#top">{name}</a>
    <button ref={toggle} className="nav__toggle" type="button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>{open ? siteCopy.menuClose : siteCopy.menuOpen}</button>
    <nav id={id} className={`nav__links${open ? " is-open" : ""}`} aria-label={siteCopy.mainNavLabel}>
      {sections.map(s=><a key={s.id} href={`#${s.id}`} aria-current={active === s.id ? "location" : undefined} onClick={()=>{setOpen(false);setActive(s.id);}}>{s.label}</a>)}
    </nav>
  </div></header>;
}

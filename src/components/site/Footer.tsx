import { SectionLabel } from "./SectionLabel";
import type { ReactNode } from "react";
import type { PublicContent } from "@shared/index";
import { Dither } from "./Dither";
import { useSiteCopy } from "@/lib/site/settings";
import { safeHref } from "@/lib/site/safe-href";
export function Footer({profile,contactForm}:{profile:PublicContent["profile"];contactForm?:ReactNode}) {
  const siteCopy = useSiteCopy();
  const github=safeHref(profile.githubUrl), linkedin=safeHref(profile.linkedinUrl), mail=safeHref(`mailto:${profile.email}`,{allowMailto:true});
  return <footer className="footer" id="contact" aria-labelledby="close-h"><div className="wrap">
    <div className="contact-grid"><div><p className="eyebrow"><SectionLabel text={siteCopy.contact.sectionLabel}/></p><h2 id="close-h">{siteCopy.contact.heading}</h2><p className="contact-lead">{siteCopy.contact.lead}</p><span className="contact-arrow" aria-hidden="true">→</span><Dither shape={2} className="section-art footer-art" /></div><div>{contactForm ?? (mail && <a className="text-link" href={mail}>{siteCopy.hero.emailLabel}</a>)}</div></div>
    </div><div className="footer__ink"><div className="wrap footer__legal"><span>{profile.name} / {profile.headline}</span><div className="footer__social">{github && <a href={github}>{siteCopy.footer.github}</a>}{linkedin && <a href={linkedin}>{siteCopy.footer.linkedin}</a>}</div></div>
  </div></footer>;
}

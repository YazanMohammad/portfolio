import { SectionLabel } from "./SectionLabel";
import type { PublicContent } from "@shared/index";
import { Dither } from "./Dither";
import { useSiteCopy } from "@/lib/site/settings";
import { paragraphs } from "@/lib/site/format";
import { PhotoSlot } from "./PhotoSlot";
export function AboutSection({profile}:{profile:PublicContent["profile"]}) {
  const siteCopy = useSiteCopy();
  const text=paragraphs(profile.about); if(!text.length) return null;
  return <section className="section" id="about" aria-labelledby="about-h"><div className="wrap editorial-grid">
    <Dither shape={0} className="section-art" /><div className="section-heading"><p className="eyebrow"><SectionLabel text={siteCopy.about.sectionLabel}/></p><h2 id="about-h">{siteCopy.about.heading}</h2></div>
    <div className="about-copy">{text.map((p,i)=><p key={i}>{p}</p>)}{profile.photoUrl && <PhotoSlot profile={profile} size="about"/>}</div>
  </div></section>;
}

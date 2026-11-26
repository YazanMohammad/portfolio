import { mergeSettings } from "@shared/settings";
import { AboutSection } from "@/components/site/AboutSection";
import { ContactSection } from "@/components/site/ContactSection";
import { Hero } from "@/components/site/Hero";
import { SiteLayout } from "@/components/site/SiteLayout";
import { SkillsSection } from "@/components/site/SkillsSection";
import { TimelineSection } from "@/components/site/TimelineSection";
import { WorkSection } from "@/components/site/WorkSection";
import { sectionsPresent } from "@/lib/site/sections";
import { useSiteContent } from "@/lib/site/use-content";

/** Public editorial page; empty content sections are omitted from the page and index. */
export default function Home() {
  const { content } = useSiteContent();
  const { profile, projects, experience, education, skills } = content;
  const copy = content.settings?.copy ?? mergeSettings().copy;
  const has = sectionsPresent(content);
  return (
    <SiteLayout content={content} contactForm={<ContactSection profile={profile} />}>
      <title>{copy.meta.title}</title>
      <meta name="description" content={copy.meta.description} />
      <Hero profile={profile} projects={projects} />
      {has.work && <WorkSection projects={projects} />}
      {has.skills && <SkillsSection skills={skills} />}
      {has.experience && <TimelineSection experience={experience} education={education} />}
      {has.about && <AboutSection profile={profile} />}
    </SiteLayout>
  );
}

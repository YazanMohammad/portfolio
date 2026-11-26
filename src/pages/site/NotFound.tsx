import { Link } from "wouter";
import { ContactSection } from "@/components/site/ContactSection";
import { SiteLayout, blankLayoutContent } from "@/components/site/SiteLayout";
import { mergeSettings } from "@shared/settings";
import { useSiteContent } from "@/lib/site/use-content";

export default function NotFound({ project = false }: { project?: boolean } = {}) {
  const { content } = useSiteContent();
  const siteCopy = mergeSettings(content.settings).copy;
  const copy = project ? siteCopy.project.notFound : siteCopy.notFound;
  const layoutContent = blankLayoutContent(content);
  return (
    <SiteLayout content={layoutContent} contactForm={<ContactSection profile={content.profile} />}>
      <title>{`${copy.heading} | ${content.profile.name}`}</title>
      <meta name="description" content={copy.line} />
      <section className="section">
        <div className="wrap stack-6">
          <h1>{copy.heading}</h1>
          <p className="measure">{copy.line}</p>
          <Link className="link" href="/">{copy.action}</Link>
        </div>
      </section>
    </SiteLayout>
  );
}

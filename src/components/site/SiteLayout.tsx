
import { useMemo, type ReactNode } from "react";
import type { PublicContent } from "@shared/index";
import { mergeSettings } from "@shared/settings";
import { SiteSettingsContext, themeStyle } from "@/lib/site/settings";
import { sectionsPresent } from "@/lib/site/sections";
import { Footer } from "./Footer";
import { Nav, type NavSection } from "./Nav";

/** Only the sections that will exist on the page, in page order. Contact is always there (the close). */
export function navSections(content: PublicContent, n = mergeSettings(content.settings).copy.nav): NavSection[] {
  const has = sectionsPresent(content);
  const list: (NavSection | false)[] = [
    has.work && { id: "work", label: n.work },
    has.skills && { id: "skills", label: n.skills },
    has.experience && { id: "experience", label: n.experience },
    has.about && { id: "about", label: n.about },
    { id: "contact", label: n.contact },
  ];
  return list.filter((s): s is NavSection => s !== false);
}

/** Content for pages that show only the close (Project, NotFound): no section links beyond Contact. */
export function blankLayoutContent(content: PublicContent): PublicContent {
  return { ...content, projects: [], experience: [], education: [], skills: [], profile: { ...content.profile, about: "" } };
}

export function SiteLayout({
  children,
  content,
  contactForm,
}: {
  children: ReactNode;
  content: PublicContent;
  /** The existing contact form is shared by the public routes. */
  contactForm?: ReactNode;
}) {
  const settings = useMemo(()=>mergeSettings(content.settings),[content.settings]);
  const sections = navSections(content, settings.copy.nav);
  return (
    <SiteSettingsContext.Provider value={settings}><div className="site-shell" style={themeStyle(settings.theme)} data-name-reveal={settings.theme.nameReveal} data-cursor-preview={settings.theme.cursorPreview}>{settings.theme.grid && <div className="drawing-grid" aria-hidden="true" />}
      <Nav sections={sections} name={content.profile.name} projects={content.projects} />
      <main id="top" tabIndex={-1}>{children}</main>
      <Footer profile={content.profile} contactForm={contactForm} />
    </div></SiteSettingsContext.Provider>
  );
}

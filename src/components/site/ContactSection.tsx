import type { PublicContent } from "@shared/index";
import { useSiteCopy } from "@/lib/site/settings";
import { safeHref } from "@/lib/site/safe-href";
import { ContactForm } from "./ContactForm";

/** Content for Footer.contactForm; the footer owns the only #contact anchor.
 * <Footer profile={profile} contactForm={<ContactSection profile={profile} />} />
 * Footer owns the contact heading, lead and the only #contact anchor.
 */
export function ContactSection({ profile }: { profile: PublicContent["profile"] }) {
  const siteCopy = useSiteCopy();
  const mailHref = safeHref(`mailto:${profile.email}`, { allowMailto: true });
  return (
    <div className="stack-6">
      <ContactForm />
      {mailHref && <p>{siteCopy.contact.emailPrefix} <a href={mailHref}>{profile.email}</a></p>}
    </div>
  );
}

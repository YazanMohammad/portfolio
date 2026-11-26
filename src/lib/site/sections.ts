import type { PublicContent } from "@shared/index";

/** Which home sections have content. One definition for the nav and the page, so they cannot drift. */
export function sectionsPresent(content: PublicContent) {
  return {
    work: content.projects.length > 0,
    experience: content.experience.length + content.education.length > 0,
    skills: content.skills.length > 0,
    about: content.profile.about.trim().length > 0,
  };
}

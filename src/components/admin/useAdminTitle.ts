import { createElement } from "react";

const TITLES: [string, string][] = [
  ["/admin/dashboard", "Dashboard"],
  ["/admin/site-text", "Site text"],
  ["/admin/look", "Look"],
  ["/admin/account", "Account"],
  ["/admin/profile", "Profile"],
  ["/admin/projects", "Projects"],
  ["/admin/experience", "Experience"],
  ["/admin/education", "Education"],
  ["/admin/skills", "Skills"],
  ["/admin/messages", "Messages"],
];

/** "Projects · Admin" for a known admin path, plain "Admin" otherwise. */
export function adminTitleFor(path: string): string {
  const hit = TITLES.find(([to]) => path === to || path.startsWith(`${to}/`));
  return hit ? `${hit[1]} · Admin` : "Admin";
}

/** Share React's declarative title ownership with the public pages. */
export function AdminTitle({ title }: { title: string }) {
  return createElement("title", null, title);
}

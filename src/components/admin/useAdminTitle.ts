import { useEffect } from "react";

const TITLES: [string, string][] = [
  ["/admin/dashboard", "Dashboard"],
  ["/admin/site-text", "Site text"],
  ["/admin/look", "Look"],
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

/** Sets document.title while mounted and restores the previous title on unmount. */
export function useAdminTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

import {
  Briefcase,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Mail,
  Sparkles,
  User,
  Type,
  type LucideIcon,
} from "lucide-react";
import { useLocation } from "wouter";
import { GuardedLink, usePageDirty } from "@/lib/admin/unsaved";
import { cn } from "@/lib/utils";

const ITEMS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/site-text", label: "Site text", icon: Type },
  { to: "/admin/look", label: "Look", icon: Sparkles },
  { to: "/admin/profile", label: "Profile", icon: User },
  { to: "/admin/projects", label: "Projects", icon: FolderKanban },
  { to: "/admin/experience", label: "Experience", icon: Briefcase },
  { to: "/admin/education", label: "Education", icon: GraduationCap },
  { to: "/admin/skills", label: "Skills", icon: Sparkles },
  { to: "/admin/messages", label: "Messages", icon: Mail },
];

export function AdminNav({
  unreadCount = 0,
  onNavigate,
  tall = false,
}: {
  unreadCount?: number;
  onNavigate?: () => void;
  tall?: boolean;
}) {
  const [location] = useLocation();
  const dirty = usePageDirty();
  return (
    <nav aria-label="Admin" className="flex flex-col gap-1 p-2">
      {[ITEMS[0], ...ITEMS.slice(3,8), ...ITEMS.slice(1,3), ITEMS[8]].map(({ to, label, icon: Icon }) => {
        const current = location === to || location.startsWith(`${to}/`);
        const unread = to === "/admin/messages" && unreadCount > 0;
        return (
          <div key={to}>
          {to === "/admin/profile" && <p className="admin-nav-group">Content</p>}
          {to === "/admin/site-text" && <p className="admin-nav-group">Site</p>}
          {to === "/admin/messages" && <p className="admin-nav-group">Inbox</p>}
          <GuardedLink
            to={to}
            aria-current={current ? "page" : undefined}
            aria-label={unread ? `${label}, ${unreadCount} unread` : undefined}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 text-sm text-muted-foreground",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tall ? "min-h-11" : "h-9",
              current && "bg-muted font-medium text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {current && dirty && <span className="admin-dirty-dot" role="img" aria-label={`${label} has unsaved changes`} />}
            {unread && (
              <span
                aria-hidden="true"
                className="min-w-5 rounded-full bg-primary px-1.5 text-center text-xs font-medium text-primary-foreground"
              >
                {unreadCount}
              </span>
            )}
          </GuardedLink></div>
        );
      })}
    </nav>
  );
}

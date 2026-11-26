import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { disableKit } from "@/lib/admin/kit";
import { useAdminSummary, useLogout } from "@/lib/admin/queries";
import { UnsavedProvider, useGuardedAction } from "@/lib/admin/unsaved";
import { AdminNav } from "./AdminNav";
import { adminTitleFor, AdminTitle } from "./useAdminTitle";
import { adminAccentText } from "@/lib/admin/accent-text";

import { mergeSettings, derivePalette, type AdminSettings } from "@shared/settings";
import { apiGet } from "@/lib/api";
import "./admin.css";

const MOBILE_QUERY = "(max-width: 767px)";

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

function Shell({ children }: { children: ReactNode }) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const summary = useAdminSummary();
  const logout = useLogout();
  const guarded = useGuardedAction();
  const unread = summary.data?.unreadCount ?? 0;
  const settings = useQuery({queryKey:["admin","settings"],queryFn:()=>apiGet<AdminSettings>("/api/admin/settings"),retry:false});
  const hue = mergeSettings(settings.data).theme.hue;
  const palette = derivePalette(hue);
  const accentText = adminAccentText(hue);
  useEffect(()=>{
    document.body.classList.add("admin-active");
    document.body.style.setProperty("--admin-accent",palette.accent);
    document.body.style.setProperty("--admin-on-accent",palette.onAccent);
    document.body.style.setProperty("--admin-accent-text",accentText);
    return ()=>{document.body.classList.remove("admin-active");for(const v of ["--admin-accent","--admin-on-accent","--admin-accent-text"])document.body.style.removeProperty(v);};
  },[palette.accent,palette.onAccent,accentText]);

  useEffect(() => {
    disableKit();
  }, []);

  const doLogout = () =>
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        navigate("/admin");
      },
    });

  return (
    <div className="admin-shell flex min-h-screen bg-background font-sans text-sm text-foreground">
      <AdminTitle title={adminTitleFor(location)} />
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      {!mobile && (
        <aside className="admin-sidebar sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border md:flex">
          <div className="flex h-12 items-center border-b border-border px-4 font-medium"><span className="admin-brand-mark" />Portfolio<span className="admin-brand-meta">/ EDIT</span></div>
          <AdminNav unreadCount={unread} />
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="admin-topbar flex h-12 items-center gap-2 border-b border-border px-4">
          {mobile && (
            <>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="size-11" aria-label="Open menu">
                  <Menu className="size-4" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="admin-drawer w-72 gap-0 p-0 shadow-none">
                <SheetTitle className="flex h-12 items-center border-b border-border px-4 text-sm font-medium">
                  Admin
                </SheetTitle>
                <SheetDescription className="sr-only">Admin navigation</SheetDescription>
                <AdminNav unreadCount={unread} tall onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="admin-brand-inline"><span className="admin-brand-mark" aria-hidden="true" />Portfolio</span>
            </>
          )}
          <p className="admin-last-saved">Last saved <time>{summary.data?.lastSavedAt ? new Date(summary.data.lastSavedAt).toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "—"}</time></p>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" className={mobile ? "min-h-11" : "h-9"}>
              <a href="/" target="_blank" rel="noopener">
                <span>View site<span className="sr-only"> (opens in new tab)</span></span>
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            </Button>
            <Button
              variant="outline"
              className={mobile ? "min-h-11" : "h-9"}
              disabled={logout.isPending}
              onClick={() => guarded(doLogout)}
            >
              <LogOut className="size-4" aria-hidden="true" />
              Log out
            </Button>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="admin-main flex-1 p-4 md:p-6">
          {children}
        </main>
        <div id="admin-save-slot" className="admin-save-slot"/>
      </div>
    </div>
  );
}

export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <UnsavedProvider>
      <Shell>{children}</Shell>
      <Toaster />
    </UnsavedProvider>
  );
}

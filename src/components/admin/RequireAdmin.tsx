import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuthMe } from "@/lib/admin/queries";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const me = useAuthMe();
  const [, navigate] = useLocation();
  const wasAuthenticated = me.dataUpdatedAt > 0;
  const lost = (me.error as { status?: number } | null)?.status === 401;
  // First-load failure of any kind, or a 401 on a later refetch, denies access.
  const denied = me.isError && (!wasAuthenticated || lost);
  const target = wasAuthenticated ? "/admin?expired=1" : "/admin";

  useEffect(() => {
    if (denied) navigate(target);
  }, [denied, target, navigate]);

  if (!me.data || denied) return null;
  return <>{children}</>;
}

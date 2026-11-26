import { QueryClientProvider } from "@tanstack/react-query";
import { render, act, type RenderResult } from "@testing-library/react";
import { useSyncExternalStore, type ReactElement } from "react";
import { Router } from "wouter";
import { makeQueryClient } from "@/lib/admin/queries";

export function renderWithProviders(
  ui: ReactElement,
  { path = "/" }: { path?: string } = {},
): RenderResult & { navigate: (to: string) => void; location: () => string } {
  // Full location (path + query string) lives outside React so non-React code can navigate.
  let current = path;
  const listeners = new Set<() => void>();
  const navigate = (to: string) => {
    current = to;
    act(() => listeners.forEach((l) => l()));
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => void listeners.delete(l);
  };
  const routerHook = () => {
    const full = useSyncExternalStore(subscribe, () => current);
    return [full.split("?")[0], navigate] as [string, (to: string) => void];
  };
  const searchHook = () => {
    const full = useSyncExternalStore(subscribe, () => current);
    const i = full.indexOf("?");
    return i === -1 ? "" : full.slice(i + 1);
  };
  const queryClient = makeQueryClient(navigate);
  const result = render(
    <QueryClientProvider client={queryClient}>
      <Router hook={routerHook} searchHook={searchHook}>
        {ui}
      </Router>
    </QueryClientProvider>,
  );
  return { ...result, navigate, location: () => current };
}

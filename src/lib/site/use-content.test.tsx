import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PublicContent } from "@shared/index";
import fallback from "@/content/fallback.json";
import { makeApiError } from "@/test/utils";

const calls: string[] = [];
let impl: () => Promise<unknown> = () => new Promise(() => {});
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  // A plain function, not vi.fn(): vitest's call tracking leaves rejected promises unhandled.
  apiGet: (path: string) => { calls.push(path); return impl(); },
}));
import { useProject, useSiteContent } from "./use-content";

const snapshot = fallback as unknown as PublicContent;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => { calls.length = 0; });

describe("useSiteContent", () => {
  it("reuses merged settings across unrelated renders",async()=>{
    impl=()=>Promise.resolve(snapshot);const {wrapper}=setup();
    const {result,rerender}=renderHook(()=>useSiteContent(),{wrapper});
    await waitFor(()=>expect(result.current.source).toBe("api"));
    const settings=result.current.content.settings;rerender();
    expect(result.current.content.settings).toBe(settings);
  });
  it("uses the API content", async () => {
    const api = { ...snapshot, profile: { ...snapshot.profile, name: "From API" } };
    impl = () => Promise.resolve(api);
    const { wrapper, client } = setup();
    const { result } = renderHook(() => useSiteContent(), { wrapper });
    await waitFor(() => expect(result.current.source).toBe("api"));
    expect(result.current.content.profile.name).toBe("From API");
    expect(client.getQueryData(["content"])).toEqual(api);
    expect(calls).toContain("/api/content");
  });

  it("falls back on error", async () => {
    impl = () => Promise.reject(makeApiError({ status: 500 }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useSiteContent(), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false), { timeout: 4000 });
    expect(result.current.source).toBe("fallback");
    expect(result.current.content.profile.name).toBe("Yazan Mohammad");
  });

  it("shows the snapshot while pending", () => {
    impl = () => new Promise(() => {});
    const { wrapper } = setup();
    const { result } = renderHook(() => useSiteContent(), { wrapper });
    expect(result.current.isPending).toBe(true);
    expect(result.current.source).toBe("fallback");
    expect(result.current.content).toEqual(snapshot);
  });
});

describe("useProject", () => {
  it("uses the key [project, slug]", async () => {
    impl = () => Promise.resolve({ slug: "x" });
    const { wrapper, client } = setup();
    const { result } = renderHook(() => useProject("x"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(["project", "x"])).toEqual({ slug: "x" });
  });
});

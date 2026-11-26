import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { PublicContent, PublicProject } from "@shared/index";
import { apiGet, ApiRequestError } from "@/lib/api";
import { mergeSettings } from "@shared/settings";
import fallbackJson from "@/content/fallback.json";

const fallback = fallbackJson as unknown as PublicContent;

/** One retry for network errors and 5xx; a 4xx (404, 429) is an answer, so it is not retried. The admin client keeps retry off. */
function retryOnce(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  return !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500);
}

/** Always returns renderable content: the API's while it works, the build-time snapshot otherwise. */
export function useSiteContent(): { content: PublicContent; source: "api" | "fallback"; isPending: boolean } {
  const { data, isPending } = useQuery({
    queryKey: ["content"],
    queryFn: () => apiGet<PublicContent>("/api/content"),
    staleTime: 60_000,
    retry: retryOnce,
  });
  const content = data ?? fallback;
  const resolved = useMemo(()=>({...content, settings:mergeSettings(content.settings)}),[content]);
  return { content: resolved, source: data ? "api" : "fallback", isPending };
}

export function useProject(slug: string): UseQueryResult<PublicProject, ApiRequestError> {
  return useQuery<PublicProject, ApiRequestError>({
    queryKey: ["project", slug],
    queryFn: () => apiGet<PublicProject>(`/api/projects/${encodeURIComponent(slug)}`),
    staleTime: 60_000,
    retry: retryOnce,
  });
}

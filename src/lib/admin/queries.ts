import {
  MutationCache,
  QueryCache,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { navigate as browserNavigate } from "wouter/use-browser-location";
import { apiGet, apiSend, ApiRequestError } from "@/lib/api";
import type {
  AdminSummary,
  Collection,
  Message,
  MessagePatch,
  Profile,
  ProfileInput,
  AccountInput,
} from "@shared/index";

export type { Collection };
export type MessageStatus = "unread" | "all" | "archived";

type Navigate = (to: string) => void;

const authKey = ["auth", "me"] as const;
const summaryKey = ["admin", "summary"] as const;

/** Global 401 handler: marks the session as lost and sends the user to the login page. */
export function handleAuthLost(client: QueryClient, err: unknown, navigate: Navigate = browserNavigate) {
  if (!(err instanceof ApiRequestError) || err.status !== 401) return;
  client.getQueryCache().find({ queryKey: authKey })?.setState({
    status: "error",
    error: err,
    data: undefined,
    fetchStatus: "idle",
  });
  navigate("/admin?expired=1");
}

export function makeQueryClient(navigate: Navigate = browserNavigate): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (err, query) => {
        // The guard handles a failing auth check itself (redirect to /admin).
        if (query.queryKey[0] === "auth") return;
        handleAuthLost(client, err, navigate);
      },
    }),
    mutationCache: new MutationCache({
      onError: (err, _vars, _ctx, mutation) => {
        if (mutation.options.mutationKey?.[0] === "login") return;
        // A wrong current password on the Account page is a 401 too, but the session is fine.
        if (mutation.options.mutationKey?.[0] === "account" && err instanceof ApiRequestError && err.fields?.currentPassword) return;
        handleAuthLost(client, err, navigate);
      },
    }),
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
  return client;
}

export function useAuthMe() {
  return useQuery({
    queryKey: authKey,
    queryFn: () => apiGet<{ authenticated: true }>("/api/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
}

export function useAdminSummary() {
  return useQuery({
    queryKey: summaryKey,
    queryFn: () => apiGet<AdminSummary>("/api/admin/summary"),
    refetchInterval: 60_000,
  });
}

export function useAdminProfile() {
  return useQuery({
    queryKey: ["admin", "profile"],
    queryFn: () => apiGet<Profile>("/api/admin/profile"),
  });
}

function useAfterWrite() {
  const qc = useQueryClient();
  return (keys: QueryKey[]) =>
    Promise.all([...keys, summaryKey].map((queryKey) => qc.invalidateQueries({ queryKey })));
}

export function useSaveProfile() {
  const after = useAfterWrite();
  return useMutation<Profile, ApiRequestError, ProfileInput>({
    mutationFn: (input) => apiSend<Profile>("PUT", "/api/admin/profile", input),
    onSuccess: () => after([["admin", "profile"], ["content"]]),
  });
}

export function useAdminList<T>(c: Collection) {
  return useQuery({
    queryKey: ["admin", c],
    queryFn: () => apiGet<T[]>(`/api/admin/${c}`),
  });
}

function contentKeys(c: Collection, slugs: unknown[] = []): QueryKey[] {
  const keys: QueryKey[] = [["admin", c], ["content"]];
  if (c === "projects") {
    for (const s of new Set(slugs)) if (typeof s === "string") keys.push(["project", s]);
  }
  return keys;
}

export function useSaveItem<T, I>(c: Collection) {
  const after = useAfterWrite();
  const qc = useQueryClient();
  return useMutation<T, ApiRequestError, { id?: number; input: I }>({
    mutationFn: ({ id, input }) =>
      id === undefined
        ? apiSend<T>("POST", `/api/admin/${c}`, input)
        : apiSend<T>("PUT", `/api/admin/${c}/${id}`, input),
    onSuccess: (saved, { id, input }) => {
      const slugs: unknown[] = [(saved as { slug?: unknown } | undefined)?.slug, (input as { slug?: unknown }).slug];
      if (c === "projects" && id !== undefined) {
        // Old slug too: a rename must purge the previous project page.
        const old = qc.getQueryData<{ id: number; slug: string }[]>(["admin", c])?.find((p) => p.id === id);
        slugs.push(old?.slug);
      }
      return after(contentKeys(c, slugs));
    },
  });
}

export function useDeleteItem(c: Collection) {
  const after = useAfterWrite();
  const qc = useQueryClient();
  return useMutation<void, ApiRequestError, { id: number }>({
    mutationFn: ({ id }) => apiSend<void>("DELETE", `/api/admin/${c}/${id}`),
    onSuccess: (_d, { id }) => {
      const old = qc.getQueryData<{ id: number; slug?: string }[]>(["admin", c])?.find((p) => p.id === id);
      return after(contentKeys(c, [old?.slug]));
    },
  });
}

export function useReorder(c: Collection) {
  const after = useAfterWrite();
  const qc = useQueryClient();
  const key = ["admin", c];
  return useMutation<void, ApiRequestError, { ids: number[] }, { previous?: { id: number }[] }>({
    mutationFn: ({ ids }) => apiSend<void>("PUT", `/api/admin/${c}/order`, { ids }),
    onMutate: async ({ ids }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ id: number }[]>(key);
      if (previous) {
        const byId = new Map(previous.map((i) => [i.id, i]));
        // Keep `sortOrder` in step with the new position so lists sorted by it show the new order.
        const ordered = ids
          .map((id) => byId.get(id))
          .filter((i): i is { id: number } => !!i)
          .map((i, n) => ("sortOrder" in i ? { ...i, sortOrder: n } : i));
        const rest = previous.filter((i) => !ids.includes(i.id));
        qc.setQueryData(key, [...ordered, ...rest]);
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: () => after(contentKeys(c)),
  });
}

export function useAdminMessages(status: MessageStatus) {
  return useQuery({
    queryKey: ["admin", "messages", status],
    queryFn: () => apiGet<Message[]>(`/api/admin/messages?status=${status}`),
  });
}

export function usePatchMessage() {
  const after = useAfterWrite();
  return useMutation<Message, ApiRequestError, { id: number; patch: MessagePatch }>({
    mutationFn: ({ id, patch }) => apiSend<Message>("PATCH", `/api/admin/messages/${id}`, patch),
    onSuccess: () => after([["admin", "messages"]]),
  });
}

export function useDeleteMessage() {
  const after = useAfterWrite();
  return useMutation<void, ApiRequestError, { id: number }>({
    mutationFn: ({ id }) => apiSend<void>("DELETE", `/api/admin/messages/${id}`),
    onSuccess: () => after([["admin", "messages"]]),
  });
}

const accountKey = ["admin", "account"] as const;

export function useAdminAccount() {
  return useQuery({ queryKey: accountKey, queryFn: () => apiGet<{ username: string | null }>("/api/admin/account") });
}

export function useSaveAccount() {
  const qc = useQueryClient();
  return useMutation<{ username: string }, ApiRequestError, AccountInput>({
    mutationKey: ["account"],
    mutationFn: (input) => apiSend<{ username: string }>("PUT", "/api/admin/account", input),
    onSuccess: (saved) => { qc.setQueryData(accountKey, saved); },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation<void, ApiRequestError, { username: string; password: string }>({
    mutationKey: ["login"],
    mutationFn: ({ username, password }) => apiSend<void>("POST", "/api/auth/login", { username, password }),
    onSuccess: () => qc.invalidateQueries({ queryKey: authKey }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation<void, ApiRequestError, void>({
    mutationFn: () => apiSend<void>("POST", "/api/auth/logout"),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["admin"] });
      qc.removeQueries({ queryKey: authKey });
    },
  });
}

import type { Context } from "@netlify/functions";
import adminSvgl from "../../netlify/functions/admin-svgl";
import adminAccount from "../../netlify/functions/admin-account";
import adminCollection from "../../netlify/functions/admin-collection";
import adminFiles from "../../netlify/functions/admin-files";
import adminMessages from "../../netlify/functions/admin-messages";
import adminSettings from "../../netlify/functions/admin-settings";
import adminProfile from "../../netlify/functions/admin-profile";
import adminSummary from "../../netlify/functions/admin-summary";
import authMe from "../../netlify/functions/auth-me";

// Contract §4: every admin route, one entry per method and path. Shared by the database-free
// and the DB-backed route tests. A new admin function must be added here (the completeness test
// fails otherwise).
type Handler = (req: Request, ctx: Context) => Promise<Response>;
export const HANDLERS = {
  "admin-svgl.ts": adminSvgl,
  "admin-account.ts": adminAccount,
  "admin-collection.ts": adminCollection,
  "admin-files.ts": adminFiles,
  "admin-messages.ts": adminMessages,
  "admin-profile.ts": adminProfile,
  "admin-settings.ts": adminSettings,
  "admin-summary.ts": adminSummary,
  "auth-me.ts": authMe,
} satisfies Record<string, Handler>;
export type AdminFile = keyof typeof HANDLERS;
export type AdminRoute = { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; path: string; file: AdminFile };

const COLLECTIONS = ["projects", "experience", "education", "skills"] as const;
export const ADMIN_ROUTES: AdminRoute[] = [
  { method: "GET", path: "/api/admin/svgl?search=react", file: "admin-svgl.ts" },
  { method: "GET", path: "/api/auth/me", file: "auth-me.ts" },
  { method: "GET", path: "/api/admin/summary", file: "admin-summary.ts" },
  { method: "GET", path: "/api/admin/profile", file: "admin-profile.ts" },
  { method: "PUT", path: "/api/admin/profile", file: "admin-profile.ts" },
  { method: "GET", path: "/api/admin/settings", file: "admin-settings.ts" },
  { method: "PUT", path: "/api/admin/settings", file: "admin-settings.ts" },
  { method: "GET", path: "/api/admin/account", file: "admin-account.ts" },
  { method: "PUT", path: "/api/admin/account", file: "admin-account.ts" },
  ...COLLECTIONS.flatMap((name): AdminRoute[] => [
    { method: "GET", path: `/api/admin/${name}`, file: "admin-collection.ts" },
    { method: "POST", path: `/api/admin/${name}`, file: "admin-collection.ts" },
    { method: "PUT", path: `/api/admin/${name}/1`, file: "admin-collection.ts" },
    { method: "DELETE", path: `/api/admin/${name}/1`, file: "admin-collection.ts" },
    { method: "PUT", path: `/api/admin/${name}/order`, file: "admin-collection.ts" },
  ]),
  { method: "GET", path: "/api/admin/messages?status=all", file: "admin-messages.ts" },
  { method: "PATCH", path: "/api/admin/messages/1", file: "admin-messages.ts" },
  { method: "DELETE", path: "/api/admin/messages/1", file: "admin-messages.ts" },
  { method: "POST", path: "/api/admin/files?kind=image", file: "admin-files.ts" },
];
export const WRITE_ROUTES = ADMIN_ROUTES.filter(route => route.method !== "GET");
export const READ_ROUTES = ADMIN_ROUTES.filter(route => route.method === "GET");
export const label = (route: AdminRoute) => `${route.method} ${route.path}`;

export const SITE = "https://site.test";
export const FOREIGN = "https://evil.test";
const ctx = { ip: "127.0.0.1", params: {} } as unknown as Context;

// A plausible body per write, so a route that skipped the guard would get as far as it could.
function bodyFor(route: AdminRoute): { body?: BodyInit; type?: string } {
  if (route.file === "admin-files.ts") {
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }), "a.png");
    return { body: form };
  }
  if (route.method === "GET" || route.method === "DELETE") return {};
  const json = route.path.endsWith("/order") ? { ids: [1] } : route.method === "PATCH" ? { isRead: true } : {};
  return { body: JSON.stringify(json), type: "application/json" };
}

// origin: undefined = same site, null = no Origin header.
export function send(route: AdminRoute, options: { origin?: string | null; cookie?: string } = {}): Promise<Response> {
  const headers = new Headers();
  const origin = options.origin === undefined ? SITE : options.origin;
  if (origin !== null) headers.set("Origin", origin);
  if (options.cookie) headers.set("Cookie", options.cookie);
  const { body, type } = bodyFor(route);
  if (type) headers.set("Content-Type", type);
  return HANDLERS[route.file](new Request(SITE + route.path, { method: route.method, headers, body }), ctx);
}

export async function errorCode(response: Response): Promise<string | undefined> {
  const body = await response.json() as { error?: { code?: string } };
  return body.error?.code;
}

import { readdirSync } from "node:fs";

// Deny-by-default inventory of netlify/functions. Every function must be listed as admin
// (admin-routes.ts), public (PUBLIC_ROUTES) or redirect-only (REDIRECT_ONLY), and every
// config.path pattern must be exercised by a listed route.

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type ListedRoute = { method: Method; path: string; file: string; admin: boolean };
export type FunctionConfig = { path?: unknown; method?: unknown } | undefined;

// Contract §4 public routes (no session). Concrete values stand in for path parameters.
export const PUBLIC_ROUTES: Omit<ListedRoute, "admin">[] = [
  { method: "GET", path: "/api/content", file: "content.ts" },
  { method: "GET", path: "/api/projects/some-slug", file: "project.ts" },
  { method: "GET", path: "/api/files/some-key", file: "files.ts" },
  { method: "GET", path: "/cv", file: "cv.ts" },
  { method: "POST", path: "/api/messages", file: "messages.ts" },
  { method: "POST", path: "/api/auth/login", file: "auth-login.ts" },
  { method: "POST", path: "/api/auth/logout", file: "auth-logout.ts" },
];

// Functions without config.path, reachable only at /.netlify/functions/<name> through a
// netlify.toml redirect. The completeness test checks the redirect exists.
export const REDIRECT_ONLY: Record<string, string> = { "api-not-found.ts": "/api/*" };

// One lowercase kebab-case .ts file per function. Anything else (.mts/.js/.mjs/.cjs/.tsx,
// test files, folders) is something Netlify could deploy that the route lists would not see.
const FUNCTION_SOURCE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.ts$/;

export function functionFiles(dir: string): string[] {
  const problems: string[] = [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) problems.push(`${entry.name}: not a plain file (folders deploy as functions)`);
    else if (!FUNCTION_SOURCE.test(entry.name)) problems.push(`${entry.name}: unsupported function file name`);
    else files.push(entry.name);
  }
  if (problems.length) throw new Error(`netlify/functions: ${problems.join("; ")}`);
  return files.sort();
}

// Netlify path pattern to a RegExp: ":name" is one path segment; everything else is literal.
export function patternToRegExp(pattern: string): RegExp {
  const source = pattern.split("/").map(part => part.startsWith(":") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("/");
  return new RegExp(`^${source}$`);
}
export const asList = (value: unknown): string[] => value === undefined ? [] : Array.isArray(value) ? value as string[] : [value as string];
export const isAdminPath = (path: string) => path.includes("/api/admin") || path.startsWith("/api/auth/me");

export function inventoryProblems(input: {
  files: string[];
  configs: Record<string, FunctionConfig>;
  routes: ListedRoute[];
  redirectOnly: string[];
}): string[] {
  const problems: string[] = [];
  const adminFiles = new Set(input.routes.filter(route => route.admin).map(route => route.file));
  const publicFiles = new Set(input.routes.filter(route => !route.admin).map(route => route.file));
  const redirect = new Set(input.redirectOnly);
  const present = new Set(input.files);
  for (const file of [...adminFiles, ...publicFiles, ...redirect]) {
    if (!present.has(file)) problems.push(`${file}: listed but not a function file`);
  }
  for (const file of input.files) {
    const kinds = [adminFiles.has(file), publicFiles.has(file), redirect.has(file)].filter(Boolean).length;
    if (kinds === 0) problems.push(`${file}: not listed as admin, public or redirect-only`);
    if (kinds > 1) problems.push(`${file}: listed in more than one group`);
    const config = input.configs[file];
    const paths = asList(config?.path);
    if (redirect.has(file)) {
      if (paths.length) problems.push(`${file}: redirect-only function has a config.path`);
      continue;
    }
    if (!paths.length) problems.push(`${file}: no config.path (reachable at /.netlify/functions/)`);
    if ((file.startsWith("admin-") || paths.some(isAdminPath)) && !adminFiles.has(file)) {
      problems.push(`${file}: admin function not in the admin route list`);
    }
    const routes = input.routes.filter(route => route.file === file);
    for (const pattern of paths) {
      if (!routes.some(route => patternToRegExp(pattern).test(new URL(route.path, "https://x.test").pathname))) {
        problems.push(`${file}: config.path ${pattern} not exercised by a listed route`);
      }
    }
    const methods = asList(config?.method);
    for (const route of routes) {
      const pathname = new URL(route.path, "https://x.test").pathname;
      if (!paths.some(pattern => patternToRegExp(pattern).test(pathname))) problems.push(`${file}: ${route.method} ${route.path} matches no config.path`);
      if (methods.length && !methods.includes(route.method)) problems.push(`${file}: ${route.method} not in config.method`);
    }
  }
  return problems;
}

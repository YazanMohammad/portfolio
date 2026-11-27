import { isIP } from "node:net";
import type { IncomingHttpHeaders } from "node:http";

export type Route = { name: string; config?: { path?: string | string[]; method?: string | string[] } };

export function matchRoute<T extends Route>(routes: readonly T[], pathname: string, method: string): T | undefined {
  const candidates = routes.flatMap(route => {
    const paths = route.config?.path;
    return (Array.isArray(paths) ? paths : paths ? [paths] : []).map(path => ({ route, parts: path.split("/") }));
  });
  // Lexicographic segment specificity: a static segment beats a parameter at that position.
  candidates.sort((a, b) => {
    for (let i = 0; i < Math.max(a.parts.length, b.parts.length); i++) {
      const score = (s?: string) => s === undefined ? -1 : s.startsWith(":") ? 0 : 1;
      const diff = score(b.parts[i]) - score(a.parts[i]);
      if (diff) return diff;
    }
    return 0;
  });
  const segments = pathname.split("/");
  return candidates.find(({ route, parts }) => {
    const methods = route.config?.method;
    if (methods && !(Array.isArray(methods) ? methods : [methods]).includes(method)) return false;
    return parts.length === segments.length && parts.every((part, i) => part.startsWith(":") ? segments[i] !== "" : part === segments[i]);
  })?.route;
}

function loopback(ip: string): boolean {
  const value = ip.toLowerCase().replace(/^::ffff:/, "");
  return value === "::1" || (isIP(value) === 4 && value.startsWith("127."));
}

export function proxyInfo(socket: string, headers: IncomingHttpHeaders, trust: boolean): { ip: string; protocol: string } {
  if (!trust || !loopback(socket)) return { ip: socket, protocol: "http" };
  const forwarded = headers["x-forwarded-for"];
  const rightmost = (Array.isArray(forwarded) ? forwarded.join(",") : forwarded)?.split(",").at(-1)?.trim();
  const proto = headers["x-forwarded-proto"];
  return { ip: rightmost && isIP(rightmost) ? rightmost : socket, protocol: proto === "https" ? "https" : "http" };
}

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { open, realpath, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Context } from "@netlify/functions";
import { functions } from "./functions.generated";
import { matchRoute, proxyInfo, type Route } from "./router";
import securityHeaders from "../shared/security-headers.json";
import { COLLECTION_BODY_BYTES, DEFAULT_BODY_BYTES, SETTINGS_BODY_BYTES, errorResponse, fail, json, notFound } from "../server/http";
import { CV_MAX_BYTES, IMAGE_MAX_BYTES } from "../shared/index";

// Same envelope allowance as the multipart upload handler.
export const MAX_BODY_BYTES = Math.max(CV_MAX_BYTES, IMAGE_MAX_BYTES) + DEFAULT_BODY_BYTES;
export const REQUEST_TIMEOUT_MS = 30_000;
type FunctionRoute = Route & { handler: (req: Request, ctx: Context) => Promise<Response> };
type Options = { distDir?: string; timeoutMs?: number; routes?: readonly FunctionRoute[]; log?: (line: string) => void };
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".webmanifest": "application/manifest+json",
};

// Inspect the raw request target BEFORE WHATWG URL normalization removes dot segments.
function safePath(target: string): string | null {
  if (!target.startsWith("/") || target.startsWith("//")) return null;
  try {
    const path = decodeURIComponent(target.split("?")[0]);
    if (/[\\\x00-\x1f\x7f%]/.test(path) || path.split("/").some(part => part.startsWith("."))) return null;
    return path;
  } catch { return null; }
}

export function bodyLimit(path: string): number {
  if (path === "/api/admin/files") return MAX_BODY_BYTES;
  if (path === "/api/admin/settings") return SETTINGS_BODY_BYTES;
  if (/^\/api\/admin\/(projects|experience|education|skills)(\/|$)/.test(path)) return COLLECTION_BODY_BYTES;
  return DEFAULT_BODY_BYTES;
}

async function readBody(req: IncomingMessage, max: number, signal: AbortSignal): Promise<Buffer> {
  const length = req.headers["content-length"];
  if (length && Number(length) > max) throw fail("too_large", "Request is too large.");
  if (signal.aborted) throw signal.reason;
  return new Promise((accept, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = () => {
      req.off("data", data); req.off("end", end); req.off("error", error); req.off("aborted", aborted);
      signal.removeEventListener("abort", abort);
    };
    const error = (e: unknown) => { cleanup(); req.pause(); reject(e); };
    const abort = () => error(signal.reason);
    const aborted = () => error(new Error("Request disconnected."));
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) error(fail("too_large", "Request is too large."));
      else chunks.push(chunk);
    };
    const end = () => { cleanup(); accept(Buffer.concat(chunks, size)); };
    req.on("data", data); req.once("end", end); req.once("error", error); req.once("aborted", aborted);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function staticResponse(root: string, pathname: string, req: IncomingMessage, signal: AbortSignal): Promise<Response> {
  const base = await realpath(root);
  let target = resolve(base, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!target.startsWith(base + sep)) throw notFound();
  let info;
  try { info = await stat(target); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" && (error as NodeJS.ErrnoException).code !== "ENOTDIR") throw error;
    if (extname(pathname) || pathname.startsWith("/assets/")) throw notFound();
    target = resolve(base, "index.html");
    info = await stat(target);
  }
  if (!info.isFile()) throw notFound();
  const actual = await realpath(target);
  if (!actual.startsWith(base + sep)) throw notFound();
  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const headers = new Headers({
    "Content-Type": MIME[extname(target).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    "ETag": etag, "Last-Modified": info.mtime.toUTCString(), "Content-Length": String(info.size),
  });
  const match = req.headers["if-none-match"];
  const since = req.headers["if-modified-since"];
  if (match === "*" || match?.split(/,\s*/).includes(etag) || (!match && since && Math.floor(info.mtimeMs / 1000) <= Math.floor(Date.parse(since) / 1000))) {
    headers.delete("Content-Length");
    return new Response(null, { status: 304, headers });
  }
  if (req.method === "HEAD") return new Response(null, { headers });
  const file = await open(actual, "r");
  if (signal.aborted) { await file.close(); throw signal.reason; }
  const stream = file.createReadStream({ autoClose: true, signal });
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { headers });
}

async function send(response: Response, res: ServerResponse, head: boolean): Promise<void> {
  if (res.destroyed || res.writableEnded) { void response.body?.cancel().catch(() => {}); return; }
  const headers = new Headers(securityHeaders);
  response.headers.forEach((value, name) => {
    // Preserve the file endpoint's stricter sandbox as a second, conjunctive CSP policy.
    if (name === "content-security-policy") headers.append(name, value);
    else if (name !== "set-cookie") headers.set(name, value);
  });
  res.statusCode = response.status;
  headers.forEach((value, name) => res.setHeader(name, value));
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  if (head || !response.body) { void response.body?.cancel().catch(() => {}); res.end(); return; }
  await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), res);
}

export function createAppServer(options: Options = {}) {
  const root = options.distDir ?? fileURLToPath(new URL("../dist/", import.meta.url));
  const routes = options.routes ?? functions;
  const log = options.log ?? console.log;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  return createServer({ requestTimeout: timeoutMs, headersTimeout: Math.min(timeoutMs, 10_000), keepAliveTimeout: 5000, maxHeaderSize: 16 * 1024 }, (req, res) => {
    const started = performance.now();
    const controller = new AbortController();
    const pathname = safePath(req.url ?? "/");
    const method = req.method ?? "GET";
    res.once("finish", () => {
      // JSON string escaping prevents log injection; query strings and cookies are never logged.
      const path = JSON.stringify(pathname ?? "[invalid-path]").slice(1, -1);
      log(`${method.replace(/[^A-Z]/g, "")} ${path} ${res.statusCode} ${Math.round(performance.now() - started)}ms`);
    });
    const timer = setTimeout(() => {
      controller.abort(new Error("Request timed out."));
      if (res.headersSent) res.destroy();
      else void send(json({ error: { code: "timeout", message: "Request timed out." } }, { status: 504 }), res, method === "HEAD").catch(() => res.destroy());
    }, timeoutMs);
    timer.unref();
    res.once("close", () => { clearTimeout(timer); controller.abort(); });
    void (async () => {
      try {
        if (!pathname) throw notFound();
        const host = req.headers.host;
        if (!host || !/^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i.test(host)) throw notFound();
        const proxy = proxyInfo(req.socket.remoteAddress ?? "unknown", req.headers, process.env.TRUST_PROXY === "1");
        const url = new URL(req.url!, `${proxy.protocol}://${host}`);
        if (url.hostname === "yznmoh.com") {
          await send(new Response(null, { status: 301, headers: { Location: `https://www.yznmoh.com${url.pathname}${url.search}` } }), res, method === "HEAD");
          return;
        }
        const body = await readBody(req, bodyLimit(pathname), controller.signal);
        let response: Response;
        if (pathname.startsWith("/api/") || pathname === "/cv") {
          const route = matchRoute(routes, url.pathname, method);
          const handler = route?.handler ?? functions.find(f => f.name === "api-not-found")!.handler;
          const headers = new Headers();
          for (let i = 0; i < req.rawHeaders.length; i += 2) headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
          // Always supply ctx.ip: do not allow the Netlify-specific header fallback to be spoofed.
          const request = new Request(url, { method, headers, signal: controller.signal, ...(body.length && method !== "GET" && method !== "HEAD" ? { body: new Uint8Array(body) } : {}) });
          response = await handler(request, { ip: proxy.ip } as Context);
        } else {
          if (method !== "GET" && method !== "HEAD") throw notFound();
          response = await staticResponse(root, pathname, req, controller.signal);
        }
        if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); return; }
        await send(response, res, method === "HEAD");
      } catch (error) {
        if (controller.signal.aborted || res.destroyed) return;
        if (res.headersSent) { res.destroy(); return; }
        // Close rather than drain a malicious/oversized sender indefinitely.
        if (!req.complete) res.setHeader("Connection", "close");
        await send(errorResponse(error), res, method === "HEAD");
      }
    })().catch(() => res.destroy());
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT.");
  const host = process.env.HOST ?? "127.0.0.1";
  const server = createAppServer();
  server.listen(port, host, () => console.log(`Portfolio listening on ${host}:${port}`));
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => { process.exitCode = 0; });
    server.closeIdleConnections();
    setTimeout(() => { server.closeAllConnections(); }, REQUEST_TIMEOUT_MS + 1000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

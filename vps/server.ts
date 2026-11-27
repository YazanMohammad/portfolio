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
import { BodyBudget, busyResponse, cappedBody } from "./body";
import type { Socket } from "node:net";
import { initializeFilesDirectory } from "../server/filesystem";

// Same envelope allowance as the multipart upload handler.
export const MAX_BODY_BYTES = Math.max(CV_MAX_BYTES, IMAGE_MAX_BYTES) + DEFAULT_BODY_BYTES;
export const REQUEST_TIMEOUT_MS = 30_000;
type FunctionRoute = Route & { handler: (req: Request, ctx: Context) => Promise<Response> };
export const MAX_CONNECTIONS = 128;
export const MAX_REQUESTS = 64;
export const BODY_BUDGET_BYTES = 16 * 1024 * 1024;
type Options = { distDir?: string; timeoutMs?: number; headersTimeoutMs?: number; maxConnections?: number; maxRequests?: number; bodyBudgetBytes?: number; routes?: readonly FunctionRoute[]; log?: (line: string) => void };
const HOP_HEADERS = new Set(["connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "proxy-authenticate", "proxy-authorization"]);
function blockedHeaders(headers: Headers): Set<string> {
  return new Set([...HOP_HEADERS, ...(headers.get("connection") ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)]);
}
function requestHeaders(req: IncomingMessage): Headers {
  const raw = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) raw.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
  const blocked = blockedHeaders(raw);
  const clean = new Headers();
  raw.forEach((value, name) => {
    if (!blocked.has(name) && !/^(x-nf-|x-forwarded-|proxy-)/.test(name)) clean.append(name, value);
  });
  return clean;
}
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
    if (target.includes("#")) return null;
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
    try { info = await stat(target); }
    catch (missing) {
      if (["ENOENT", "ENOTDIR"].includes((missing as NodeJS.ErrnoException).code ?? "")) {
        return json({ error: { code: "server", message: "Site is temporarily unavailable." } }, { status: 503 });
      }
      throw missing;
    }
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
  const blocked = blockedHeaders(response.headers);
  response.headers.forEach((value, name) => {
    if (blocked.has(name) || /^(proxy-|netlify-)/.test(name)) return;
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

// Used before HTTP parsing as well, so connection/header-limit responses carry the same policy.
function socketResponse(socket: Socket, status: number, message: string) {
  if (socket.destroyed || socket.writableEnded) return;
  const body = JSON.stringify({ error: { code: "server", message } });
  const headers = new Headers({ ...securityHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Content-Length": String(Buffer.byteLength(body)), "Connection": "close", ...(status === 503 ? { "Retry-After": "1" } : {}) });
  socket.end(`HTTP/1.1 ${status} ${status === 503 ? "Service Unavailable" : status === 408 ? "Request Timeout" : "Bad Request"}\r\n${[...headers].map(([name, value]) => `${name}: ${value}`).join("\r\n")}\r\n\r\n${body}`);
  // Do not hold a rejected connection indefinitely if the peer refuses to read.
  const timer = setTimeout(() => socket.destroy(), 1000); timer.unref();
  socket.once("close", () => clearTimeout(timer));
}

export function createAppServer(options: Options = {}) {
  const root = options.distDir ?? fileURLToPath(new URL("../dist/", import.meta.url));
  const routes = options.routes ?? functions;
  const log = options.log ?? console.log;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const headersTimeoutMs = options.headersTimeoutMs ?? Math.min(timeoutMs, 10_000);
  const maxConnections = options.maxConnections ?? MAX_CONNECTIONS;
  const maxRequests = options.maxRequests ?? MAX_REQUESTS;
  const budget = new BodyBudget(options.bodyBudgetBytes ?? BODY_BUDGET_BYTES);
  const sockets = new Map<Socket, { active: number; headerTimer?: NodeJS.Timeout }>();
  let active = 0;
  const armHeaderDeadline = (socket: Socket) => {
    const state = sockets.get(socket);
    if (!state || state.active || socket.destroyed || socket.writableEnded) return;
    clearTimeout(state.headerTimer);
    state.headerTimer = setTimeout(() => socketResponse(socket, 408, "Request headers timed out."), headersTimeoutMs);
    state.headerTimer.unref();
  };
  const server = createServer({ requestTimeout: timeoutMs, headersTimeout: Math.min(headersTimeoutMs, timeoutMs), connectionsCheckingInterval: 250, keepAliveTimeout: 5000, maxHeaderSize: 16 * 1024, highWaterMark: 16 * 1024 }, (req, res) => {
    const state = sockets.get(req.socket);
    if (!state || req.socket.writableEnded) { res.destroy(); return; }
    clearTimeout(state.headerTimer); state.active++;
    let socketReleased = false;
    const releaseSocket = () => {
      if (socketReleased) return;
      socketReleased = true; state.active--; armHeaderDeadline(req.socket);
    };
    res.once("finish", releaseSocket); res.once("close", releaseSocket);
    if (active >= maxRequests) {
      res.setHeader("Connection", "close");
      void send(busyResponse(), res, req.method === "HEAD").catch(() => res.destroy());
      return;
    }
    active++;
    const started = performance.now();
    const controller = new AbortController();
    const pathname = safePath(req.url ?? "/");
    const method = req.method ?? "GET";
    let body: ReturnType<typeof cappedBody> | undefined;
    res.once("finish", () => {
      const path = JSON.stringify(pathname ?? "[invalid-path]").slice(1, -1);
      log(`${method.replace(/[^A-Z]/g, "")} ${path} ${res.statusCode} ${Math.round(performance.now() - started)}ms`);
    });
    const timer = setTimeout(() => {
      controller.abort();
      if (res.headersSent) res.destroy();
      else {
        res.setHeader("Connection", "close");
        void send(json({ error: { code: "timeout", message: "Request timed out." } }, { status: 504 }), res, method === "HEAD").catch(() => res.destroy());
      }
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
        // One canonical pathname for both cap selection and handler dispatch. Escape URL delimiters.
        url.pathname = pathname.split("/").map(segment => encodeURIComponent(segment)).join("/");
        if (url.hostname === "yznmoh.com") {
          res.setHeader("Connection", "close");
          await send(new Response(null, { status: 301, headers: { Location: `https://www.yznmoh.com${url.pathname}${url.search}` } }), res, method === "HEAD");
          return;
        }
        const limit = bodyLimit(pathname);
        if (Number(req.headers["content-length"]) > limit) throw fail("too_large", "Request is too large.");
        let response: Response;
        if (pathname === "/api" || pathname.startsWith("/api/") || pathname === "/cv") {
          const route = matchRoute(routes, pathname, method);
          const handler = route?.handler ?? functions.find(f => f.name === "api-not-found")!.handler;
          if (method !== "GET" && method !== "HEAD") body = cappedBody(req, limit, budget, controller.signal);
          const request = new Request(url, { method, headers: requestHeaders(req), signal: controller.signal,
            ...(body ? { body: body.stream, duplex: "half" } : {}) } as RequestInit);
          response = await handler(request, { ip: proxy.ip } as Context);
          if (body?.failure) { void response.body?.cancel().catch(() => {}); response = body.failure; }
        } else {
          if (method !== "GET" && method !== "HEAD") throw notFound();
          response = await staticResponse(root, pathname, req, controller.signal);
        }
        if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); return; }
        // Never drain an unread upload after an early authentication or validation rejection.
        if (!req.complete || (body && !body.ended)) res.setHeader("Connection", "close");
        await send(response, res, method === "HEAD");
      } catch (error) {
        if (controller.signal.aborted || res.destroyed) return;
        if (res.headersSent) { res.destroy(); return; }
        if (!req.complete || (body && !body.ended)) res.setHeader("Connection", "close");
        await send(body?.failure ?? errorResponse(error), res, method === "HEAD");
      } finally {
        // Keep reservations and the handler slot even after a timeout until the handler settles.
        body?.release(); active--;
      }
    })().catch(() => res.destroy());
  });
  server.on("connection", socket => {
    if (sockets.size >= maxConnections) { socketResponse(socket, 503, "Server is busy. Try again shortly."); return; }
    sockets.set(socket, { active: 0 });
    armHeaderDeadline(socket);
    socket.once("close", () => { clearTimeout(sockets.get(socket)?.headerTimer); sockets.delete(socket); });
  });
  server.on("clientError", (error, socket) => socketResponse(socket as Socket, (error as NodeJS.ErrnoException).code === "ERR_HTTP_REQUEST_TIMEOUT" ? 408 : 400, "Invalid or timed-out request."));
  return server;
}

if (process.argv[1] && pathToFileURL(await realpath(resolve(process.argv[1]))).href === import.meta.url) {
  process.env.PORTFOLIO_RUNTIME = "vps";
  if (process.env.FILES_DIR) await initializeFilesDirectory();
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT.");
  const host = process.env.HOST ?? "127.0.0.1";
  const server = createAppServer();
  server.listen(port, host, () => console.log(`Portfolio listening on ${host}:${port}`));
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => { server.closeAllConnections(); }, REQUEST_TIMEOUT_MS + 1000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

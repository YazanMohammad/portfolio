import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { createAppServer } from "./server";
import headers from "../shared/security-headers.json";

let root: string;
let server: ReturnType<typeof createAppServer>;
let origin: string;
const logs: string[] = [];
beforeEach(async () => {
  root = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), "portfolio-vps-"));
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "index.html"), "<!doctype html>app");
  await writeFile(join(root, "assets", "app.js"), "console.log('ok')");
  await writeFile(join(root, ".env"), "SECRET");
  logs.length = 0;
  server = createAppServer({ distDir: root, log: line => logs.push(line), timeoutMs: 1000 });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
});
function raw(path: string, method = "GET", body?: string, extraHeaders = {}) {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((resolve, reject) => {
    const req = request(origin, { path, method, headers: extraHeaders }, res => {
      let text = "";
      res.on("data", chunk => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: text }));
    });
    req.on("error", reject);
    req.end(body);
  });
}
describe("standalone HTTP adapter", () => {
  it("serves SPA routes, MIME, HEAD, cache validators and immutable assets", async () => {
    const index = await raw("/projects/x");
    expect(index.status).toBe(200);
    expect(index.body).toContain("doctype");
    expect(index.headers["cache-control"]).toBe("no-cache");
    expect(index.headers["content-security-policy"]).toBe(headers["Content-Security-Policy"]);
    const asset = await raw("/assets/app.js");
    expect(asset.headers["content-type"]).toContain("javascript");
    expect(asset.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect((await raw("/assets/app.js", "HEAD")).body).toBe("");
    expect((await raw("/assets/app.js", "GET", undefined, { "If-None-Match": asset.headers.etag })).status).toBe(304);
    expect((await raw("/missing.png")).status).toBe(404);
    expect((await raw("/assets/")).status).toBe(404);
  });
  it.each(["/%2e%2e/.env", "/../.env", "/%2eenv", "/assets/..%5c.env", "/%252e%252e/.env", "/assets/%00", "/%zz"])("rejects unsafe raw target %s", async path => {
    const res = await raw(path);
    expect(res.status).toBe(404);
    expect(res.body).not.toContain("SECRET");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
  it("returns a JSON 404 for unknown API paths and unsupported methods", async () => {
    for (const [path, method] of [["/api/nope", "GET"], ["/api/content", "POST"], ["/", "POST"]]) {
      const res = await raw(path, method);
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body).error.code).toBe("not_found");
    }
  });
  it("rejects excessive declared lengths before dispatch without reading the body", async () => {
    const declared = await raw("/api/auth/login", "POST", undefined, { "Content-Length": "65537" });
    expect(declared.status).toBe(413);
  });
  it("never logs query strings, cookies or raw control characters", async () => {
    await raw("/api/nope?secret=123", "GET", undefined, { Cookie: "secret=456" });
    expect(logs.join("\n")).not.toMatch(/123|456|secret/);
    expect(logs[0]).toMatch(/^GET \/api\/nope 404 /);
  });
  it("contains handler failures and times out requests", async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    server = createAppServer({ distDir: root, log: () => {}, timeoutMs: 30, routes: [
      { name: "throw", config: { path: "/api/throw" }, handler: async () => { throw new Error("secret-stack"); } },
      { name: "hang", config: { path: "/api/hang" }, handler: async () => new Promise<Response>(() => {}) },
    ] });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const error = await raw("/api/throw");
    expect(error.status).toBe(500);
    expect(error.body).not.toContain("secret-stack");
    expect((await raw("/api/hang")).status).toBe(504);
  });
  it("uses a canonical pathname, rejects fragments, and strips platform and hop-by-hop headers", async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    server = createAppServer({ routes: [{ name: "echo", config: { path: "/api/echo" }, handler: async req => new Response(JSON.stringify({ path: new URL(req.url).pathname, headers: Object.fromEntries(req.headers) }), { headers: { "Content-Type": "application/json", Connection: "x-secret", "x-secret": "hidden", "Netlify-Cache-Tag": "content" } }) }], log: () => {} });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await raw("/api/e%63ho", "GET", undefined, { "x-nf-client-connection-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2", "x-forwarded-proto": "https", "proxy-authorization": "hidden", Connection: "x-hidden", "x-hidden": "hidden", "x-normal": "ok" });
    expect(response.status).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.path).toBe("/api/echo");
    expect(body.headers["x-normal"]).toBe("ok");
    expect(Object.keys(body.headers).filter(key => /^(x-nf-|x-forwarded-|proxy-|connection|x-hidden)/.test(key))).toEqual([]);
    expect(response.headers["x-secret"]).toBeUndefined();
    expect(response.headers["netlify-cache-tag"]).toBeUndefined();
    expect((await raw("/api/echo#bad")).status).toBe(404);
    expect((await raw("/api")).status).toBe(404);
  });
  it("returns a deliberate 503 when the SPA entry is missing", async () => {
    await rm(join(root, "index.html"));
    expect((await raw("/projects/x")).status).toBe(503);
  });
  it("keeps the deployed Netlify security headers equal to the shared source", () => {
    const toml = readFileSync("netlify.toml", "utf8");
    const values = Object.fromEntries([...toml.split("[headers.values]")[1].matchAll(/^\s+([\w-]+) = (".*")\s*$/gm)].map(m => [m[1], JSON.parse(m[2])]));
    expect(values).toEqual(headers);
  });
});

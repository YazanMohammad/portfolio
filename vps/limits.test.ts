import { afterEach, expect, it, vi } from "vitest";
import { request } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { createAppServer } from "./server";
import adminFiles from "../netlify/functions/admin-files";

let server: ReturnType<typeof createAppServer> | undefined;
let origin: string;
const sockets: ReturnType<typeof connect>[] = [];
async function start(options: Parameters<typeof createAppServer>[0] = {}) {
  server = createAppServer({ log: () => {}, timeoutMs: 1000, ...options });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  server?.closeAllConnections();
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  vi.unstubAllEnvs();
});
function pending(path: string, body?: string, headers: Record<string, string> = {}) {
  let req: ReturnType<typeof request>;
  const response = new Promise<{ status: number; headers: import("node:http").IncomingHttpHeaders; body: string }>((resolve, reject) => {
    req = request(origin, { path, method: "POST", headers }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on("error", reject);
    if (body === undefined) req.flushHeaders(); else req.end(body);
  });
  return { req: req!, response };
}

it("authenticates an unfinished anonymous upload before requesting any body bytes", async () => {
  vi.stubEnv("SITE_ORIGIN", "https://site.test");
  await start({ routes: [{ name: "files", config: { path: "/api/admin/files" }, handler: adminFiles }] });
  const upload = pending("/api/admin/files?kind=image", undefined, { Origin: "https://site.test", "Content-Length": "4000000", "Content-Type": "multipart/form-data; boundary=x" });
  try {
    const result = await upload.response;
    expect(result.status).toBe(401);
    expect(result.headers.connection).toBe("close");
  } finally { upload.req.destroy(); }
});

it("caps chunked bodies during consumption and preserves the declared-length fast rejection", async () => {
  let calls = 0;
  await start({ routes: [{ name: "read", config: { path: "/api/read" }, handler: async req => { calls++; await req.arrayBuffer(); return new Response("ok"); } }] });
  const body = pending("/api/read", "x".repeat(65537), { "Transfer-Encoding": "chunked" });
  expect((await body.response).status).toBe(413);
  const declared = pending("/api/read", undefined, { "Content-Length": "65537" });
  try { expect((await declared.response).status).toBe(413); } finally { declared.req.destroy(); }
  expect(calls).toBe(1);
});

it("retains a shared body-byte reservation until the handler finishes and reclaims it afterwards", async () => {
  let release!: () => void;
  let read!: () => void;
  const ready = new Promise<void>(resolve => { read = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  await start({ bodyBudgetBytes: 8, routes: [{ name: "hold", config: { path: "/api/hold" }, handler: async req => { await req.arrayBuffer(); read(); await gate; return new Response("ok"); } }] });
  const first = pending("/api/hold", "12345678");
  try {
    await ready;
    const rejected = await pending("/api/hold", "9").response;
    expect(rejected.status).toBe(503);
    expect(rejected.headers["retry-after"]).toBe("1");
  } finally { release(); }
  expect((await first.response).status).toBe(200);
  expect((await pending("/api/hold", "12345678").response).status).toBe(200);
});

it("limits active handlers, including a timed-out handler that has not settled", async () => {
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  await start({ maxRequests: 1, timeoutMs: 100, routes: [{ name: "hold", config: { path: "/api/hold" }, handler: async () => { entered(); await gate; return new Response("ok"); } }] });
  const first = pending("/api/hold", "");
  try {
    await ready;
    expect((await pending("/api/hold", "").response).status).toBe(503);
    expect((await first.response).status).toBe(504);
    expect((await pending("/api/hold", "").response).status).toBe(503);
  } finally { release(); }
  await new Promise(resolve => setTimeout(resolve, 10));
  expect((await pending("/api/hold", "").response).status).toBe(200);
});

it("rejects excess connections with a bounded JSON 503", async () => {
  await start({ maxConnections: 2 });
  for (let i = 0; i < 2; i++) {
    const socket = connect(Number(new URL(origin).port), "127.0.0.1"); sockets.push(socket);
    await new Promise<void>(resolve => socket.once("connect", resolve));
    socket.write("GET / HTTP/1.1\r\nHost: x\r\nX: ");
  }
  const rejected = await fetch(origin + "/api/nope");
  expect(rejected.status).toBe(503);
  expect(rejected.headers.get("content-security-policy")).toContain("default-src");
  expect((await rejected.json()).error.code).toBe("server");
});

it("enforces an absolute header deadline even while bytes trickle in", async () => {
  await start({ headersTimeoutMs: 80 });
  const socket = connect(Number(new URL(origin).port), "127.0.0.1"); sockets.push(socket);
  const response = new Promise<string>((resolve, reject) => {
    let text = ""; socket.on("data", chunk => { text += chunk; }); socket.on("end", () => resolve(text)); socket.on("error", reject);
  });
  await new Promise<void>(resolve => socket.once("connect", resolve));
  socket.write("GET / HTTP/1.1\r\nHost: x\r\nX: ");
  const tick = setInterval(() => { if (!socket.destroyed) socket.write("a"); }, 15);
  try {
    const text = await response;
    expect(text).toMatch(/^HTTP\/1.1 408 /);
    expect(text.toLowerCase()).toContain("connection: close");
    expect(text.toLowerCase()).toContain("content-security-policy:");
  } finally { clearInterval(tick); }
});

it("closes an incomplete body at its request deadline and releases the shared byte budget", async () => {
  await start({ timeoutMs: 80, bodyBudgetBytes: 8, routes: [{ name: "read", config: { path: "/api/read" }, handler: async req => { await req.arrayBuffer(); return new Response("ok"); } }] });
  const slow = pending("/api/read", undefined, { "Content-Length": "8" });
  slow.req.write("1234");
  try {
    const result = await slow.response;
    expect(result.status).toBe(504);
    expect(result.headers.connection).toBe("close");
  } finally { slow.req.destroy(); }
  expect((await pending("/api/read", "12345678").response).status).toBe(200);
});

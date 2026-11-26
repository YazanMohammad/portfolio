import type { Context } from "@netlify/functions";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ insert: vi.fn(), retry: vi.fn() }));
vi.mock("../../db/client", () => ({ db: new Proxy({}, { get: () => { throw new Error("Unexpected DB access"); } }) }));
vi.mock("../../server/rate-limit", () => ({ insertMessageIfAllowed: mocks.insert, messageRetryAfter: mocks.retry }));
import messages from "../../netlify/functions/messages";
import { hashIp } from "../../server/ip";
const ctx = { ip: "203.0.113.11" } as Context;
const valid = { name: "Person", email: "person@example.com", subject: "Hello", message: "A message", website: "" };
function request(body: unknown = valid, method = "POST", origin = "https://site.test") {
  return new Request("https://site.test/api/messages", { method, headers: { Origin: origin, "Content-Type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("SITE_ORIGIN", "https://site.test"); vi.stubEnv("SESSION_SECRET", Buffer.alloc(32, 7).toString("base64"));
  mocks.insert.mockResolvedValue(true); mocks.retry.mockResolvedValue(123);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("passes only IP hash and validated input to the atomic insert", async () => {
  const response = await messages(request(), ctx);
  expect(response.status).toBe(201); expect(await response.json()).toEqual({ ok: true });
  expect(mocks.insert).toHaveBeenCalledWith(hashIp(ctx.ip), valid);
  expect(JSON.stringify(mocks.insert.mock.calls)).not.toContain(ctx.ip);
  expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(mocks.retry).not.toHaveBeenCalled();
});
it("honeypot rejection is generic with no fields hint even if other fields are invalid", async () => {
  const response = await messages(request({ ...valid, website: "spam", email: "bad" }), ctx);
  expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: { code: "validation", message: "Check the fields." } });
  expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled();
});
it.each([ ["name", "x".repeat(101)], ["email", "x".repeat(201)], ["subject", "x".repeat(151)], ["message", "x".repeat(5001)], ["message", ""], ["email", "invalid"] ])("validates %s", async (field, value) => {
  const response = await messages(request({ ...valid, [field]: value }), ctx);
  expect(response.status).toBe(400); expect((await response.json()).error.fields).toHaveProperty(field);
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("refused atomic insert returns 429 and looks up Retry-After by hash", async () => {
  mocks.insert.mockResolvedValue(false);
  const response = await messages(request(), ctx);
  expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("123");
  expect(mocks.retry).toHaveBeenCalledWith(hashIp(ctx.ip));
});
it("checks origin before parsing or insertion", async () => {
  const req = request({}, "POST", "https://foreign.test"); const parse = vi.spyOn(req, "json");
  expect((await messages(req, ctx)).status).toBe(403); expect(parse).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
});
it.each(["GET", "HEAD", "OPTIONS", "PUT", "DELETE", "PATCH"])("%s is 404 before I/O", async method => {
  expect((await messages(request(undefined, method), ctx)).status).toBe(404); expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled();
});
it.each(["", "{bad", "[]", "null"])("malformed body %s is 400", async body => {
  const req = new Request("https://site.test/api/messages", { method: "POST", headers: { Origin: "https://site.test" }, body });
  expect((await messages(req, ctx)).status).toBe(400); expect(mocks.insert).not.toHaveBeenCalled();
});

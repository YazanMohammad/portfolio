import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { matchRoute, proxyInfo } from "./router";
import { functions } from "./functions.generated";

describe("standalone routing", () => {
  it("registers every Netlify function, including the fallback", () => {
    expect(functions.map(f => f.name).sort()).toEqual(readdirSync("netlify/functions").filter(f => f.endsWith(".ts")).map(f => f.slice(0, -3)).sort());
  });
  it("prefers static paths, respects methods, and matches whole segments", () => {
    const routes = [
      { name: "param", config: { path: "/api/items/:id" } },
      { name: "static", config: { path: "/api/items/order", method: "PUT" } },
    ];
    expect(matchRoute(routes, "/api/items/order", "PUT")?.name).toBe("static");
    expect(matchRoute(routes, "/api/items/1", "GET")?.name).toBe("param");
    expect(matchRoute(routes, "/api/items/1/more", "GET")).toBeUndefined();
    expect(matchRoute([routes[1]], "/api/items/order", "GET")).toBeUndefined();
  });
  it("keeps the generated imports reproducible", () => {
    const source = readFileSync("vps/functions.generated.ts", "utf8");
    for (const f of functions) expect(source).toContain(`../netlify/functions/${f.name}`);
  });
});

describe("proxy boundary", () => {
  it.each(["127.0.0.1", "127.2.3.4", "::1", "::ffff:127.0.0.1"])("trusts only loopback %s with opt-in", socket => {
    expect(proxyInfo(socket, { "x-forwarded-for": "1.1.1.1, 203.0.113.5", "x-forwarded-proto": "https" }, true)).toEqual({ ip: "203.0.113.5", protocol: "https" });
    expect(proxyInfo(socket, { "x-forwarded-for": "1.1.1.1", "x-forwarded-proto": "https" }, false)).toEqual({ ip: socket, protocol: "http" });
  });
  it("ignores spoofed forwarding headers on a non-loopback connection", () => {
    expect(proxyInfo("203.0.113.8", { "x-forwarded-for": "127.0.0.1", "x-forwarded-proto": "https" }, true)).toEqual({ ip: "203.0.113.8", protocol: "http" });
  });
  it("never falls back to an earlier attacker-controlled IP", () => {
    expect(proxyInfo("127.0.0.1", { "x-forwarded-for": "1.1.1.1, garbage" }, true).ip).toBe("127.0.0.1");
  });
});

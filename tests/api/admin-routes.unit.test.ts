import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Every rejection below must happen before any I/O. Any touch of the DB client, the Neon driver,
// Blobs or the cache purge records the call and throws, and afterEach fails the test.
const io = vi.hoisted(() => ({ touched: [] as string[] }));
vi.mock("../../db/client", () => {
  const trap = (what: string) => { io.touched.push(what); throw new Error(`DB used: ${what}`); };
  return {
    db: new Proxy({}, { get: (_target, property) => trap(`db.${String(property)}`) }),
    getDb: () => trap("getDb"),
    assertDatabaseBinding: () => trap("assertDatabaseBinding"),
  };
});
vi.mock("@neondatabase/serverless", () => ({
  neon: () => { io.touched.push("neon"); throw new Error("Neon used"); },
}));
vi.mock("@netlify/blobs", () => ({
  getStore: () => { io.touched.push("blobs"); throw new Error("Blobs used"); },
}));
vi.mock("@netlify/functions", () => ({
  purgeCache: () => { io.touched.push("purgeCache"); throw new Error("Purge used"); },
}));

import { type FunctionConfig, type ListedRoute, PUBLIC_ROUTES, REDIRECT_ONLY, functionFiles, inventoryProblems } from "./function-inventory";
import { ADMIN_ROUTES, FOREIGN, HANDLERS, READ_ROUTES, SITE, WRITE_ROUTES, errorCode, label, send } from "./admin-routes";

const COOKIE = "__Host-session";
// Well-formed (43 base64url chars), so only the order of checks keeps it away from the DB.
const WELL_FORMED = `${COOKIE}=${"A".repeat(43)}`;
const GARBAGE = [
  `${COOKIE}=garbage`,
  `${COOKIE}=${"A".repeat(42)}`,
  `${COOKIE}=${"A".repeat(44)}`,
  `${COOKIE}=${"A".repeat(42)}=`,
  `${COOKIE}=${"A".repeat(42)}%`,
  `${COOKIE}=`,
  // Right shape but wrong cookie name for an https site: ignored, so no session.
  `session=${"A".repeat(43)}`,
  `${COOKIE.toLowerCase()}=${"A".repeat(43)}`,
];

beforeEach(() => {
  io.touched.length = 0;
  vi.stubEnv("SITE_ORIGIN", SITE);
  vi.stubEnv("SESSION_SECRET", Buffer.alloc(32, 7).toString("base64"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  expect(io.touched, "a rejected request reached I/O").toEqual([]);
});

async function expectRejected(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await errorCode(response)).toBe(code);
  expect(response.headers.get("Set-Cookie")).toBeNull();
}

describe("completeness", () => {
  const dir = fileURLToPath(new URL("../../netlify/functions/", import.meta.url));
  const load = async (name: string) => await import(pathToFileURL(dir + name).href) as { config?: FunctionConfig };
  const routes: ListedRoute[] = [
    ...ADMIN_ROUTES.map(route => ({ ...route, admin: true })),
    ...PUBLIC_ROUTES.map(route => ({ ...route, admin: false })),
  ];

  it("every function file is listed as admin, public or redirect-only, and every config.path is exercised", async () => {
    const files = functionFiles(dir);
    const configs: Record<string, FunctionConfig> = {};
    for (const name of files) configs[name] = (await load(name)).config;
    expect(inventoryProblems({ files, configs, routes, redirectOnly: Object.keys(REDIRECT_ONLY) })).toEqual([]);
    expect(Object.keys(HANDLERS).sort()).toEqual([...new Set(ADMIN_ROUTES.map(route => route.file))].sort());
  });

  it("redirect-only functions are wired in netlify.toml", () => {
    const toml = readFileSync(fileURLToPath(new URL("../../netlify.toml", import.meta.url)), "utf8");
    for (const [file, from] of Object.entries(REDIRECT_ONLY)) {
      const to = `/.netlify/functions/${file.replace(/\.ts$/, "")}`;
      expect(toml, file).toMatch(new RegExp(`from = "${from.replace(/[*]/g, "\\*")}"\\s*\\n\\s*to = "${to}"`));
    }
  });

  it("covers the contract §4 admin route count", () => {
    expect(ADMIN_ROUTES).toHaveLength(32);
    expect(new Set(ADMIN_ROUTES.map(label)).size).toBe(ADMIN_ROUTES.length);
  });
});

describe("no session -> 401 unauthorized", () => {
  it.each(ADMIN_ROUTES.map(route => [label(route), route] as const))("%s", async (_name, route) => {
    await expectRejected(await send(route), 401, "unauthorized");
  });
});

describe("foreign origin -> 403 forbidden_origin (well-formed session cookie)", () => {
  it.each(WRITE_ROUTES.map(route => [label(route), route] as const))("%s", async (_name, route) => {
    await expectRejected(await send(route, { origin: FOREIGN, cookie: WELL_FORMED }), 403, "forbidden_origin");
  });
});

describe("foreign origin without session -> 403", () => {
  it.each(WRITE_ROUTES.map(route => [label(route), route] as const))("%s", async (_name, route) => {
    await expectRejected(await send(route, { origin: FOREIGN }), 403, "forbidden_origin");
  });
});

describe("missing Origin header -> 403", () => {
  it.each(WRITE_ROUTES.map(route => [label(route), route] as const))("%s", async (_name, route) => {
    await expectRejected(await send(route, { origin: null, cookie: WELL_FORMED }), 403, "forbidden_origin");
  });
});

describe("lookalike and opaque origins -> 403", () => {
  const origins = ["null", "https://site.test.evil.test", "https://SITE.test", "http://site.test", "https://site.test/"];
  it.each(WRITE_ROUTES.map(route => [label(route), route] as const))("%s", async (_name, route) => {
    for (const origin of origins) await expectRejected(await send(route, { origin, cookie: WELL_FORMED }), 403, "forbidden_origin");
  });
});

describe("reads do not depend on Origin", () => {
  it.each(READ_ROUTES.map(route => [label(route), route] as const))("%s without session is 401 for any Origin", async (_name, route) => {
    for (const origin of [FOREIGN, null]) await expectRejected(await send(route, { origin }), 401, "unauthorized");
  });
});

describe("garbage session cookie -> 401", () => {
  it.each(ADMIN_ROUTES.map(route => [label(route), route] as const))("%s", async (_name, route) => {
    for (const cookie of GARBAGE) await expectRejected(await send(route, { cookie }), 401, "unauthorized");
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type ListedRoute, functionFiles, inventoryProblems } from "./function-inventory";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function dirWith(entries: string[], folders: string[] = []): string {
  const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "portfolio-functions-"));
  roots.push(root);
  for (const name of entries) writeFileSync(join(root, name), "export default () => {};\n");
  for (const name of folders) mkdirSync(join(root, name));
  return root;
}

describe("functionFiles", () => {
  it("lists plain kebab-case .ts files", () => {
    expect(functionFiles(dirWith(["b-two.ts", "a.ts"]))).toEqual(["a.ts", "b-two.ts"]);
  });
  it.each(["x.mts", "x.js", "x.mjs", "x.cjs", "x.tsx", "x.test.ts", "Admin.ts", "x.json"])("fails on %s", (name) => {
    expect(() => functionFiles(dirWith(["a.ts", name]))).toThrow(name);
  });
  it("fails on a subfolder", () => {
    expect(() => functionFiles(dirWith(["a.ts"], ["admin-x"]))).toThrow("admin-x");
  });
});

describe("inventoryProblems", () => {
  const admin: ListedRoute = { method: "GET", path: "/api/admin/a", file: "admin-a.ts", admin: true };
  const pub: ListedRoute = { method: "GET", path: "/api/p/1", file: "p.ts", admin: false };
  const base: Parameters<typeof inventoryProblems>[0] = {
    files: ["admin-a.ts", "p.ts", "nf.ts"],
    configs: { "admin-a.ts": { path: "/api/admin/a" }, "p.ts": { path: "/api/p/:id", method: "GET" }, "nf.ts": undefined },
    routes: [admin, pub],
    redirectOnly: ["nf.ts"],
  };
  const problems = (change: Partial<typeof base>) => inventoryProblems({ ...base, ...change });

  it("accepts a complete inventory", () => {
    expect(problems({})).toEqual([]);
  });
  it("fails on an unlisted function", () => {
    expect(problems({ files: [...base.files, "new.ts"], configs: { ...base.configs, "new.ts": { path: "/api/new" } } }))
      .toContain("new.ts: not listed as admin, public or redirect-only");
  });
  it("fails on a function without config.path", () => {
    expect(problems({ configs: { ...base.configs, "p.ts": { method: "GET" } } })).toContain("p.ts: no config.path (reachable at /.netlify/functions/)");
  });
  it("fails on a redirect-only function that has a path", () => {
    expect(problems({ configs: { ...base.configs, "nf.ts": { path: "/x" } } })).toContain("nf.ts: redirect-only function has a config.path");
  });
  it("fails on an admin path listed as public, or an admin-* file listed as public", () => {
    expect(problems({ configs: { ...base.configs, "p.ts": { path: ["/api/p/:id", "/api/admin/p"] } } }))
      .toContain("p.ts: admin function not in the admin route list");
    expect(problems({ routes: [{ ...admin, admin: false }, pub] })).toContain("admin-a.ts: admin function not in the admin route list");
  });
  it("fails on an admin path without /api/admin (typo) because it is unexercised", () => {
    expect(problems({ configs: { ...base.configs, "admin-a.ts": { path: ["/api/admin/a", "/api/admn/a"] } } }))
      .toContain("admin-a.ts: config.path /api/admn/a not exercised by a listed route");
  });
  it("fails on a route that matches no pattern or method", () => {
    expect(problems({ routes: [admin, pub, { ...pub, path: "/api/q" }] })).toContain("p.ts: GET /api/q matches no config.path");
    expect(problems({ routes: [admin, pub, { ...pub, method: "POST" }] })).toContain("p.ts: POST not in config.method");
  });
  it("fails on a listed file that does not exist, or one listed twice", () => {
    expect(problems({ routes: [admin, pub, { ...pub, file: "gone.ts" }] })).toContain("gone.ts: listed but not a function file");
    expect(problems({ redirectOnly: ["nf.ts", "p.ts"] })).toContain("p.ts: listed in more than one group");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import apiNotFound from "./functions/api-not-found";

// Small reader for the flat netlify.toml: [table] and [[array]] headers, key = "string" | number | bool.
function parse(text: string) {
  const out: Record<string, Record<string, string | number | boolean>[]> = {};
  let cur: Record<string, string | number | boolean> | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const head = line.match(/^\[{1,2}([^\]]+)\]{1,2}$/);
    if (head) {
      cur = {};
      (out[head[1]] ??= []).push(cur);
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!kv || !cur) throw new Error(`Cannot read line: ${line}`);
    const v = kv[2];
    cur[kv[1]] = v.startsWith('"') ? JSON.parse(v) : v === "true" ? true : v === "false" ? false : Number(v);
  }
  return out;
}

const toml = parse(readFileSync(new URL("../netlify.toml", import.meta.url), "utf8"));

describe("netlify.toml", () => {
  it("build, functions and dev blocks", () => {
    expect(toml["build"][0]).toEqual({ command: "pnpm install --frozen-lockfile && pnpm build", publish: "dist" });
    expect(toml["build.environment"][0]).toEqual({ NODE_VERSION: "22" });
    expect(toml["functions"][0]).toEqual({ directory: "netlify/functions", node_bundler: "esbuild" });
    expect(toml["dev"][0]).toEqual({ command: "pnpm dev:web", targetPort: 5173, port: 8888, framework: "#custom" });
  });

  it("redirects are in order with the right force flags", () => {
    expect(toml["redirects"]).toEqual([
      { from: "https://yznmoh.com/*", to: "https://www.yznmoh.com/:splat", status: 301, force: true },
      { from: "/cv", to: "/.netlify/functions/cv", status: 200, force: true },
      { from: "/api/*", to: "/.netlify/functions/api-not-found", status: 200, force: false },
      { from: "/*", to: "/index.html", status: 200 },
    ]);
  });

  it("security headers", () => {
    expect(toml["headers"][0].for).toBe("/*");
    expect(toml["headers.values"][0]).toEqual({
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "X-Content-Type-Options": "nosniff",
    });
  });

  it("every function redirect target exists", async () => {
    const { existsSync } = await import("node:fs");
    for (const r of toml["redirects"]) {
      const m = String(r.to).match(/^\/\.netlify\/functions\/(.+)$/);
      if (m) expect(existsSync(new URL(`./functions/${m[1]}.ts`, import.meta.url))).toBe(true);
    }
  });
});

describe("api-not-found", () => {
  it("answers with the JSON 404 not_found body", async () => {
    const res = await (apiNotFound as (r: Request, c: unknown) => Promise<Response>)(
      new Request("https://site.test/api/nope"),
      {},
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.error.code ?? body.code).toBe("not_found");
  });
});

describe("NETLIFY_DEPLOY.md", () => {
  it("names every required env variable", () => {
    const doc = readFileSync("NETLIFY_DEPLOY.md", "utf8");
    const src = readFileSync("server/env.ts", "utf8");
    const names = src.match(/type EnvName = ([^;]+);/)![1].match(/"([A-Z_]+)"/g)!.map((n) => n.replace(/"/g, ""));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(doc, name).toContain(`\`${name}\``);
    expect(doc).toContain("randomBytes(32).toString('base64')");
  });
});

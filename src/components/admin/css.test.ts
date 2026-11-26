import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const cssFiles = ["src/components/admin/admin.css", "src/components/admin/lists.css", "src/components/admin/settings.css"];
const css = cssFiles.map((f) => readFileSync(join(root, f), "utf8")).join("\n");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}
const source = ["src/pages/admin", "src/components/admin", "src/lib/admin", "src/components/site"].flatMap((d) => tsxFiles(join(root, d)))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

describe("admin css", () => {
  it("lays out .admin-shapes as a 3-column grid", () => {
    const rule = /\.admin-shapes\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/display:\s*grid/);
    expect(rule).toMatch(/grid-template-columns:\s*repeat\(3,\s*1fr\)/);
  });

  it("has no dead class selectors", () => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{[^}]*\}/g, "{}");
    const classes = new Set([...stripped.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
    const dead = [...classes].filter((c) => !source.includes(c));
    expect(dead).toEqual([]);
  });
});

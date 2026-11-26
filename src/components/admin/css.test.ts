import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

// CSSOM walks real rules, including nested @media/@supports; this is a
// class-reference check, NOT proof that arbitrary selector relationships match.
function selectorsFrom(text: string): string[] {
  const style = document.createElement("style");
  style.textContent = text;
  document.head.append(style);
  try {
    const walk = (rules: CSSRuleList): string[] => Array.from(rules).flatMap(rule => [
      ...("selectorText" in rule ? [(rule as CSSStyleRule).selectorText] : []),
      ...("cssRules" in rule ? walk((rule as CSSGroupingRule).cssRules) : []),
    ]);
    return walk(style.sheet!.cssRules);
  } finally { style.remove(); }
}
function deadClasses(styles: string, code: string): string[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, code);
  const referenced = new Set<string>();
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if ([ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail].includes(token)) {
      for (const name of scanner.getTokenValue().match(/[-_a-zA-Z][\w-]*/g) ?? []) referenced.add(name);
    }
  }
  const classes = new Set(selectorsFrom(styles).flatMap(s => [...s.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(m => m[1])));
  return [...classes].filter(c => !referenced.has(c));
}

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

  it("references exact class tokens in application strings (including nested rules)", () => {
    expect(deadClasses(css, source)).toEqual([]);
  });
  it("rejects nested unused classes, comments and longer class-name false positives", () => {
    expect(deadClasses('@media(max-width:767px){@supports(display:grid){.never-used-sentinel{display:block;}}}', 'const x = "live";')).toEqual(["never-used-sentinel"]);
    expect(deadClasses('.unused{color:red}', '/* unused */ const x = "unused-longer";')).toEqual(["unused"]);
    expect(deadClasses('.live{color:red}', 'const x = "live";')).toEqual([]);
  });
});

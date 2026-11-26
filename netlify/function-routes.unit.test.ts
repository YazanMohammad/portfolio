import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Parse source without importing handlers: this guard must never open a database.
const directory = join(import.meta.dirname, "functions");
const files = readdirSync(directory).filter(name => name.endsWith(".ts"));

function literalPath(source: string): boolean {
  const ast = ts.createSourceFile("function.ts", source, ts.ScriptTarget.Latest, true);
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement) || !statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "config") continue;
      const config = declaration.initializer;
      if (!config || !ts.isObjectLiteralExpression(config)) return false;
      const path = config.properties.find(property => ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === "path");
      if (!path || !ts.isPropertyAssignment(path)) return false;
      const value = path.initializer;
      return ts.isStringLiteral(value) || (ts.isArrayLiteralExpression(value) && value.elements.length > 0 && value.elements.every(ts.isStringLiteral));
    }
  }
  return false;
}

describe("Netlify statically extracted function routes", () => {
  it.each(files)("%s exports a literal config.path", file => {
    const source = readFileSync(join(directory, file), "utf8");
    // The fallback is deliberately redirect-only (netlify.toml), with no config export.
    // Still parse it and reject a future nonliteral config instead of exempting it blindly.
    if (file === "api-not-found.ts") {
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const hasConfig = ast.statements.some(statement => ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === "config"));
      if (!hasConfig) return;
    }
    expect(literalPath(source), `${file}: use literal config.path, not an identifier`).toBe(true);
  });
  it.each([
    'const PATH = "/api/x"; export const config = { path: PATH };',
    'const PATH = "/api/x"; export const config = { path: [PATH] };',
    'export const config = { path: ["/api/x", ...other] };',
    'export const config = { path: `/api/x` };',
    'export const config = other;',
  ])("rejects nonliteral route declarations: %s", source => {
    expect(literalPath(source)).toBe(false);
  });
  it.each([
    'export const config = { path: "/api/x" };',
    'export const config = { path: ["/api/x", "/api/x/:id"] };',
  ])("accepts route literals: %s", source => {
    expect(literalPath(source)).toBe(true);
  });
});

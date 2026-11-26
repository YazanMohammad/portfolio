import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";

it("keeps admin pages and layout out of the eager public module graph", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const eagerAdmin = ast.statements.filter(ts.isImportDeclaration).filter(statement =>
    ts.isStringLiteral(statement.moduleSpecifier) && /\/(pages|components)\/admin\//.test(statement.moduleSpecifier.text));
  expect(eagerAdmin.map(statement => statement.moduleSpecifier.getText(ast))).toEqual([]);
  for (const page of ["login", "dashboard", "profile", "projects", "experience", "education", "skills", "messages"]) {
    expect(source).toContain(`lazy(() => import("@/pages/admin/${page}"))`);
  }
});

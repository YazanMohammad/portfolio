import { describe, expect, it } from "vitest";
import { dbTestsEnabled, describeDb } from "./describe-db";

// Imported above with the opt-in off; declared below with it on. The rule must be read at
// declaration time (setup.ts imports describe-db before it loads .env).
const saved = { flag: process.env.RUN_DB_TESTS, url: process.env.DATABASE_URL_TEST };
const ran: string[] = [];
process.env.RUN_DB_TESTS = "1";
process.env.DATABASE_URL_TEST = "postgres://test.invalid/db";
describeDb("opted in after import", () => { it("runs", () => { ran.push("on"); }); });
process.env.RUN_DB_TESTS = "0";
describeDb("opted out", () => { it("is skipped", () => { ran.push("off"); }); });
for (const [key, value] of [["RUN_DB_TESTS", saved.flag], ["DATABASE_URL_TEST", saved.url]] as const) {
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
}
it("describeDb reads the rule when the suite is declared", () => {
  expect(ran).toEqual(["on"]);
});

describe("database test opt-in", () => {
  it.each([
    [{}, false],
    [{ DATABASE_URL_TEST: "postgres://test.invalid/db" }, false],
    [{ RUN_DB_TESTS: "1" }, false],
    [{ RUN_DB_TESTS: "1", DATABASE_URL_TEST: "" }, false],
    [{ RUN_DB_TESTS: "true", DATABASE_URL_TEST: "postgres://test.invalid/db" }, false],
    [{ RUN_DB_TESTS: "0", DATABASE_URL_TEST: "postgres://test.invalid/db" }, false],
    [{ RUN_TASK12_DB_TESTS: "1", DATABASE_URL_TEST: "postgres://test.invalid/db" }, false],
    [{ RUN_DB_TESTS: "1", DATABASE_URL_TEST: "postgres://test.invalid/db" }, true],
  ] as const)("%o -> %s", (env, expected) => {
    expect(dbTestsEnabled(env)).toBe(expected);
  });

  it("every DB suite uses describeDb and no per-task flag remains", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const dir = fileURLToPath(new URL("./", import.meta.url));
    const suites = readdirSync(dir).filter(name => name.endsWith(".test.ts") && !name.endsWith(".unit.test.ts")).sort();
    expect(suites).toEqual(["admin-account-cli", "admin-account-race", "admin-account", "admin-collection", "admin-files", "admin-messages", "admin-profile", "admin-routes",
      "admin-settings", "admin-summary", "auth", "messages", "public", "rate-limit", "seed", "sessions"].map(name => `${name}.test.ts`));
    for (const name of suites) {
      const source = readFileSync(dir + name, "utf8");
      expect(source, name).toMatch(/^describeDb\(/m);
      expect(source, name).not.toMatch(/describe\.(skipIf|runIf)|RUN_TASK\d+_DB_TESTS/);
    }
  });
});

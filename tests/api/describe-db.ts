import { describe } from "vitest";

type Environment = Record<string, string | undefined>;

// The one database opt-in rule: a DB suite runs only when RUN_DB_TESTS=1 (set by `pnpm test:db`)
// AND DATABASE_URL_TEST is set. A DATABASE_URL_TEST in .env alone never runs (or resets) anything.
export function dbTestsEnabled(env: Environment = process.env): boolean {
  return env.RUN_DB_TESTS === "1" && Boolean(env.DATABASE_URL_TEST);
}

// Decided when the suite is declared, not when this module is imported: tests/api/setup.ts
// imports this module before it loads .env.
export function describeDb(name: string, factory: () => void): void {
  describe.skipIf(!dbTestsEnabled())(name, factory);
}

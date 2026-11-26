import { expect, vi } from "vitest";
import { loadRootEnv } from "../../db/load-env";
import { prepareTestDatabase } from "./db-safety";
import { dbTestsEnabled } from "./describe-db";

const testPath = expect.getState().testPath?.replaceAll("\\", "/") ?? "";
// Same rule as describeDb: nothing is loaded or prepared unless the command opted in with
// RUN_DB_TESTS=1 (`pnpm test:db`), so a plain `pnpm test` never touches the test branch.
if (testPath.includes("/tests/api/") && !testPath.endsWith(".unit.test.ts") && process.env.RUN_DB_TESTS === "1") {
  loadRootEnv();
  // `pnpm test:db` must never pass with zero DB tests: the shell asked for them, so a missing
  // DATABASE_URL_TEST (or a .env RUN_DB_TESTS=0) is an error, not a silent skip.
  if (!dbTestsEnabled(process.env)) {
    throw new Error("RUN_DB_TESTS=1 but database tests are not enabled: set DATABASE_URL_TEST in .env and do not set RUN_DB_TESTS=0 there.");
  }
  prepareTestDatabase(process.env);
  process.env.SITE_ORIGIN = "https://site.test";
  process.env.SESSION_SECRET = Buffer.alloc(32, 7).toString("base64");
  const { TEST_PASSWORD, blobStore, purgeSpy } = await import("./helpers");
  const { hashPassword } = await import("../../server/password");
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(TEST_PASSWORD);
  vi.doMock("@netlify/blobs", () => ({
    getStore: () => ({
      set: async (key: string, data: ArrayBuffer, options?: { metadata?: Record<string, unknown> }) => {
        blobStore.set(key, { data: data.slice(0), metadata: options?.metadata ?? {} });
      },
      getWithMetadata: async (key: string) => blobStore.get(key) ?? null,
      delete: async (key: string) => { blobStore.delete(key); },
    }),
  }));
  vi.doMock("@netlify/functions", () => ({ purgeCache: purgeSpy }));
}

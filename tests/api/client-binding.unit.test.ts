import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), neon: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: () => ({ execute: mocks.execute }) }));
const prod = "postgresql://user:pass@ep-main.us-east-1.aws.neon.tech/neondb";
const test = "postgresql://user:pass@ep-test.us-east-1.aws.neon.tech/neondb";
beforeEach(() => { vi.resetModules(); vi.unstubAllEnvs(); mocks.execute.mockReset(); mocks.neon.mockReset(); });
async function prepare() {
  vi.stubEnv("DATABASE_URL_TEST", test);
  vi.stubEnv("DATABASE_URL_TEST_UNPOOLED", undefined);
  vi.stubEnv("DATABASE_URL_UNPOOLED", undefined);
  const { prepareTestDatabase } = await import("./db-safety");
  prepareTestDatabase(process.env);
}
it("refuses a production-preinitialized cached client before truncate", async () => {
  vi.stubEnv("DATABASE_URL", prod);
  const { getDb } = await import("../../db/client");
  getDb();
  await prepare();
  const { resetDb } = await import("./helpers");
  await expect(resetDb()).rejects.toThrow();
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.neon).toHaveBeenCalledTimes(1);
});
it("allows a normally prepared test binding", async () => {
  vi.stubEnv("DATABASE_URL", prod); await prepare();
  const { resetDb } = await import("./helpers");
  await resetDb();
  expect(mocks.execute).toHaveBeenCalledTimes(1);
  expect(mocks.neon).toHaveBeenCalledWith(test);
});
it("refuses environment mutation before touching the executor", async () => {
  vi.stubEnv("DATABASE_URL", prod); await prepare();
  const { getDb } = await import("../../db/client"); getDb();
  process.env.DATABASE_URL = prod;
  const { resetDb } = await import("./helpers");
  await expect(resetDb()).rejects.toThrow();
  expect(mocks.execute).not.toHaveBeenCalled();
});

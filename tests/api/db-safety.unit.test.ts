import { beforeEach, expect, it, vi } from "vitest";
import { prepareTestDatabase, assertSafeReset } from "./db-safety";
const execute = vi.hoisted(() => vi.fn());
vi.mock("../../db/client", () => ({ db: { execute } }));
const prod = "postgresql://user:pass@ep-main.us-east-1.aws.neon.tech/neondb";
const test = "postgresql://user:pass@ep-test.us-east-1.aws.neon.tech/neondb";
beforeEach(() => { vi.unstubAllEnvs(); execute.mockReset(); });
it.each([prod, prod + "?sslmode=require", prod.replace("user:pass", "other:secret"), prod.replace("ep-main.", "ep-main-pooler."), prod + "/", prod.replace("neondb", "%6eeondb"), prod.replace("/neondb", ":5432/neondb")])("rejects equivalent production identity %s", (url) => {
  const env = { DATABASE_URL: prod, DATABASE_URL_TEST: url };
  expect(() => prepareTestDatabase(env)).toThrow();
  expect(env.DATABASE_URL).toBe(prod);
});
it.each(["not-a-url", "https://host/db", "postgres://host", "postgres://host/a/b", "postgres://host/%ZZ", "postgres://host/db?host=other", "postgres://host/db#fragment", "postgres://host/db//", "postgres://%68ost/db", "postgres://host:80/db", "postgres://host:443/db", "postgres://host:05432/db", "postgres://host:1234/db", "postgres://höst/db", "postgres://host./db", "postgres://host:0/db"]) ("rejects malformed or ambiguous target %s", (url) => {
  expect(() => prepareTestDatabase({ DATABASE_URL: prod, DATABASE_URL_TEST: url })).toThrow();
  expect(() => prepareTestDatabase({ DATABASE_URL: url, DATABASE_URL_TEST: test })).toThrow();
});
it("compares unpooled production and test configuration", () => {
  expect(() => prepareTestDatabase({ DATABASE_URL: prod, DATABASE_URL_UNPOOLED: test, DATABASE_URL_TEST: test })).toThrow();
  expect(() => prepareTestDatabase({ DATABASE_URL: prod, DATABASE_URL_TEST: test, DATABASE_URL_TEST_UNPOOLED: prod })).toThrow();
});
it("preserves originals after override and detects production reconfiguration", () => {
  const env = { DATABASE_URL: prod, DATABASE_URL_TEST: test, DATABASE_URL_UNPOOLED: prod };
  prepareTestDatabase(env);
  expect(env.DATABASE_URL).toBe(test);
  expect(() => assertSafeReset(env)).not.toThrow();
  env.DATABASE_URL_TEST = prod; env.DATABASE_URL = prod;
  expect(() => assertSafeReset(env)).toThrow();
});
it("requires original production configuration", () => {
  expect(() => prepareTestDatabase({ DATABASE_URL_TEST: test })).toThrow();
});
it("resetDb rejects before TRUNCATE even when active and test strings match production", async () => {
  vi.stubEnv("DATABASE_URL", prod); vi.stubEnv("DATABASE_URL_TEST", prod);
  const { resetDb } = await import("./helpers");
  await expect(resetDb()).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
});

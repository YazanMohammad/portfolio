import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadRootEnv: vi.fn(),
  blobStore: new Map<string, { data: ArrayBuffer; metadata: Record<string, unknown> }>(), purgeSpy: vi.fn(),
}));
vi.mock("../../db/load-env", () => ({ loadRootEnv: mocks.loadRootEnv }));
vi.mock("./helpers", () => ({ TEST_PASSWORD: "test-password-only", blobStore: mocks.blobStore, purgeSpy: mocks.purgeSpy }));
const originalPath = expect.getState().testPath;

// Every variable the harness reads is stubbed, so the developer's real .env and shell never matter
// (loadRootEnv is mocked too).
const HARNESS_ENV = ["RUN_DB_TESTS", "DATABASE_URL", "DATABASE_URL_UNPOOLED", "DATABASE_URL_TEST", "DATABASE_URL_TEST_UNPOOLED"];

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.blobStore.clear();
  for (const name of HARNESS_ENV) vi.stubEnv(name, undefined);
  vi.stubEnv("RUN_DB_TESTS", "1");
  vi.stubEnv("DATABASE_URL", "postgres://production.invalid/db");
  vi.stubEnv("SITE_ORIGIN", "https://unchanged.test");
  vi.stubEnv("SESSION_SECRET", "unchanged");
});
afterEach(() => {
  expect.setState({ testPath: originalPath });
  vi.unstubAllEnvs();
  vi.doUnmock("@netlify/blobs");
  vi.doUnmock("@netlify/functions");
});

async function loadSetup(path = "C:/repo/tests/api/public.test.ts") {
  expect.setState({ testPath: path });
  await import("./setup");
}

describe("API harness setup without a database connection", () => {
  it("does nothing when the shell did not opt in", async () => {
    vi.stubEnv("RUN_DB_TESTS", undefined);
    await loadSetup();
    expect(mocks.loadRootEnv).not.toHaveBeenCalled();
    expect(process.env.DATABASE_URL).toBe("postgres://production.invalid/db");
    expect(process.env.SITE_ORIGIN).toBe("https://unchanged.test");
  });
  it("rejects the production URL before initializing anything", async () => {
    vi.stubEnv("DATABASE_URL_TEST", process.env.DATABASE_URL);
    await expect(loadSetup()).rejects.toThrow("Refusing unsafe test database configuration.");
  });
  it.each([undefined, "", "0", "true"])("without RUN_DB_TESTS=1 (%s) it neither loads .env nor prepares a database", async (flag) => {
    vi.stubEnv("RUN_DB_TESTS", flag);
    vi.stubEnv("DATABASE_URL_TEST", "postgres://test.invalid/db");
    await loadSetup();
    expect(mocks.loadRootEnv).not.toHaveBeenCalled();
    expect(process.env.DATABASE_URL).toBe("postgres://production.invalid/db");
    expect(process.env.SITE_ORIGIN).toBe("https://unchanged.test");
  });
  it("fails loudly when RUN_DB_TESTS=1 but .env leaves the test URL unset", async () => {
    await expect(loadSetup()).rejects.toThrow("RUN_DB_TESTS=1 but database tests are not enabled");
    expect(mocks.loadRootEnv).toHaveBeenCalledOnce();
  });
  it("fails loudly when .env turns the flag off (RUN_DB_TESTS=0) after the shell asked for DB tests", async () => {
    mocks.loadRootEnv.mockImplementationOnce(() => {
      process.env.DATABASE_URL_TEST = "postgres://test.invalid/db";
      process.env.RUN_DB_TESTS = "0";
    });
    await expect(loadSetup()).rejects.toThrow("RUN_DB_TESTS=1 but database tests are not enabled");
    expect(process.env.DATABASE_URL).toBe("postgres://production.invalid/db");
  });
  it.each(["C:/repo/server/http.test.ts", "C:\\repo\\tests\\api\\public.unit.test.ts"])("leaves %s isolated", async (path) => {
    vi.stubEnv("DATABASE_URL_TEST", process.env.DATABASE_URL);
    await loadSetup(path);
    expect(mocks.loadRootEnv).not.toHaveBeenCalled();
  });
  it("configures test env and shared in-memory services without opening the database", async () => {
    vi.stubEnv("DATABASE_URL_TEST", "postgres://test.invalid/db");
    vi.stubEnv("ADMIN_PASSWORD_HASH", undefined);
    await loadSetup("C:\\repo\\tests\\api\\public.test.ts");
    expect(process.env.DATABASE_URL).toBe("postgres://test.invalid/db");
    expect(process.env.SITE_ORIGIN).toBe("https://site.test");
    expect(Buffer.from(process.env.SESSION_SECRET!, "base64")).toHaveLength(32);
    // The admin login lives in the database now: the harness sets no password env.
    expect(process.env).not.toHaveProperty("ADMIN_PASSWORD_HASH");
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("files");
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    await store.set("key", bytes, { metadata: { contentType: "image/png" } });
    expect(await store.getWithMetadata("key", { type: "arrayBuffer" })).toEqual({ data: bytes, metadata: { contentType: "image/png" } });
    await store.delete("key");
    expect(await store.getWithMetadata("key", { type: "arrayBuffer" })).toBeNull();
    const { purgeCache } = await import("@netlify/functions");
    await purgeCache({ tags: ["content"] });
    expect(mocks.purgeSpy).toHaveBeenCalledWith({ tags: ["content"] });
  });
});

import crypto from "node:crypto";
import type { Context } from "@netlify/functions";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// The real verifier and the real scrypt run here; only the database, rate limit and sessions are
// stubbed. Every failure path must do exactly one scrypt derivation with the same parameters as a
// freshly generated hash, so skipping (or weakening) the dummy verify fails this test.
const mocks = vi.hoisted(() => ({ rows: [] as unknown[], create: vi.fn() }));
vi.mock("../../db/client", () => ({ db: { select: () => ({ from: () => ({ where: async () => mocks.rows }) }) } }));
vi.mock("../../server/rate-limit", () => ({ reserveLoginAttempt: async () => ({ allowed: true, attemptId: 1 }), markLoginSuccess: async () => {} }));
vi.mock("../../server/sessions", async (original) => ({ ...await original<typeof import("../../server/sessions")>(), createSession: mocks.create }));
import login from "../../netlify/functions/auth-login";
import { hashPassword } from "../../server/password";

const ctx = { ip: "203.0.113.10" } as Context;
const request = (username: string, password: string) => new Request("https://site.test/api/auth/login", {
  method: "POST", headers: { Origin: "https://site.test", "Content-Type": "application/json" }, body: JSON.stringify({ username, password }),
});
type ScryptCall = { saltBytes: number; keylen: number; N: number; r: number; p: number };
let reference: ScryptCall;
let storedHash: string;
const scrypt = vi.spyOn(crypto, "scrypt");
const calls = (): ScryptCall[] => scrypt.mock.calls.map((args) => {
  const [, salt, keylen, options] = args as unknown as [unknown, Buffer, number, { N: number; r: number; p: number }];
  return { saltBytes: salt.length, keylen, N: options.N, r: options.r, p: options.p };
});

beforeEach(async () => {
  vi.stubEnv("SITE_ORIGIN", "https://site.test"); vi.stubEnv("SESSION_SECRET", Buffer.alloc(32, 7).toString("base64"));
  scrypt.mockClear();
  storedHash = await hashPassword("the real admin password");
  [reference] = calls();
  scrypt.mockClear();
  mocks.create.mockResolvedValue({ token: "t".repeat(43), expiresAt: new Date() });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); });

async function attempt(username: string, password: string): Promise<number> {
  return (await login(request(username, password), ctx)).status;
}

it("the reference hash uses the generator's parameters", () => {
  expect(reference).toEqual({ saltBytes: 16, keylen: 64, N: 16384, r: 8, p: 1 });
});

it.each([
  ["wrong username", () => [{ username: "admin", passwordHash: storedHash, version: 1 }], "someone", "the real admin password"],
  ["wrong password", () => [{ username: "admin", passwordHash: storedHash, version: 1 }], "admin", "not the password"],
  ["no account", () => [], "admin", "the real admin password"],
  ["malformed stored hash", () => [{ username: "admin", passwordHash: "scrypt$garbage", version: 1 }], "admin", "x"],
  ["oversized stored parameters", () => [{ username: "admin", passwordHash: storedHash.replace("scrypt$16384$", "scrypt$1048576$"), version: 1 }], "admin", "x"],
] as const)("%s: one real scrypt derivation with the generator's parameters", async (_name, rows, username, password) => {
  mocks.rows = rows();
  expect(await attempt(username, password)).toBe(401);
  expect(calls()).toEqual([reference]);
});

it("success does the same single derivation", async () => {
  mocks.rows = [{ username: "admin", passwordHash: storedHash, version: 1 }];
  expect(await attempt("ADMIN", "the real admin password")).toBe(204);
  expect(calls()).toEqual([reference]);
});

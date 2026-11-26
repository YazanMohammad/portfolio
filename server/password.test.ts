import crypto from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "./password";

afterEach(() => { vi.restoreAllMocks(); });

const PASSWORD = "correct horse battery";

it("hash has the contract format", async () => {
  const hash = await hashPassword(PASSWORD);
  expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*$/);
  const parts = hash.split("$");
  expect(parts).toHaveLength(6);
  expect(parts.slice(1, 4)).toEqual(["16384", "8", "1"]);
  expect(Buffer.from(parts[4], "base64")).toHaveLength(16);
  expect(Buffer.from(parts[5], "base64")).toHaveLength(64);
});

it("verify accepts the right password", async () => {
  const hash = await hashPassword(PASSWORD);
  await expect(verifyPassword(PASSWORD, hash)).resolves.toBe(true);
});

it("verify rejects a wrong password", async () => {
  const hash = await hashPassword(PASSWORD);
  await expect(verifyPassword("correct horse batterz", hash)).resolves.toBe(false);
  await expect(verifyPassword("", hash)).resolves.toBe(false);
});

it("two hashes of the same password differ", async () => {
  const a = await hashPassword(PASSWORD);
  const b = await hashPassword(PASSWORD);
  expect(a).not.toBe(b);
  expect(a.split("$")[4]).not.toBe(b.split("$")[4]);
});

it("verify returns false for malformed strings", async () => {
  const good = await hashPassword(PASSWORD);
  const [, , , , salt, key] = good.split("$");
  const cases = [
    "",
    "abc",
    "scrypt$1$2",
    `scrypt$16384$8$1$${salt}$${key}$extra`,
    `bcrypt$16384$8$1$${salt}$${key}`,
    `scrypt$16384$8$1$not*base64!$${key}`,
    `scrypt$16384$8$1$${salt}$%%%%`,
    `scrypt$16384$8$1$$${key}`,
    `scrypt$16384$8$1$${salt}$`,
    `scrypt$99999999999$8$1$${salt}$${key}`,
    `scrypt$262144$8$1$${salt}$${key}`,
    `scrypt$16383$8$1$${salt}$${key}`,
    `scrypt$1$8$1$${salt}$${key}`,
    `scrypt$16384$0$1$${salt}$${key}`,
    `scrypt$16384$64$1$${salt}$${key}`,
    `scrypt$16384$8$0$${salt}$${key}`,
    `scrypt$16384$8$99$${salt}$${key}`,
    `scrypt$16384.0$8$1$${salt}$${key}`,
    `scrypt$-16384$8$1$${salt}$${key}`,
    `scrypt$016384$8$1$${salt}$${key}`,
    `scrypt$16384$8$1$${salt}$${key.slice(0, 20)}`,
  ];
  for (const stored of cases) {
    await expect(verifyPassword(PASSWORD, stored), stored).resolves.toBe(false);
  }
});

it("verify returns false (never throws) for non-string input", async () => {
  await expect(verifyPassword(PASSWORD, undefined as unknown as string)).resolves.toBe(false);
  await expect(verifyPassword(undefined as unknown as string, "abc")).resolves.toBe(false);
});

it("verify accepts a hash made with the documented parameters", async () => {
  const salt = Buffer.alloc(16, 7);
  const key = crypto.scryptSync(PASSWORD, salt, 64, { N: 16384, r: 8, p: 1 });
  const stored = `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
  await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(true);
  await expect(verifyPassword("wrong password!!", stored)).resolves.toBe(false);
});

it("verify uses timingSafeEqual", async () => {
  const hash = await hashPassword(PASSWORD);
  const spy = vi.spyOn(crypto, "timingSafeEqual");
  await verifyPassword(PASSWORD, hash);
  expect(spy).toHaveBeenCalledTimes(1);
});

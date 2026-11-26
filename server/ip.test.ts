import crypto from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clientIp, hashIp, ipBucket } from "./ip";

const SECRET_A = crypto.randomBytes(32).toString("base64");
const SECRET_B = crypto.randomBytes(32).toString("base64");
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRET_A;
});

afterEach(() => {
  if (saved === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = saved;
});

function request(headers: Record<string, string>): Request {
  return new Request("https://example.test/api/messages", { method: "POST", headers });
}

it("hashIp is stable for same ip and secret", () => {
  expect(hashIp("203.0.113.7")).toBe(hashIp("203.0.113.7"));
  expect(hashIp("203.0.113.7")).toMatch(/^[0-9a-f]{64}$/);
});

it("hashIp differs per ip", () => {
  expect(hashIp("203.0.113.7")).not.toBe(hashIp("203.0.113.8"));
});

it("hashIp differs per secret", () => {
  const a = hashIp("203.0.113.7");
  process.env.SESSION_SECRET = SECRET_B;
  expect(hashIp("203.0.113.7")).not.toBe(a);
});

it("hashIp is the HMAC-SHA256 keyed with the decoded secret", () => {
  const expected = crypto.createHmac("sha256", Buffer.from(SECRET_A, "base64")).update("203.0.113.7").digest("hex");
  expect(hashIp("203.0.113.7")).toBe(expected);
});

it("hashIp never contains the raw ip", () => {
  for (const ip of ["203.0.113.7", "2001:db8::1", "10.0.0.1"]) {
    const hash = hashIp(ip);
    expect(hash).not.toContain(ip);
    expect(hash).not.toContain(ip.replace(/[.:]/g, ""));
  }
});

it("null ip hashes to a fixed bucket", () => {
  expect(hashIp(null)).toBe(hashIp(null));
  expect(hashIp(null)).toBe(hashIp("unknown"));
  expect(hashIp(null)).not.toBe(hashIp("203.0.113.7"));
});

it("clientIp ignores x-forwarded-for", () => {
  expect(clientIp(request({ "x-forwarded-for": "198.51.100.1" }))).toBeNull();
  expect(clientIp(request({ "x-forwarded-for": "198.51.100.1", "x-nf-client-connection-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  expect(clientIp(request({ "x-forwarded-for": "198.51.100.1" }), { ip: "203.0.113.9" })).toBe("203.0.113.9");
});

it("clientIp prefers context ip over the Netlify header", () => {
  expect(clientIp(request({ "x-nf-client-connection-ip": "203.0.113.7" }), { ip: "203.0.113.9" })).toBe("203.0.113.9");
  expect(clientIp(request({ "x-nf-client-connection-ip": "203.0.113.7" }), {})).toBe("203.0.113.7");
});

it("clientIp returns null for a missing or invalid ip", () => {
  expect(clientIp(request({}))).toBeNull();
  expect(clientIp(request({}), { ip: "" })).toBeNull();
  expect(clientIp(request({ "x-nf-client-connection-ip": "not-an-ip" }))).toBeNull();
  expect(clientIp(request({}), { ip: "unknown" })).toBeNull();
});

it("ipv6 addresses in one /64 share a bucket", () => {
  const a = hashIp("2001:db8:1:2::1");
  expect(hashIp("2001:0db8:0001:0002:ffff:eeee:dddd:cccc")).toBe(a);
  expect(hashIp("2001:DB8:1:2:0:0:0:9")).toBe(a);
  expect(ipBucket("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
  expect(ipBucket("::1")).toBe("0:0:0:0::/64");
});

it("ipv4-mapped ipv6 equals ipv4", () => {
  expect(hashIp("::ffff:1.2.3.4")).toBe(hashIp("1.2.3.4"));
  expect(hashIp("::ffff:102:304")).toBe(hashIp("1.2.3.4"));
  expect(ipBucket("::FFFF:203.0.113.7")).toBe("203.0.113.7");
});

it("different /64s differ", () => {
  expect(hashIp("2001:db8:1:2::1")).not.toBe(hashIp("2001:db8:1:3::1"));
  expect(hashIp("2001:db8::1")).not.toBe(hashIp("2001:db9::1"));
});

it("ipv4 addresses keep their full address", () => {
  expect(hashIp("203.0.113.7")).not.toBe(hashIp("203.0.113.8"));
  expect(ipBucket(" 203.0.113.7 ")).toBe("203.0.113.7");
});

it("short SESSION_SECRET throws", () => {
  process.env.SESSION_SECRET = crypto.randomBytes(31).toString("base64");
  expect(() => hashIp("203.0.113.7")).toThrow();
  delete process.env.SESSION_SECRET;
  expect(() => hashIp("203.0.113.7")).toThrow();
});

it("a too-short SESSION_SECRET logs one line naming the format, never the value, and throws", () => {
  const bad = "not-base64-enough";
  process.env.SESSION_SECRET = bad;
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => hashIp("203.0.113.7")).toThrow("SESSION_SECRET");
  expect(log).toHaveBeenCalledTimes(1);
  const line = String(log.mock.calls[0][0]);
  expect(line).toContain("SESSION_SECRET");
  expect(line).toMatch(/base64/);
  expect(line).toMatch(/32/);
  expect(line).not.toContain(bad);
  log.mockRestore();
});

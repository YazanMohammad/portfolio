import crypto from "node:crypto";
import { isIP } from "node:net";
import { env } from "./env";

const MIN_KEY_BYTES = 32;
// Every request without a usable IP shares this one bucket, so it is rate limited too.
const UNKNOWN = "unknown";

function cleanIp(value: string | null | undefined): string | null {
  const ip = value?.trim().toLowerCase().replace(/%.*$/, ""); // drop an IPv6 zone like %eth0
  return ip && isIP(ip) ? ip : null;
}

// Behind Netlify, context.ip is set by the platform. The x-nf-client-connection-ip header is the
// fallback. x-forwarded-for is never read: a client can set it to anything.
export function clientIp(req: Request, ctx?: { ip?: string }): string | null {
  return cleanIp(ctx?.ip) ?? cleanIp(req.headers.get("x-nf-client-connection-ip"));
}

// Eight 16-bit groups of a valid IPv6 address (handles "::" and a trailing dotted IPv4).
function ipv6Groups(ip: string): number[] {
  const toGroups = (part: string): number[] => {
    if (part === "") return [];
    return part.split(":").flatMap((group) => {
      if (!group.includes(".")) return [parseInt(group, 16)];
      const [a, b, c, d] = group.split(".").map(Number);
      return [(a << 8) | b, (c << 8) | d];
    });
  };
  const [head, tail] = ip.split("::");
  const left = toGroups(head);
  if (tail === undefined) return left;
  const right = toGroups(tail);
  return [...left, ...new Array<number>(8 - left.length - right.length).fill(0), ...right];
}

// The rate-limit bucket for an IP. IPv4 is used whole. IPv6 is cut to its /64, because one
// user usually holds a whole /64. IPv4-mapped IPv6 (::ffff:1.2.3.4) counts as the IPv4.
export function ipBucket(ip: string): string {
  const clean = cleanIp(ip);
  if (!clean) return ip;
  if (isIP(clean) === 4) return clean;
  const g = ipv6Groups(clean);
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join(".");
  }
  return `${g.slice(0, 4).map((x) => x.toString(16)).join(":")}::/64`;
}

function hashKey(): Buffer {
  const key = Buffer.from(env("SESSION_SECRET"), "base64");
  if (key.length < MIN_KEY_BYTES) {
    // One clear line for the operator. The caller still gets a generic 500, and no value is logged.
    console.error("SESSION_SECRET is invalid: it must be base64 of at least 32 random bytes (make one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\")");
    throw new Error("SESSION_SECRET must be at least 32 bytes (base64)");
  }
  return key;
}

// HMAC-SHA256 hex of the IP's bucket, keyed with SESSION_SECRET. Raw IPs are never stored.
export function hashIp(ip: string | null): string {
  return crypto.createHmac("sha256", hashKey()).update(ip === null ? UNKNOWN : ipBucket(ip)).digest("hex");
}

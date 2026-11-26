import crypto from "node:crypto";

// Format (contract §2): scrypt$<N>$<r>$<p>$<salt base64>$<key base64>
const N = 16384;
const R = 8;
const P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

// Upper bounds so a bad ADMIN_PASSWORD_HASH value cannot hang or crash the function.
const MAX_N = 2 ** 17;
const MAX_R = 32;
const MAX_P = 16;
const MAX_WORK = 2 ** 28; // 128 * N * r * p, about 256 MiB of work

const INT = /^[1-9][0-9]{0,9}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

type Params = { N: number; r: number; p: number };

function derive(password: string, salt: Buffer, keylen: number, { N, r, p }: Params): Promise<Buffer> {
  // Memory scrypt needs is about 128 * N * r; leave room so the default 32 MiB limit never trips.
  const maxmem = 256 * N * r + 128 * r * p + 1024 * 1024;
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, { N, r, p, maxmem }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function parseInt10(value: string): number | null {
  return INT.test(value) ? Number(value) : null;
}

function decodeBase64(value: string): Buffer | null {
  if (!BASE64.test(value)) return null;
  const buf = Buffer.from(value, "base64");
  // Reject anything that does not round-trip (bad padding, stray bits).
  return buf.toString("base64") === value ? buf : null;
}

function parse(stored: string): { params: Params; salt: Buffer; key: Buffer } | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const n = parseInt10(parts[1]);
  const r = parseInt10(parts[2]);
  const p = parseInt10(parts[3]);
  if (n === null || r === null || p === null) return null;
  if (n < 2 || n > MAX_N || (n & (n - 1)) !== 0) return null;
  if (r > MAX_R || p > MAX_P || 128 * n * r * p > MAX_WORK) return null;
  const salt = decodeBase64(parts[4]);
  const key = decodeBase64(parts[5]);
  if (!salt || !key || salt.length < SALT_BYTES || salt.length > 64 || key.length !== KEY_BYTES) return null;
  return { params: { N: n, r, p }, salt, key };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await derive(password, salt, KEY_BYTES, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

// Never throws. Any bad input, bad stored value or scrypt error gives false.
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (typeof password !== "string" || typeof stored !== "string") return false;
    const parsed = parse(stored.trim());
    if (!parsed) return false;
    const actual = await derive(password, parsed.salt, parsed.key.length, parsed.params);
    if (actual.length !== parsed.key.length) return false;
    return crypto.timingSafeEqual(actual, parsed.key);
  } catch {
    return false;
  }
}

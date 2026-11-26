import crypto from "node:crypto";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "../db/client";
import { adminSessions } from "../db/schema";
import { isLocalHttp } from "./env";
import { fail } from "./http";

// Contract §4 and §9.2: 32 random bytes as base64url, 7-day cookie, DB keeps only the SHA-256.
const SESSION_MS = 7 * 24 * 60 * 60_000;
const MAX_AGE_SECONDS = SESSION_MS / 1000;
const RENEW_AFTER_MS = 60 * 60_000;
// Expired rows are deleted only after this extra margin, so a request that is validating a row
// right at its expiry (maybe on a slightly different clock) never sees it vanish mid-flight.
const CLEANUP_GRACE_MS = 24 * 60 * 60_000;
const CLEANUP_BATCH = 100;

// 32 bytes in base64url (no padding) is always 43 chars.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type SessionCheck = { valid: boolean; renewed: boolean };
const INVALID: SessionCheck = { valid: false, renewed: false };

function isTokenFormat(token: string): boolean {
  // Length check first so huge strings cost nothing.
  return token.length === 43 && TOKEN_PATTERN.test(token);
}

// Renew once the session was last seen more than an hour ago (exactly one hour: not yet).
export function shouldRenew(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() > RENEW_AFTER_MS;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(now: Date = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_MS);
  const cutoff = new Date(now.getTime() - CLEANUP_GRACE_MS);
  // Housekeeping is bounded: at most CLEANUP_BATCH long-expired rows per login.
  const stale = db
    .select({ id: adminSessions.id })
    .from(adminSessions)
    .where(lt(adminSessions.expiresAt, cutoff))
    .limit(CLEANUP_BATCH);
  await db.batch([
    db.insert(adminSessions).values({ id: hashToken(token), createdAt: now, expiresAt, lastSeenAt: now }),
    db.delete(adminSessions).where(inArray(adminSessions.id, stale)),
  ]);
  return { token, expiresAt };
}

export async function validateSession(token: string | null, now: Date = new Date()): Promise<SessionCheck> {
  // Reject bad input before hashing or touching the DB. Never throws for bad input.
  if (token === null || !isTokenFormat(token)) return INVALID;
  // The token is matched by a DB lookup on its SHA-256 hex, so there is no string compare in JS
  // whose timing could leak the token.
  const id = hashToken(token);
  const [found] = await db
    .select({ lastSeenAt: adminSessions.lastSeenAt })
    .from(adminSessions)
    .where(and(eq(adminSessions.id, id), gt(adminSessions.expiresAt, now)));
  if (!found) return INVALID;
  if (!shouldRenew(found.lastSeenAt, now)) return { valid: true, renewed: false };

  // Renew only a row that still exists and is still live (logout may have deleted it meanwhile).
  const renewed = await db
    .update(adminSessions)
    .set({ expiresAt: new Date(now.getTime() + SESSION_MS), lastSeenAt: now })
    .where(and(eq(adminSessions.id, id), gt(adminSessions.expiresAt, now)))
    .returning({ id: adminSessions.id });
  return renewed.length > 0 ? { valid: true, renewed: true } : INVALID;
}

export async function deleteSession(token: string): Promise<void> {
  if (!isTokenFormat(token)) return;
  await db.delete(adminSessions).where(eq(adminSessions.id, hashToken(token)));
}

export function cookieName(): "__Host-session" | "session" {
  return isLocalHttp() ? "session" : "__Host-session";
}

function cookieFlags(maxAge: number): string {
  // No Domain attribute: __Host- requires it absent, and it keeps the cookie host-only.
  const secure = isLocalHttp() ? "" : "; Secure";
  return `; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export function sessionCookie(token: string): string {
  // Guard against header injection: only a well-formed token goes into Set-Cookie.
  if (!isTokenFormat(token)) throw new Error("Invalid session token.");
  return `${cookieName()}=${token}${cookieFlags(MAX_AGE_SECONDS)}`;
}

export function clearSessionCookie(): string {
  return `${cookieName()}=${cookieFlags(0)}`;
}

// Reads our cookie from the Cookie header. First match wins; '=' inside a value is kept.
// No URL decoding (base64url never needs it, and decoding can throw).
export function readSessionToken(req: Request): string | null {
  const header = req.headers.get("Cookie");
  if (!header) return null;
  const name = cookieName();
  for (const part of header.split(";")) {
    const eqAt = part.indexOf("=");
    if (eqAt === -1) continue;
    if (part.slice(0, eqAt).trim() !== name) continue;
    const value = part.slice(eqAt + 1).trim();
    return value === "" ? null : value;
  }
  return null;
}

export async function requireAdmin(req: Request, now: Date = new Date()): Promise<{ renewedCookie: string | null }> {
  const token = readSessionToken(req);
  const { valid, renewed } = await validateSession(token, now);
  if (!valid || token === null) throw fail("unauthorized", "Please log in.");
  // The DB expiry moved, so refresh the browser's Max-Age too.
  return { renewedCookie: renewed ? sessionCookie(token) : null };
}

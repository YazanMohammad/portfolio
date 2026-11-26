import type { Context } from "@netlify/functions";
import { sql } from "drizzle-orm";
import { vi } from "vitest";
import { assertSafeReset } from "./db-safety";
import { db, assertDatabaseBinding } from "../../db/client";
import { education, experience, profile, projects, skills } from "../../db/schema";
import { adminAccount } from "../../db/schema";
import { hashPassword } from "../../server/password";
import { cookieName, createSession } from "../../server/sessions";

export const TEST_USERNAME = "test-admin";
export const TEST_PASSWORD = "test-password-only";
export const blobStore = new Map<string, { data: ArrayBuffer; metadata: Record<string, unknown> }>();
export const purgeSpy = vi.fn();
export const CV_KEY = "a".repeat(32) + ".pdf";
export const PHOTO_KEY = "b".repeat(32) + ".png";

type Handler = (req: Request, ctx: Context) => Promise<Response>;
export async function call(handler: Handler, options: {
  method?: string; path: string; headers?: HeadersInit; json?: unknown; form?: FormData;
  cookie?: string; origin?: string; ip?: string;
}): Promise<Response> {
  const origin = process.env.SITE_ORIGIN ?? "https://site.test";
  const headers = new Headers(options.headers);
  if (!headers.has("Origin")) headers.set("Origin", options.origin ?? origin);
  if (options.cookie) headers.set("Cookie", options.cookie);
  let body: BodyInit | undefined = options.form;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  }
  return handler(new Request(origin + options.path, { method: options.method ?? "GET", headers, body }),
    { ip: options.ip ?? "127.0.0.1", params: {} } as Context);
}

export async function resetDb(): Promise<void> {
  assertSafeReset(process.env);
  assertDatabaseBinding(process.env.DATABASE_URL_TEST!);
  await db.execute(sql`TRUNCATE TABLE profile, projects, experience, education, skills, messages,
    login_attempts, admin_sessions, admin_account, site_state, site_settings RESTART IDENTITY CASCADE`);
  blobStore.clear();
  purgeSpy.mockReset();
}

// The admin account row for TEST_USERNAME / TEST_PASSWORD (hashed once per file).
let testHash: Promise<string> | undefined;
export async function createTestAdmin(username = TEST_USERNAME): Promise<void> {
  testHash ??= hashPassword(TEST_PASSWORD);
  await db.insert(adminAccount).values({ id: 1, username, passwordHash: await testHash });
}

export async function loginCookie(): Promise<string> {
  const { token } = await createSession();
  return `${cookieName()}=${token}`;
}

export async function seedMinimal(): Promise<void> {
  await db.insert(profile).values({ name: "Test Person", headline: "Engineer", intro: "Hello",
    email: "person@example.com", cvKey: CV_KEY, photoKey: PHOTO_KEY, photoAlt: "Portrait" });
  await db.insert(projects).values([
    { slug: "regular", title: "Regular", summary: "Regular summary", category: "Web", sortOrder: 0 },
    { slug: "featured", title: "Featured", summary: "Featured summary", body: "Project body", category: "AI",
      featured: true, sortOrder: 99, imageKey: PHOTO_KEY, imageAlt: "Preview" },
    { slug: "hidden", title: "Hidden", summary: "Hidden summary", category: "Web", isVisible: false },
  ]);
  await db.insert(experience).values([
    { position: "Past", startDate: "2020-01-01", endDate: "2021-01-01", sortOrder: 0 },
    { position: "Current", current: true, startDate: "2022-02-01", sortOrder: 99 },
    { position: "Hidden", isVisible: false },
  ]);
  await db.insert(education).values([
    { degree: "Degree", school: "School", startDate: "2018-09-01" },
    { degree: "Hidden", school: "School", isVisible: false },
  ]);
  await db.insert(skills).values([
    { name: "TypeScript", category: "Languages" },
    { name: "Hidden", category: "Languages", isVisible: false },
  ]);
}

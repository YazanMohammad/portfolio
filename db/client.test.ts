import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Neon HTTP client", () => {
  it("can be imported without a database URL and fails clearly on first use", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    const { db, getDb } = await import("./client");
    expect(db).toBeDefined();
    expect(() => getDb()).toThrow("DATABASE_URL missing");
    expect(() => db.select()).toThrow("DATABASE_URL missing");
  });

  it("lazily creates one schema-aware client with usable method bindings", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:password@example.neon.tech/database");
    const { db, getDb } = await import("./client");
    const { projects } = await import("./schema");
    expect(getDb()).toBe(getDb());
    expect(Object.keys(db.query).sort()).toEqual([
      "adminAccount", "adminSessions", "education", "experience", "loginAttempts", "messages",
      "profile", "projects", "siteSettings", "siteState", "skills",
    ]);
    expect(db.select().from(projects).toSQL().sql).toContain('from "projects"');
    const { select } = db;
    expect(select().from(projects).toSQL().sql).toContain('from "projects"');
    expect(typeof db.batch).toBe("function");
  });
});

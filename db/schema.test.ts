import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "./schema";

describe("portfolio schema", () => {
  it("stores unique project slugs and technology arrays", () => {
    const columns = getTableConfig(schema.projects).columns;
    expect(columns.find((column) => column.name === "slug")?.isUnique).toBe(true);
    const technologies = columns.find((column) => column.name === "technologies");
    expect(technologies?.dataType).toBe("array");
    expect(technologies?.notNull).toBe(true);
    expect(technologies?.hasDefault).toBe(true);
  });

  it("enforces singleton profile and site state rows", () => {
    for (const table of [schema.profile, schema.siteState, schema.siteSettings, schema.adminAccount]) {
      const config = getTableConfig(table);
      expect(config.checks).toHaveLength(1);
      const id = config.columns.find((column) => column.name === "id");
      expect(id?.primary).toBe(true);
      expect(id?.default).toBe(1);
    }
  });

  it("stores message archive and hashed IP data with rate-limit indexes", () => {
    expect(schema.messages.ipHash.name).toBe("ip_hash");
    expect(schema.messages.archivedAt.name).toBe("archived_at");
    for (const table of [schema.messages, schema.loginAttempts]) {
      const indexes = getTableConfig(table).indexes;
      expect(indexes).toHaveLength(1);
      expect(indexes[0].config.columns.map((column) => "name" in column ? column.name : undefined))
        .toEqual(["ip_hash", "created_at"]);
    }
  });

  it("stores the admin account as a singleton username and password hash", () => {
    const config = getTableConfig(schema.adminAccount);
    expect(config.name).toBe("admin_account");
    const byName = Object.fromEntries(config.columns.map((column) => [column.name, column]));
    expect(Object.keys(byName).sort()).toEqual(["id", "password_hash", "updated_at", "username", "version"]);
    expect(byName.version.notNull).toBe(true);
    expect(byName.version.default).toBe(1);
    expect(getTableConfig(schema.adminSessions).columns.map((column) => column.name)).toContain("account_version");
    expect(byName.username.notNull).toBe(true);
    expect(byName.password_hash.notNull).toBe(true);
    expect(byName.updated_at.notNull).toBe(true);
  });

  it("exports only the eleven supported tables", () => {
    expect(Object.keys(schema).sort()).toEqual([
      "adminAccount", "adminSessions", "education", "experience", "loginAttempts", "messages",
      "profile", "projects", "siteSettings", "siteState", "skills",
    ]);
    for (const name of ["testimonials", "blogPosts", "settings", "users"]) {
      expect(schema).not.toHaveProperty(name);
    }
  });
});

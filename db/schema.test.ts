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
    for (const table of [schema.profile, schema.siteState, schema.siteSettings]) {
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

  it("exports only the ten supported tables", () => {
    expect(Object.keys(schema).sort()).toEqual([
      "adminSessions", "education", "experience", "loginAttempts", "messages",
      "profile", "projects", "siteSettings", "siteState", "skills",
    ]);
    for (const name of ["testimonials", "blogPosts", "settings", "users"]) {
      expect(schema).not.toHaveProperty(name);
    }
  });
});

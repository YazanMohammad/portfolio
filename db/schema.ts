import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const siteSettings = pgTable("site_settings", {
  id: integer("id").primaryKey().default(1),
  copy: jsonb("copy").notNull().default({}),
  theme: jsonb("theme").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [check("site_settings_singleton", sql`${table.id} = 1`)]);

export const profile = pgTable("profile", {
  id: integer("id").primaryKey().default(1),
  name: text("name").notNull(),
  headline: text("headline").notNull(),
  intro: text("intro").notNull(),
  about: text("about").notNull().default(""),
  location: text("location"),
  email: text("email").notNull(),
  githubUrl: text("github_url"),
  linkedinUrl: text("linkedin_url"),
  available: boolean("available").notNull().default(false),
  availabilityText: text("availability_text"),
  photoKey: text("photo_key"),
  photoAlt: text("photo_alt"),
  cvKey: text("cv_key"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [check("profile_singleton", sql`${table.id} = 1`)]);

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  body: text("body").notNull().default(""),
  role: text("role"),
  category: text("category").notNull(),
  technologies: text("technologies").array().notNull().default(sql`'{}'::text[]`),
  liveUrl: text("live_url"),
  githubUrl: text("github_url"),
  imageKey: text("image_key"),
  imageAlt: text("image_alt"),
  featured: boolean("featured").notNull().default(false),
  isVisible: boolean("is_visible").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const experience = pgTable("experience", {
  id: serial("id").primaryKey(),
  position: text("position").notNull(),
  company: text("company"),
  location: text("location"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  current: boolean("current").notNull().default(false),
  bullets: text("bullets").array().notNull().default(sql`'{}'::text[]`),
  isVisible: boolean("is_visible").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const education = pgTable("education", {
  id: serial("id").primaryKey(),
  degree: text("degree").notNull(),
  school: text("school").notNull(),
  location: text("location"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  description: text("description"),
  isVisible: boolean("is_visible").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const skills = pgTable("skills", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  iconSlug: text("icon_slug"),
  isVisible: boolean("is_visible").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subject: text("subject"),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [index("messages_ip_hash_created_at_idx").on(table.ipHash, table.createdAt)]);

export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  ipHash: text("ip_hash").notNull(),
  success: boolean("success").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [index("login_attempts_ip_hash_created_at_idx").on(table.ipHash, table.createdAt)]);

export const adminSessions = pgTable("admin_sessions", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// The one admin login (singleton). Username is stored trimmed and compared case-insensitively;
// password_hash uses the scrypt format of server/password.ts. Set it with `pnpm admin:create`.
export const adminAccount = pgTable("admin_account", {
  id: integer("id").primaryKey().default(1),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [check("admin_account_singleton", sql`${table.id} = 1`)]);

export const siteState = pgTable("site_state", {
  id: integer("id").primaryKey().default(1),
  lastSavedAt: timestamp("last_saved_at", { withTimezone: true, mode: "date" }),
}, (table) => [check("site_state_singleton", sql`${table.id} = 1`)]);

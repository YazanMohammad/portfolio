import type { Config } from "@netlify/functions";
import type { z } from "zod";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { projects, experience, education, skills } from "../../db/schema";
import { ProjectInput, ExperienceInput, EducationInput, SkillInput, ReorderInput } from "../../shared/index";
import { adminHandler } from "../../server/handlers";
import { fail, json, noContent, notFound, readJson } from "../../server/http";
import { projectToRow, experienceToRow, educationToRow, skillToRow, toProject, toExperience, toEducation, toSkill } from "../../server/mappers";

import { touchLastSaved } from "../../server/last-saved";
import { purgeContent } from "../../server/cache";

type Collection = "projects" | "experience" | "education" | "skills";
type Table = typeof projects | typeof experience | typeof education | typeof skills;
// Keep the table and its conversions paired at this boundary.
function collection<I, R, O>(table: Table, schema: z.ZodType<I, z.ZodTypeDef, unknown>, toRow: (input: I) => R, fromRow: (row: R & { id: number }) => O) {
  return { table, schema, toRow: (input: unknown) => toRow(schema.parse(input)), fromRow: (row: unknown) => fromRow(row as R & { id: number }) };
}
const COLLECTIONS_CONFIG = {
  projects: collection(projects, ProjectInput, projectToRow, toProject),
  experience: collection(experience, ExperienceInput, experienceToRow, toExperience),
  education: collection(education, EducationInput, educationToRow, toEducation),
  skills: collection(skills, SkillInput, skillToRow, toSkill),
} satisfies Record<Collection, unknown>;

// Postgres unique violation, direct or wrapped by the driver.
function isUniqueViolation(error: unknown): boolean {
  for (let e = error, depth = 0; e && typeof e === "object" && depth < 3; e = (e as { cause?: unknown }).cause, depth++) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}
async function guardSlug<T>(isProject: boolean, write: () => Promise<T>): Promise<T> {
  try { return await write(); } catch (error) {
    if (isProject && isUniqueViolation(error)) throw fail("conflict", "That slug is already used.", { fields: { slug: "Slug is already used." } });
    throw error;
  }
}

export default adminHandler(async req => {
  const match = /^\/api\/admin\/(projects|experience|education|skills)(?:\/(order|[1-9]\d*))?$/.exec(new URL(req.url).pathname);
  if (!match) throw notFound();
  const settings = COLLECTIONS_CONFIG[match[1] as Collection];
  const { table } = settings;
  if (!match[2] && req.method === "GET") {
    const rows = await db.select().from(table).orderBy(asc(table.sortOrder), asc(table.id));
    return json(rows.map(row => settings.fromRow(row)));
  }
  if (!match[2] && req.method === "POST") {
    const input = await readJson(req, settings.schema);
    const rows = await db.select().from(table).orderBy(asc(table.sortOrder), asc(table.id));
    const sortOrder = Math.max(-1, ...rows.map(row => row.sortOrder)) + 1;
    const [saved] = await guardSlug(match[1] === "projects", async () => {
      const created = await db.insert(table).values({ ...settings.toRow(input), sortOrder }).returning();
      await touchLastSaved();
      return created;
    });
    if (match[1] === "projects") await purgeContent({ slugs: [(saved as typeof projects.$inferSelect).slug] });
    else await purgeContent();
    return json(settings.fromRow(saved), { status: 201 });
  }
  if (match[2] === "order" && req.method === "PUT") {
    const { ids } = await readJson(req, ReorderInput);
    const rows = await db.select().from(table).where(inArray(table.id, ids));
    const existing = new Set(rows.map(row => row.id));
    if (new Set(ids).size !== ids.length || ids.some(id => !existing.has(id))) throw fail("validation", "Check the fields.", { fields: { ids: "Use each existing ID once." } });
    const writes = ids.map((id, sortOrder) => db.update(table).set({ sortOrder }).where(eq(table.id, id)));
    await touchLastSaved(writes);
    if (match[1] === "projects") await purgeContent({ slugs: rows.map(row => (row as typeof projects.$inferSelect).slug) });
    else await purgeContent();
    return noContent();
  }
  if (match[2] && match[2] !== "order" && req.method === "PUT") {
    const id = Number(match[2]);
    if (!Number.isSafeInteger(id) || id > 2147483647) throw notFound();
    const input = await readJson(req, settings.schema);
    const [old] = await db.select().from(table).where(eq(table.id, id));
    if (!old) throw notFound();
    const saved = settings.toRow(input);
    await guardSlug(match[1] === "projects", () => touchLastSaved(db.update(table).set(saved).where(eq(table.id, id))));
    if (match[1] === "projects") {
      const previous = old as typeof projects.$inferSelect;
      const next = saved as typeof projects.$inferInsert;
      await purgeContent({ slugs: [previous.slug, next.slug] });
    }
    else await purgeContent();
    return json(settings.fromRow({ ...saved, id }));
  }
  if (match[2] && match[2] !== "order" && req.method === "DELETE") {
    const id = Number(match[2]);
    if (!Number.isSafeInteger(id) || id > 2147483647) throw notFound();
    const [old] = await db.select().from(table).where(eq(table.id, id));
    if (!old) throw notFound();
    await touchLastSaved(db.delete(table).where(eq(table.id, id)));
    if (match[1] === "projects") {
      const previous = old as typeof projects.$inferSelect;
      await purgeContent({ slugs: [previous.slug] });
    } else await purgeContent();
    return noContent();
  }
  throw notFound();
});
export const config: Config = { path: [
  "/api/admin/projects", "/api/admin/projects/order", "/api/admin/projects/:id",
  "/api/admin/experience", "/api/admin/experience/order", "/api/admin/experience/:id",
  "/api/admin/education", "/api/admin/education/order", "/api/admin/education/:id",
  "/api/admin/skills", "/api/admin/skills/order", "/api/admin/skills/:id",
] };

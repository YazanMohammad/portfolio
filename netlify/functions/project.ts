import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { projects } from "../../db/schema";
import { handle, json, notFound, publicCacheHeaders, toPublicProject } from "../../server/index";

export const config = { path: "/api/projects/:slug", method: "GET" };

export default handle(async (req) => {
  if (req.method !== "GET") throw notFound();
  const match = /^\/api\/projects\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(new URL(req.url).pathname);
  if (!match || match[1].length > 80) throw notFound();
  const slug = match[1];
  const [row] = await db.select().from(projects)
    .where(and(eq(projects.slug, slug), eq(projects.isVisible, true))).limit(1);
  if (!row?.isVisible) throw notFound();
  return json(toPublicProject(row), { headers: publicCacheHeaders(["content", `project:${slug}`]) });
});

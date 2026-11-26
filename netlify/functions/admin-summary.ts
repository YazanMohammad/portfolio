import type { Config } from "@netlify/functions";
import { asc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { education, experience, messages, profile, projects, siteState, skills } from "../../db/schema";
import type { AdminSummary } from "../../shared/index";
import { adminHandler } from "../../server/handlers";
import { json, notFound } from "../../server/http";
import { toMessage } from "../../server/mappers";
import { computeToFillIn } from "../../server/to-fill-in";

export default adminHandler(async req => {
  if (req.method !== "GET" || new URL(req.url).pathname !== "/api/admin/summary") throw notFound();
  const [person, projectRows, experienceRows, educationRows, skillRows, messageRows, state] = await Promise.all([
    db.query.profile.findFirst({ where: eq(profile.id, 1) }),
    db.query.projects.findMany({ orderBy: [asc(projects.sortOrder), asc(projects.id)] }),
    db.query.experience.findMany({ orderBy: [asc(experience.sortOrder), asc(experience.id)] }),
    db.query.education.findMany({ orderBy: [asc(education.sortOrder), asc(education.id)] }),
    db.query.skills.findMany({ columns: { id: true } }),
    db.query.messages.findMany({ where: isNull(messages.archivedAt) }),
    db.query.siteState.findFirst({ where: eq(siteState.id, 1) }),
  ]);
  const active = messageRows.filter(row => row.archivedAt === null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id);
  const unread = active.filter(row => !row.isRead);
  const summary: AdminSummary = {
    unreadCount: unread.length,
    recentMessages: (unread.length ? unread : active).slice(0, 3).map(toMessage),
    counts: { projects: projectRows.length, experience: experienceRows.length,
      education: educationRows.length, skills: skillRows.length, messages: active.length },
    toFillIn: computeToFillIn({ profile: person ?? null, projects: projectRows, experience: experienceRows, education: educationRows }),
    lastSavedAt: state?.lastSavedAt?.toISOString() ?? null,
  };
  return json(summary);
});
export const config: Config = { path: "/api/admin/summary" };

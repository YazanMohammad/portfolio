import type { Config } from "@netlify/functions";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { messages } from "../../db/schema";
import { MessagePatch } from "../../shared/index";
import { adminHandler } from "../../server/handlers";
import { fail, json, noContent, notFound, readJson } from "../../server/http";
import { toMessage } from "../../server/mappers";

export default adminHandler(async req => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname === "/api/admin/messages") {
    const statuses = url.searchParams.getAll("status");
    const status = statuses[0] ?? "all";
    if (statuses.length > 1 || !["all", "unread", "archived"].includes(status)) {
      throw fail("validation", "Check the fields.", { fields: { status: "Use unread, all or archived." } });
    }
    const where = status === "archived" ? isNotNull(messages.archivedAt)
      : status === "unread" ? and(isNull(messages.archivedAt), eq(messages.isRead, false))
      : isNull(messages.archivedAt);
    const rows = await db.query.messages.findMany({ where, orderBy: [desc(messages.createdAt), desc(messages.id)] });
    return json(rows.map(toMessage));
  }
  const match = /^\/api\/admin\/messages\/([1-9]\d*)$/.exec(url.pathname);
  if (!match || !["PATCH", "DELETE"].includes(req.method)) throw notFound();
  const id = Number(match[1]);
  if (!Number.isSafeInteger(id) || id > 2147483647) throw notFound();
  if (req.method === "DELETE") {
    const deleted = await db.delete(messages).where(eq(messages.id, id)).returning({ id: messages.id });
    if (!deleted.length) throw notFound();
    return noContent();
  }
  const patch = await readJson(req, MessagePatch);
  const values = {
    ...(patch.isRead === undefined ? {} : { isRead: patch.isRead }),
    ...(patch.archived === undefined ? {} : { archivedAt: patch.archived ? new Date() : null }),
  };
  const [saved] = await db.update(messages).set(values).where(eq(messages.id, id)).returning();
  if (!saved) throw notFound();
  return json(toMessage(saved));
});
export const config: Config = { path: ["/api/admin/messages", "/api/admin/messages/:id"] };

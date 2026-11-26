import { db } from "../../db/client";
import { profile } from "../../db/schema";
import { handle, notFound } from "../../server/index";

export const config = { path: "/cv", method: "GET" };

export default handle(async (req) => {
  if (req.method !== "GET") throw notFound();
  const [owner] = await db.select({ cvKey: profile.cvKey }).from(profile).limit(1);
  if (!owner?.cvKey) throw notFound();
  return new Response(null, { status: 302, headers: {
    Location: `/api/files/${encodeURIComponent(owner.cvKey)}`, "Cache-Control": "no-store",
  } });
});

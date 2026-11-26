import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { siteState } from "../db/schema";

type BatchWrite = Parameters<typeof db.batch>[0][number];
// An optional content write shares the HTTP batch transaction with the timestamp.
export async function touchLastSaved(write?: BatchWrite | BatchWrite[]): Promise<void> {
  const timestamp = db.insert(siteState).values({ id: 1, lastSavedAt: sql`now()` })
    .onConflictDoUpdate({ target: siteState.id, set: { lastSavedAt: sql`now()` } });
  if (Array.isArray(write)) {
    const [first, ...rest] = write;
    if (first) await db.batch([first, ...rest, timestamp]);
    else await timestamp;
  }
  else if (write) await db.batch([write, timestamp]);
  else await timestamp;
}

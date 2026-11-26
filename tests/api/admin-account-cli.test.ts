import { Readable } from "node:stream";
import { beforeEach, expect, it } from "vitest";
import { db } from "../../db/client";
import { adminAccount, adminSessions } from "../../db/schema";
import { run } from "../../server/bin/admin-account";
import { verifyPassword } from "../../server/password";
import { resetDb, testSession } from "./helpers";
import { describeDb } from "./describe-db";

const PASSWORD = "first long password";
const NEXT = "second long password";

async function cli(text: string) {
  const out: string[] = [];
  const io = { write: (t: string) => { out.push(t); return true; } };
  const code = await run({ stdin: Readable.from([text]) as unknown as Parameters<typeof run>[0]["stdin"], stdout: io, stderr: io }, { args: ["--yes"] });
  return { code, output: out.join("") };
}

describeDb("admin:create CLI (real db)", () => {
  beforeEach(resetDb);

  it("creates the singleton row and ends every existing session", async () => {
    await testSession(); await testSession();
    const { code, output } = await cli(`  Yazan \n${PASSWORD}\n${PASSWORD}\n`);
    expect(code).toBe(0); expect(output).toMatch(/Target database: .+\nMatches DATABASE_URL_TEST host: yes\n[\s\S]*Admin account saved\.\n$/);
    const rows = await db.select().from(adminAccount);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 1, username: "Yazan", version: 2 });
    expect(await verifyPassword(PASSWORD, rows[0].passwordHash)).toBe(true);
    expect(await db.select().from(adminSessions)).toHaveLength(0);
  });

  it("a second run replaces the account (upsert)", async () => {
    expect((await cli(`Yazan\n${PASSWORD}\n${PASSWORD}\n`)).code).toBe(0);
    expect((await db.select().from(adminAccount))[0].version).toBe(1);
    await testSession();
    expect((await cli(`admin2\n${NEXT}\n${NEXT}\n`)).code).toBe(0);
    const rows = await db.select().from(adminAccount);
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe("admin2");
    expect(rows[0].version).toBe(2);
    expect(await verifyPassword(NEXT, rows[0].passwordHash)).toBe(true);
    expect(await verifyPassword(PASSWORD, rows[0].passwordHash)).toBe(false);
    expect(await db.select().from(adminSessions)).toHaveLength(0);
  });

  it("invalid input changes nothing", async () => {
    await testSession();
    expect((await cli(`Yazan\n${PASSWORD}\nsomething else\n`)).code).toBe(1);
    expect((await cli(`ab\n${PASSWORD}\n${PASSWORD}\n`)).code).toBe(1);
    expect(await db.select().from(adminAccount)).toMatchObject([{ username: "test-admin", version: 1 }]);
    expect(await db.select().from(adminSessions)).toHaveLength(1);
  });
});

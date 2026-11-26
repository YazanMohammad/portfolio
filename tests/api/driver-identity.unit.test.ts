import { expect, it, vi } from "vitest";
import { neon, neonConfig } from "@neondatabase/serverless";
import { prepareTestDatabase, assertSafeReset } from "./db-safety";
// The installed driver resolves connection parameters, but its transport never runs.
it.each(["ep-test.us-east-1.aws.neon.tech", "EP-TEST.us-east-1.aws.neon.tech:5432", "ep-test-pooler.us-east-1.aws.neon.tech"])("accepted authority agrees with installed driver: %s", async (host) => {
  const target = `postgresql://user:pass@${host}/%6eeondb`;
  const env = { DATABASE_URL: "postgresql://user:pass@ep-main.us-east-1.aws.neon.tech/neondb", DATABASE_URL_TEST: target,
    DATABASE_URL_TEST_UNPOOLED: "postgresql://user:pass@ep-test.us-east-1.aws.neon.tech/neondb" };
  prepareTestDatabase(env); assertSafeReset(env);
  const original = neonConfig.fetchFunction;
  const transport = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
    const resolved = new URL(new Headers(init?.headers).get("Neon-Connection-String")!);
    expect(resolved.hostname).toBe(host.split(":")[0].toLowerCase());
    expect(resolved.port).toBe(host.includes(":") ? "5432" : "");
    expect(decodeURIComponent(resolved.pathname)).toBe("/neondb");
    return new Response(JSON.stringify({ fields: [], rows: [], rowCount: 0, command: "SELECT" }), { status: 200 });
  });
  neonConfig.fetchFunction = transport;
  try { await neon(target).query("SELECT 1"); expect(transport).toHaveBeenCalledOnce(); }
  finally { neonConfig.fetchFunction = original; }
});

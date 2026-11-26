import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { messages } from "../../db/schema";
import send from "../../netlify/functions/messages";
import { hashIp } from "../../server/ip";
import { call, resetDb } from "./helpers";
import { describeDb } from "./describe-db";
const input = { name: "Person", email: "person@example.com", subject: "Hello", message: "Hello there", website: "" };
const ip = "203.0.113.11";
// OWED-DB: do not execute until a disposable branch is independently verified.
describeDb("contact messages (real db)", () => {
  beforeEach(resetDb);
  const submit = (json: unknown = input, origin?: string) => call(send, { method: "POST", path: "/api/messages", json, ip, origin });
  it("stores a valid message with only the hashed IP", async () => {
    const response = await submit(); expect(response.status).toBe(201); expect(await response.json()).toEqual({ ok: true });
    const rows = await db.select().from(messages); expect(rows).toHaveLength(1);
    expect(rows[0].ipHash).toBe(hashIp(ip)); expect(rows[0].ipHash).not.toBe(ip);
    expect(Object.values(rows[0])).not.toContain(ip);
    expect(rows[0]).toMatchObject({ name: input.name, email: input.email, subject: input.subject, message: input.message });
  });
  it("honeypot rejects generically and stores nothing", async () => {
    const response = await submit({ ...input, website: "spam" }); expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "validation", message: "Check the fields." } });
    expect(await db.select().from(messages)).toHaveLength(0);
  });
  it.each([["name", "x".repeat(101)], ["email", "x".repeat(201)], ["subject", "x".repeat(151)], ["message", "x".repeat(5001)], ["message", ""]])("validates %s limits", async (field, value) => {
    const response = await submit({ ...input, [field]: value }); expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toHaveProperty(field); expect(await db.select().from(messages)).toHaveLength(0);
  });
  it("fourth message is 429 with Retry-After", async () => {
    for (let i = 0; i < 3; i++) expect((await submit()).status).toBe(201);
    const response = await submit(); expect(response.status).toBe(429); expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await db.select().from(messages)).toHaveLength(3);
  });
  it("invalid email stores nothing", async () => {
    expect((await submit({ ...input, email: "invalid" })).status).toBe(400); expect(await db.select().from(messages)).toHaveLength(0);
  });
  it("foreign origin stores nothing", async () => {
    expect((await submit(input, "https://foreign.test")).status).toBe(403); expect(await db.select().from(messages)).toHaveLength(0);
  });
  it("GET is 404", async () => {
    expect((await call(send, { path: "/api/messages" })).status).toBe(404); expect(await db.select().from(messages)).toHaveLength(0);
  });
});

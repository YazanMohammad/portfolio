import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("../admin-account", () => ({ saveAdminAccount: mocks.save }));
import { verifyPassword } from "../password";
import { run } from "./admin-account";

const PASSWORD = "correct horse battery";

function sink() {
  const chunks: string[] = [];
  return { chunks, text: () => chunks.join(""), write: (t: string) => { chunks.push(t); return true; } };
}

// A fake terminal: each prompt gets its answer typed in.
function terminal(initialRaw: boolean, answers: Record<string, string>) {
  const emitter = new EventEmitter();
  const modes: boolean[] = [];
  const stdin = {
    isTTY: true,
    isRaw: initialRaw,
    setRawMode: vi.fn((mode: boolean) => { modes.push(mode); stdin.isRaw = mode; return stdin; }),
    setEncoding: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
    on: vi.fn((event: string, fn: (...a: any[]) => void) => { emitter.on(event, fn); }),
    off: vi.fn((event: string, fn: (...a: any[]) => void) => { emitter.off(event, fn); }),
  };
  const stderr = sink();
  const write = stderr.write;
  stderr.write = (t: string) => {
    if (t in answers) setImmediate(() => emitter.emit("data", answers[t]));
    return write(t);
  };
  return { stdin, stderr, modes };
}

const TEST_URL = "postgres://u:p@ep-test-123.example.neon.tech/neondb?sslmode=require";
const CONFIRM = 'Type "yes" to write the admin account to this database: ';
const target = { env: { DATABASE_URL: TEST_URL, DATABASE_URL_TEST: TEST_URL }, args: ["--yes"] };
const piped = (text: string) => Readable.from([text]) as unknown as Parameters<typeof run>[0]["stdin"];

beforeEach(() => { mocks.save.mockReset(); mocks.save.mockResolvedValue(undefined); });

it.each([true, false])("terminal: asks username, then hidden password twice, saves, and restores raw mode %s", async (raw) => {
  const { stdin, stderr, modes } = terminal(raw, { [CONFIRM]: "yes\r", "Username: ": " Yazan \r", "Password: ": `${PASSWORD}\r`, "Again: ": `${PASSWORD}\r` });
  const stdout = sink();
  expect(await run({ stdin, stdout, stderr }, { ...target, args: [] })).toBe(0);
  expect(modes.at(-1)).toBe(raw); expect(stdin.isRaw).toBe(raw);
  expect(mocks.save).toHaveBeenCalledOnce();
  const [username, hash] = mocks.save.mock.calls[0];
  expect(username).toBe("Yazan");
  expect(hash).toMatch(/^scrypt\$/);
  expect(await verifyPassword(PASSWORD, hash)).toBe(true);
  expect(stdout.text()).toBe("Admin account saved.\n");
  expect(stderr.text().indexOf("Target database:")).toBeLessThan(stderr.text().indexOf("Username: "));
  // The username is echoed as typed; the password and the hash never are.
  expect(stderr.text()).toContain("Yazan");
  for (const secret of [PASSWORD, hash]) {
    expect(stdout.text()).not.toContain(secret); expect(stderr.text()).not.toContain(secret);
  }
});

it("piped input: three lines, username trimmed", async () => {
  const stdout = sink(); const stderr = sink();
  expect(await run({ stdin: piped(`  admin-user  \r\n${PASSWORD}\r\n${PASSWORD}\r\n`), stdout, stderr }, target)).toBe(0);
  expect(mocks.save.mock.calls[0][0]).toBe("admin-user");
  expect(await verifyPassword(PASSWORD, mocks.save.mock.calls[0][1])).toBe(true);
  expect(stdout.text()).toBe("Admin account saved.\n");
  expect(stdout.text() + stderr.text()).not.toContain(PASSWORD);
});

it.each([
  ["ab", PASSWORD, PASSWORD, "Username must be 3 to 64 characters."],
  ["x".repeat(65), PASSWORD, PASSWORD, "Username must be 3 to 64 characters."],
  ["admin", "short-pass1", "short-pass1", "Password must be at least 12 characters."],
  ["admin", PASSWORD, `${PASSWORD}!`, "The two passwords do not match."],
])("piped validation %j/%j/%j: %s", async (username, first, second, message) => {
  const stdout = sink(); const stderr = sink();
  expect(await run({ stdin: piped(`${username}\n${first}\n${second}\n`), stdout, stderr }, target)).toBe(1);
  expect(stderr.text().endsWith(`${message}\n`)).toBe(true);
  expect(stdout.text()).toBe("");
  expect(mocks.save).not.toHaveBeenCalled();
});

it("a save failure is reported without secrets", async () => {
  mocks.save.mockRejectedValue(new Error(`postgres://user:${PASSWORD}@host/db`));
  const stdout = sink(); const stderr = sink();
  expect(await run({ stdin: piped(`admin\n${PASSWORD}\n${PASSWORD}\n`), stdout, stderr }, target)).toBe(1);
  expect(stderr.text().endsWith("Could not save the admin account.\n")).toBe(true);
  expect(stdout.text() + stderr.text()).not.toContain(PASSWORD);
});

it("Ctrl+C at a prompt cancels with 130 and saves nothing", async () => {
  const { stdin, stderr, modes } = terminal(false, { [CONFIRM]: "yes\r", "Username: ": "adm\u0003" });
  expect(await run({ stdin, stdout: sink(), stderr }, { ...target, args: [] })).toBe(130);
  expect(modes.at(-1)).toBe(false);
  expect(mocks.save).not.toHaveBeenCalled();
});

describe("database target", () => {
  const PROD = "postgres://owner:s3cret-pass@ep-prod-999.example.neon.tech:5432/portfolio?sslmode=require&channel_binding=require";
  const reads = (text: string) => { const stdin = Readable.from([text]); const spy = vi.spyOn(stdin, "read"); return { stdin: stdin as unknown as Parameters<typeof run>[0]["stdin"], spy }; };

  it("prints only host, port and database name, and whether it is the TEST host", async () => {
    const stderr = sink();
    expect(await run({ stdin: piped(`admin\n${PASSWORD}\n${PASSWORD}\n`), stdout: sink(), stderr },
      { env: { DATABASE_URL: PROD, DATABASE_URL_TEST: TEST_URL }, args: ["--yes"], envFromFile: new Set(["DATABASE_URL"]) })).toBe(0);
    const text = stderr.text();
    expect(text).toContain("Target database: ep-prod-999.example.neon.tech:5432 / portfolio (DATABASE_URL from .env)");
    expect(text).toContain("Matches DATABASE_URL_TEST host: no");
    for (const secret of ["owner", "s3cret-pass", "sslmode", "channel_binding", "postgres://"]) expect(text).not.toContain(secret);
  });

  it("says when the URL came from the shell and when DATABASE_URL_TEST is missing", async () => {
    const stderr = sink();
    await run({ stdin: piped(`admin\n${PASSWORD}\n${PASSWORD}\n`), stdout: sink(), stderr }, { env: { DATABASE_URL: PROD }, args: ["--yes"], envFromFile: new Set() });
    expect(stderr.text()).toContain("(DATABASE_URL from the shell)");
    expect(stderr.text()).toContain("Matches DATABASE_URL_TEST host: no (DATABASE_URL_TEST is not set)");
  });

  it("compares the DATABASE_URL and DATABASE_URL_TEST hosts case-insensitively", async () => {
    const stderr = sink();
    await run({ stdin: piped(`admin\n${PASSWORD}\n${PASSWORD}\n`), stdout: sink(), stderr },
      { env: { DATABASE_URL: "postgres://u:p@DB.Example.INVALID/neondb", DATABASE_URL_TEST: "postgres://u:p@db.example.invalid/other" }, args: ["--yes"] });
    expect(stderr.text()).toContain("Matches DATABASE_URL_TEST host: yes");
  });

  it("reports a match with the TEST host", async () => {
    const stderr = sink();
    await run({ stdin: piped(`admin\n${PASSWORD}\n${PASSWORD}\n`), stdout: sink(), stderr }, target);
    expect(stderr.text()).toContain("Matches DATABASE_URL_TEST host: yes");
  });

  it.each([[{}, "DATABASE_URL is not set. Put it in .env."], [{ DATABASE_URL: "not a url" }, "DATABASE_URL is not a valid Postgres URL."],
    [{ DATABASE_URL: "https://example.com/db" }, "DATABASE_URL is not a valid Postgres URL."]])("refuses %j before reading any input", async (env, message) => {
    const { stdin, spy } = reads(`admin\n${PASSWORD}\n${PASSWORD}\n`);
    const stderr = sink();
    expect(await run({ stdin, stdout: sink(), stderr }, { env, args: ["--yes"] })).toBe(1);
    expect(stderr.text()).toBe(`${message}\n`);
    expect(spy).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("piped input without --yes refuses after showing the target, before reading input", async () => {
    const { stdin, spy } = reads(`admin\n${PASSWORD}\n${PASSWORD}\n`);
    const stderr = sink();
    expect(await run({ stdin, stdout: sink(), stderr }, { ...target, args: [] })).toBe(1);
    expect(stderr.text()).toContain("Target database:");
    expect(stderr.text().endsWith("Piped input needs --yes to confirm the target database.\n")).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each(["no", "", "YES please"])("terminal: answering %j cancels before the username prompt", async (answer) => {
    const { stdin, stderr } = terminal(false, { [CONFIRM]: `${answer}\r` });
    expect(await run({ stdin, stdout: sink(), stderr }, { ...target, args: [] })).toBe(1);
    expect(stderr.text()).not.toContain("Username: ");
    expect(stderr.text().endsWith("Cancelled. Nothing was changed.\n")).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

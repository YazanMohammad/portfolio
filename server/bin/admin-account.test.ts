import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";

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

const piped = (text: string) => Readable.from([text]) as unknown as Parameters<typeof run>[0]["stdin"];

beforeEach(() => { mocks.save.mockReset(); mocks.save.mockResolvedValue(undefined); });

it.each([true, false])("terminal: asks username, then hidden password twice, saves, and restores raw mode %s", async (raw) => {
  const { stdin, stderr, modes } = terminal(raw, { "Username: ": " Yazan \r", "Password: ": `${PASSWORD}\r`, "Again: ": `${PASSWORD}\r` });
  const stdout = sink();
  expect(await run({ stdin, stdout, stderr })).toBe(0);
  expect(modes.at(-1)).toBe(raw); expect(stdin.isRaw).toBe(raw);
  expect(mocks.save).toHaveBeenCalledOnce();
  const [username, hash] = mocks.save.mock.calls[0];
  expect(username).toBe("Yazan");
  expect(hash).toMatch(/^scrypt\$/);
  expect(await verifyPassword(PASSWORD, hash)).toBe(true);
  expect(stdout.text()).toBe("Admin account saved.\n");
  // The username is echoed as typed; the password and the hash never are.
  expect(stderr.text()).toContain("Yazan");
  for (const secret of [PASSWORD, hash]) {
    expect(stdout.text()).not.toContain(secret); expect(stderr.text()).not.toContain(secret);
  }
});

it("piped input: three lines, username trimmed", async () => {
  const stdout = sink(); const stderr = sink();
  expect(await run({ stdin: piped(`  admin-user  \r\n${PASSWORD}\r\n${PASSWORD}\r\n`), stdout, stderr })).toBe(0);
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
  expect(await run({ stdin: piped(`${username}\n${first}\n${second}\n`), stdout, stderr })).toBe(1);
  expect(stderr.text()).toBe(`${message}\n`);
  expect(stdout.text()).toBe("");
  expect(mocks.save).not.toHaveBeenCalled();
});

it("a save failure is reported without secrets", async () => {
  mocks.save.mockRejectedValue(new Error(`postgres://user:${PASSWORD}@host/db`));
  const stdout = sink(); const stderr = sink();
  expect(await run({ stdin: piped(`admin\n${PASSWORD}\n${PASSWORD}\n`), stdout, stderr })).toBe(1);
  expect(stderr.text()).toBe("Could not save the admin account.\n");
  expect(stdout.text() + stderr.text()).not.toContain(PASSWORD);
});

it("Ctrl+C at a prompt cancels with 130 and saves nothing", async () => {
  const { stdin, stderr, modes } = terminal(false, { "Username: ": "adm\u0003" });
  expect(await run({ stdin, stdout: sink(), stderr })).toBe(130);
  expect(modes.at(-1)).toBe(false);
  expect(mocks.save).not.toHaveBeenCalled();
});

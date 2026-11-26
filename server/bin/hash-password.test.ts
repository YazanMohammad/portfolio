import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { run } from "./hash-password";

function setup(initialRaw: boolean) {
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
  const out: string[] = [];
  const stdout = { write: (t: string) => { out.push(t); return true; } };
  // Each prompt gets the same password typed in.
  const stderr = {
    write: (t: string) => {
      if (t === "Password: " || t === "Again: ") setImmediate(() => emitter.emit("data", "correct horse battery\r"));
      return true;
    },
  };
  return { stdin, stdout, stderr, modes, out };
}

it("cli keeps the previous raw mode", async () => {
  const { stdin, stdout, stderr, modes, out } = setup(true);
  const code = await run({ stdin, stdout, stderr });
  expect(code).toBe(0);
  expect(out.join("")).toMatch(/^scrypt\$/);
  expect(modes.at(-1)).toBe(true);
  expect(stdin.isRaw).toBe(true);
});

it("cli restores raw mode off when it started off", async () => {
  const { stdin, stdout, stderr, modes } = setup(false);
  const code = await run({ stdin, stdout, stderr });
  expect(code).toBe(0);
  expect(modes.at(-1)).toBe(false);
  expect(stdin.isRaw).toBe(false);
});

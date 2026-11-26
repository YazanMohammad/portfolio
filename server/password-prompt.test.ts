import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { askHidden, PromptCancelled } from "./password-prompt";

function fakeStdin(options: { failOn?: "setEncoding" | "on" | "resume" } = {}) {
  const emitter = new EventEmitter();
  const modes: boolean[] = [];
  const stdin = {
    isTTY: true,
    isRaw: false,
    setRawMode: vi.fn((mode: boolean) => { modes.push(mode); stdin.isRaw = mode; return stdin; }),
    setEncoding: vi.fn(() => { if (options.failOn === "setEncoding") throw new Error("boom"); }),
    resume: vi.fn(() => { if (options.failOn === "resume") throw new Error("boom"); }),
    pause: vi.fn(),
    on: vi.fn((event: string, fn: (...a: any[]) => void) => {
      if (options.failOn === "on") throw new Error("boom");
      emitter.on(event, fn);
    }),
    off: vi.fn((event: string, fn: (...a: any[]) => void) => { emitter.off(event, fn); }),
    emit: (event: string, ...args: unknown[]) => emitter.emit(event, ...args),
    listeners: () => emitter.eventNames().reduce((n, e) => n + emitter.listenerCount(e), 0),
  };
  return { stdin, modes };
}

const output = { write: vi.fn() };

function expectRestored(stdin: ReturnType<typeof fakeStdin>["stdin"], modes: boolean[]) {
  expect(modes[0]).toBe(true);
  expect(modes.at(-1)).toBe(false);
  expect(stdin.isRaw).toBe(false);
  expect(stdin.pause).toHaveBeenCalled();
  expect(stdin.listeners()).toBe(0);
}

it("restores raw mode after success", async () => {
  const { stdin, modes } = fakeStdin();
  const answer = askHidden("Password: ", stdin, output);
  stdin.emit("data", "abcd\u007fe\r");
  await expect(answer).resolves.toBe("abce");
  expectRestored(stdin, modes);
});

it("restores raw mode on Ctrl+C", async () => {
  const { stdin, modes } = fakeStdin();
  const answer = askHidden("Password: ", stdin, output);
  stdin.emit("data", "abc\u0003");
  await expect(answer).rejects.toBeInstanceOf(PromptCancelled);
  expectRestored(stdin, modes);
});

it("restores raw mode when stdin errors", async () => {
  const { stdin, modes } = fakeStdin();
  const answer = askHidden("Password: ", stdin, output);
  stdin.emit("error", new Error("read failed"));
  await expect(answer).rejects.toThrow("Could not read input.");
  expectRestored(stdin, modes);
});

it("restores raw mode when stdin ends before input", async () => {
  const { stdin, modes } = fakeStdin();
  const answer = askHidden("Password: ", stdin, output);
  stdin.emit("end");
  await expect(answer).rejects.toBeInstanceOf(PromptCancelled);
  expectRestored(stdin, modes);
});

it.each(["setEncoding", "on", "resume"] as const)("restores raw mode when setup throws (%s)", async (failOn) => {
  const { stdin, modes } = fakeStdin({ failOn });
  await expect(askHidden("Password: ", stdin, output)).rejects.toThrow("boom");
  expectRestored(stdin, modes);
});

it("keeps raw mode on if it was on before", async () => {
  const { stdin, modes } = fakeStdin();
  stdin.isRaw = true;
  const answer = askHidden("Password: ", stdin, output);
  stdin.emit("data", "x\n");
  await expect(answer).resolves.toBe("x");
  expect(modes).toEqual([true, true]);
});

it("ignores input after the answer is done", async () => {
  const { stdin, modes } = fakeStdin();
  const answer = askHidden("Password: ", stdin, output);
  stdin.emit("data", "ab\rcd\u0003");
  await expect(answer).resolves.toBe("ab");
  expect(modes).toEqual([true, false]);
});

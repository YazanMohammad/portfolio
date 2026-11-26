// Terminal prompts in raw mode: askHidden (no echo, for passwords) and askVisible (echo).
// Enter ends, Backspace deletes, Ctrl+C or Ctrl+D cancels.
// Whatever happens (success, cancel, stream error, end, setup failure) the terminal mode is put back.

export class PromptCancelled extends Error {
  constructor() {
    super("Cancelled.");
    this.name = "PromptCancelled";
  }
}

type Listener = (...args: any[]) => void;

// The parts of process.stdin we use; tests pass a fake.
export type PromptInput = {
  isRaw?: boolean;
  setRawMode(mode: boolean): unknown;
  setEncoding?(encoding: "utf8"): unknown;
  resume(): unknown;
  pause(): unknown;
  on(event: string, listener: Listener): unknown;
  off(event: string, listener: Listener): unknown;
};

export type PromptOutput = { write(text: string): unknown };

export function askHidden(prompt: string, input: PromptInput, output: PromptOutput): Promise<string> {
  return ask(prompt, input, output, false);
}

// Same as askHidden, but echoes what is typed (for a username).
export function askVisible(prompt: string, input: PromptInput, output: PromptOutput): Promise<string> {
  return ask(prompt, input, output, true);
}

function ask(prompt: string, input: PromptInput, output: PromptOutput, echo: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const wasRaw = input.isRaw === true;
    let value = "";
    let settled = false;

    const cleanup = () => {
      for (const [event, listener] of listeners) {
        try { input.off(event, listener); } catch { /* keep going */ }
      }
      try { input.setRawMode(wasRaw); } catch { /* keep going */ }
      try { input.pause(); } catch { /* keep going */ }
    };

    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      try { output.write("\n"); } catch { /* ignore */ }
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk: unknown) => {
      for (const ch of String(chunk)) {
        if (settled) return;
        if (ch === "\u0003" || ch === "\u0004") finish(new PromptCancelled());
        else if (ch === "\r" || ch === "\n") finish(null);
        else if (ch === "\u007f" || ch === "\b") {
          if (echo && value !== "") output.write("\b \b");
          value = [...value].slice(0, -1).join("");
        } else if (ch >= " ") {
          value += ch;
          if (echo) output.write(ch);
        }
      }
    };
    const onError = () => finish(new Error("Could not read input."));
    const onEnd = () => finish(new PromptCancelled());

    const listeners: [string, Listener][] = [
      ["data", onData],
      ["error", onError],
      ["end", onEnd],
      ["close", onEnd],
    ];

    try {
      output.write(prompt);
      input.setRawMode(true);
      input.setEncoding?.("utf8");
      for (const [event, listener] of listeners) input.on(event, listener);
      input.resume();
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Could not read input."));
    }
  });
}

import type { IncomingMessage } from "node:http";
import { fail, json } from "../server/http";

export class BodyBudget {
  private used = 0;
  constructor(readonly limit: number) {}
  reserve(bytes: number): boolean {
    if (this.used + bytes > this.limit) return false;
    this.used += bytes;
    return true;
  }
  release(bytes: number) { this.used -= bytes; }
}
export const busyResponse = () => json({ error: { code: "server", message: "Server is busy. Try again shortly." } }, { status: 503, headers: { "Retry-After": "1" } });

// No data listener and zero queue high-water mark: not a byte is pulled until a handler reads.
// Reserve ALL consumed bytes until the handler and response settle: handlers may buffer them.
export function cappedBody(req: IncomingMessage, max: number, budget: BodyBudget, signal: AbortSignal) {
  let total = 0;
  let held = 0;
  let ended = false;
  let stopped = false;
  let failure: Response | undefined;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let wake: (() => void) | undefined;
  const cleanup = () => {
    req.off("readable", readable); req.off("end", readable); req.off("aborted", disconnected); req.off("error", disconnected);
    signal.removeEventListener("abort", abort);
  };
  const stop = (error = fail("server", "Request ended.")) => {
    if (stopped) return;
    stopped = true;
    cleanup(); req.pause();
    if (!ended) controller.error(error);
    wake?.(); wake = undefined;
  };
  const readable = () => { wake?.(); wake = undefined; };
  const disconnected = () => stop();
  const abort = () => stop();
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
      req.on("readable", readable); req.on("end", readable); req.on("aborted", disconnected); req.on("error", disconnected);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    },
    async pull() {
      while (!stopped) {
        const chunk: Buffer | null = req.read();
        if (chunk) {
          total += chunk.length;
          if (total > max) {
            const error = fail("too_large", "Request is too large.");
            failure = json({ error: { code: error.code, message: error.message } }, { status: 413 });
            stop(error); return;
          }
          if (!budget.reserve(chunk.length)) {
            failure = busyResponse(); stop(); return;
          }
          held += chunk.length;
          controller.enqueue(chunk);
          return;
        }
        if (req.readableEnded || (req.complete && req.readableLength === 0)) {
          ended = true; stopped = true; cleanup(); controller.close(); return;
        }
        await new Promise<void>(resolve => { wake = resolve; });
      }
    },
    cancel() { stopped = true; cleanup(); req.pause(); wake?.(); wake = undefined; },
  }, { highWaterMark: 0 });
  return {
    stream,
    get failure() { return failure; },
    get ended() { return ended; },
    stop,
    release() { stop(); budget.release(held); held = 0; },
  };
}

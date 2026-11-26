import type { UseFormSetError } from "react-hook-form";
import { ApiRequestError } from "@/lib/api";

const GENERIC = "Could not save. Check your connection and try again.";

type Options = {
  /** Field that shows the 409 message (usually "slug"). */
  conflictField?: string;
  /** Full paths that have an input (e.g. "title", "bullets.0"). Keys outside this list go into the returned form-level message. */
  knownFields: readonly string[];
};

/** Maps a failed save onto form fields. Returns a form-level message, or null when every error found a field. */
export function applyServerError(
  err: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setError: UseFormSetError<any>,
  opts: Options,
): string | null {
  if (!(err instanceof ApiRequestError)) return GENERIC;

  if (err.code === "conflict" && opts.conflictField) {
    setError(opts.conflictField, { type: "server", message: "That address is already used." });
    return null;
  }

  if (err.fields && Object.keys(err.fields).length > 0) {
    const loose: string[] = [];
    for (const [path, message] of Object.entries(err.fields)) {
      if (opts.knownFields.includes(path)) setError(path, { type: "server", message });
      else loose.push(`${path}: ${message}`);
    }
    return loose.length ? loose.join("\n") : null;
  }

  return err.message || GENERIC;
}

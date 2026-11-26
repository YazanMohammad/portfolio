import type { Context } from "@netlify/functions";
import type { z, ZodTypeAny } from "zod";
import { ERROR_STATUS, type ApiError, type ErrorCode } from "../shared/index";
import { zodFields } from "./zod-fields";

type ErrorOptions = { fields?: Record<string, string>; retryAfter?: number };

export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;
  readonly retryAfter?: number;

  constructor(code: ErrorCode, message: string, opts: ErrorOptions = {}) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.fields = opts.fields;
    this.retryAfter = opts.retryAfter;
  }
}

export function fail(code: ErrorCode, message: string, opts?: ErrorOptions): HttpError {
  return new HttpError(code, message, opts);
}

function responseHeaders(headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  if (!result.has("Cache-Control")) result.set("Cache-Control", "no-store");
  return result;
}

export function json(data: unknown, init: { status?: number; headers?: HeadersInit } = {}): Response {
  const headers = responseHeaders(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}

export function noContent(headers?: HeadersInit): Response {
  return new Response(null, { status: 204, headers: responseHeaders(headers) });
}

// Default JSON body cap. Routes with larger legitimate bodies pass their own cap (4 bytes per
// character worst case for UTF-8, plus overhead).
export const DEFAULT_BODY_BYTES = 64 * 1024;
// ProjectInput max: body 20000 + ~5.9k chars of other fields (two 2048-char URLs included) ~= 26k chars x 4 B ~= 104 KB.
export const COLLECTION_BODY_BYTES = 128 * 1024;
// Settings: ~85 copy leaves x 300 chars (7 x 1000) ~= 30k chars x 4 B ~= 120 KB plus keys.
export const SETTINGS_BODY_BYTES = 160 * 1024;

export async function readJson<S extends ZodTypeAny>(req: Request, schema: S, maxBytes = DEFAULT_BODY_BYTES): Promise<z.infer<S>> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw fail("too_large", "Request is too large.");
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw fail("too_large", "Request is too large.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw fail("validation", "Invalid JSON.", { fields: { "": "Send a JSON object." } });
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw fail("validation", "Send a JSON object.", { fields: { "": "Send a JSON object." } });
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw fail("validation", "Check the fields.", { fields: zodFields(parsed.error) });
  return parsed.data;
}

// Turns any thrown value into the JSON error response. Exported so adminHandler can build the
// same response before adding its renewed cookie.
export function errorResponse(error: unknown): Response {
  const known = error instanceof HttpError;
  // Do not log exceptions or requests: either may contain secrets.
  if (!known) console.error("Unhandled server error.");
  const httpError = known ? error : fail("server", "Something went wrong.");
  const body: ApiError = { error: { code: httpError.code, message: httpError.message } };
  if (httpError.fields) body.error.fields = httpError.fields;
  const headers = new Headers();
  if (httpError.status === 429 && httpError.retryAfter !== undefined) {
    headers.set("Retry-After", String(httpError.retryAfter));
  }
  return json(body, { status: httpError.status, headers });
}

export function handle(fn: (req: Request, ctx: Context) => Promise<Response>) {
  return async (req: Request, ctx: Context): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function notFound(): HttpError {
  return fail("not_found", "Not found.");
}

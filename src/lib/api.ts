import type { ApiError, ErrorCode, UploadResult } from "@shared/index";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: ErrorCode,
    public fields?: Record<string, string>,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

const errorCodes: readonly ErrorCode[] = [
  "validation", "unauthorized", "forbidden_origin", "not_found", "conflict",
  "too_large", "unsupported_type", "rate_limited", "server",
];
const fallbackCodes: Partial<Record<number, ErrorCode>> = {
  401: "unauthorized", 403: "forbidden_origin", 404: "not_found",
  413: "too_large", 415: "unsupported_type", 429: "rate_limited",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiError(value: unknown): value is ApiError {
  if (!isRecord(value) || !isRecord(value.error)) return false;
  const { code, message, fields } = value.error;
  return typeof code === "string" && errorCodes.includes(code as ErrorCode)
    && typeof message === "string"
    && (fields === undefined || (isRecord(fields)
      && Object.values(fields).every((field) => typeof field === "string")));
}

async function request<T>(path: string, options: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...options, credentials: "same-origin" });
  } catch {
    throw new ApiRequestError("Unable to reach the server", 0, "server");
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const error = isApiError(body) ? body.error : {
      code: fallbackCodes[response.status] ?? "server",
      message: `Request failed (${response.status})`,
      fields: undefined,
    };
    const retryHeader = response.headers.get("Retry-After");
    const seconds = retryHeader !== null && /^\d+$/.test(retryHeader) ? Number(retryHeader) : NaN;
    const retryAfter = Number.isSafeInteger(seconds) ? seconds : undefined;
    throw new ApiRequestError(error.message, response.status, error.code, error.fields, retryAfter);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function apiUpload(kind: "image" | "cv", file: File): Promise<UploadResult> {
  const body = new FormData();
  body.append("file", file);
  return request<UploadResult>(`/api/admin/files?kind=${kind}`, { method: "POST", body });
}

export function fileUrl(key: string): string {
  return `/api/files/${encodeURIComponent(key)}`;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export function apiSend<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  return request<T>(path, {
    method,
    ...(body === undefined ? {} : {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
}

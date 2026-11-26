import { ApiRequestError } from "@/lib/api";

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

export function uploadErrorMessage(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : "Upload failed. Try again.";
}

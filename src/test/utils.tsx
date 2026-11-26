import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ErrorCode } from "@shared/index";
import { ApiRequestError } from "@/lib/api";

export function renderWithClient(ui: ReactElement, { path = "/" }: { path?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { hook } = memoryLocation({ path });
  const result = render(
    <QueryClientProvider client={client}>
      <Router hook={hook}>{ui}</Router>
    </QueryClientProvider>,
  );
  return { ...result, client };
}

export function makeApiError({
  status = 500,
  code,
  message = "Request failed",
  fields,
  retryAfter,
}: {
  status?: number;
  code?: ErrorCode;
  message?: string;
  fields?: Record<string, string>;
  retryAfter?: number;
} = {}): ApiRequestError {
  const fallback: ErrorCode = status === 404 ? "not_found" : status === 429 ? "rate_limited" : status === 400 ? "validation" : "server";
  return new ApiRequestError(message, status, code ?? fallback, fields, retryAfter);
}

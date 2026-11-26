import type { Context } from "@netlify/functions";
import { errorResponse, handle } from "./http";
import { checkOrigin } from "./origin";
import { cookieName, requireAdmin } from "./sessions";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// The one wrapper every admin function must use: `export default adminHandler(...)`.
// Writes: checkOrigin first (a foreign origin gets 403 even without a session), then requireAdmin.
// Reads: requireAdmin only. A renewed session cookie is added to the response, errors included.
export function adminHandler(fn: (req: Request, ctx: Context) => Promise<Response>) {
  // The outer handle() is the last boundary: if decoration itself throws, the result is the
  // generic 500 JSON (without the cookie) instead of an escaped exception.
  return handle(async (req, ctx) => {
    if (!READ_METHODS.has(req.method.toUpperCase())) checkOrigin(req);
    // A failed origin check or requireAdmin throws here: their error responses carry no cookie.
    const { renewedCookie } = await requireAdmin(req);
    let response: Response;
    try {
      response = await fn(req, ctx);
    } catch (error) {
      // The session was already renewed in the DB, so the error response must carry the cookie too.
      response = errorResponse(error);
    }
    // A handler that issued a new session (account change) owns the cookie: never re-send the old one.
    const rotated = response.headers.getSetCookie().some(value => value.startsWith(`${cookieName()}=`));
    return renewedCookie === null || rotated ? response : withSetCookie(response, renewedCookie);
  });
}

// Copy the headers: a handler's Response may have immutable headers.
function withSetCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

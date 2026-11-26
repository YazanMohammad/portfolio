import { env, isLocalHttpOrigin } from "./env";
import { fail } from "./http";

// SITE_ORIGIN must be a bare web origin exactly as browsers send it: https, or local http.
// No trailing slash, path, credentials or upper case (URL.origin would normalize those away).
function isValidSiteOrigin(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.origin !== value) return false;
  return url.protocol === "https:" || isLocalHttpOrigin(value);
}

// Validate each distinct SITE_ORIGIN value once; log a misconfiguration once, without its value.
let checkedValue: string | undefined;
let checkedValid = false;
function siteOriginValid(value: string): boolean {
  if (value !== checkedValue) {
    checkedValue = value;
    checkedValid = isValidSiteOrigin(value);
    if (!checkedValid) console.error("SITE_ORIGIN is not a valid https (or local http) origin; rejecting all admin writes.");
  }
  return checkedValid;
}

// CSRF guard for admin writes. Fails closed: an invalid SITE_ORIGIN rejects every write, and the
// opaque Origin "null" is always rejected. Otherwise the Origin header must equal SITE_ORIGIN
// exactly: no prefix or case-insensitive match, so lookalikes such as "https://site.com.evil.com"
// fail. A missing header fails too. adminHandler does not call this for GET, HEAD or OPTIONS.
export function checkOrigin(req: Request): void {
  const origin = req.headers.get("Origin");
  const site = env("SITE_ORIGIN");
  if (!siteOriginValid(site) || origin === null || origin === "null" || origin !== site) {
    throw fail("forbidden_origin", "Request origin not allowed.");
  }
}

/**
 * Returns the URL if it is safe to put in an href, otherwise null.
 * Allowed: a same-origin path starting with a single "/", http(s) URLs, and mailto: when allowMailto.
 * Pure (no browser APIs) so the Vite plugin can import it too.
 */
export function safeHref(url: string | null | undefined, opts: { allowMailto?: boolean } = {}): string | null {
  if (typeof url !== "string" || url === "") return null;
  // Control characters and whitespace anywhere are how scheme filters get bypassed (java\tscript:).
  if (/[\u0000-\u0020\u007f-\u009f]/.test(url)) return null;
  if (url.startsWith("/")) {
    return url.startsWith("//") || url.startsWith("/" + String.fromCharCode(92)) ? null : url;
  }
  if (/^https?:[/][/]/i.test(url) && !"/".concat(String.fromCharCode(92)).includes(url.charAt(url.indexOf("//") + 2)) && url.length > url.indexOf("//") + 2) return url;
  if (opts.allowMailto && /^mailto:./i.test(url)) return url;
  return null;
}

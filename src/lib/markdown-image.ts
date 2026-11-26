// Markdown images may only point at our own file route. The CSP is img-src 'self' data:, so any
// other source would render as a broken image. Do not widen the CSP; drop the image instead.
const CONTROL = /[\u0000-\u0020\u007f-\u009f\\]/;

export function isSafeImageSrc(src: string | undefined): src is string {
  if (!src || CONTROL.test(src)) return false;
  try {
    const decoded = decodeURIComponent(src);
    if (CONTROL.test(decoded)) return false;
    if (!/^\/api\/files\/[A-Za-z0-9_.!~*'()%-]+$/.test(src)) return false;
    return !decoded.split("/").some((part) => part === "." || part === "..");
  } catch {
    return false;
  }
}

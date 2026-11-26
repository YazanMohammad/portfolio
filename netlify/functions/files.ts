import { getFile, handle, notFound } from "../../server/index";

export const config = { path: "/api/files/:key", method: "GET" };

export default handle(async (req) => {
  if (req.method !== "GET") throw notFound();
  const match = /^\/api\/files\/([^/]+)$/.exec(new URL(req.url).pathname);
  if (!match) throw notFound();
  let key: string;
  try {
    key = decodeURIComponent(match[1]);
  } catch {
    throw notFound();
  }
  const file = await getFile(key);
  if (!file) throw notFound();
  const headers = new Headers({
    "Content-Type": file.contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
  });
  if (file.contentType === "application/pdf") headers.set("Content-Disposition", 'inline; filename="cv.pdf"');
  return new Response(file.bytes, { headers });
});

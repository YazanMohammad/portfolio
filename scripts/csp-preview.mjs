// TEST-ONLY: serves dist/ with the production CSP so the page can be checked for violations.
// Usage: node scripts/csp-preview.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../dist");
const port = Number(process.argv[2] ?? 4173);
const CSP = process.argv[3] === "nocsp" ? "" : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg" };

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x").pathname;
  const file = path.join(root, path.normalize(url === "/" ? "/index.html" : url));
  let body;
  try {
    if (!file.startsWith(root)) throw new Error("outside");
    body = await readFile(file);
  } catch {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream", ...(CSP ? { "content-security-policy": CSP } : {}) });
  res.end(body);
}).listen(port, () => console.log(`csp preview on http://localhost:${port}`));

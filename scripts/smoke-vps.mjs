// Release-local HTTP smoke. No database/environment file is loaded or needed.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const { createAppServer } = await import("../dist-server/server.mjs");
const server = createAppServer({ distDir: fileURLToPath(new URL("../dist/", import.meta.url)), routes: [], log: () => {} });
try {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(origin + "/");
  assert.equal(home.status, 200);
  assert(home.headers.get("content-security-policy"));
  const html = await home.text();
  const asset = html.match(/(?:src|href)="(\/assets\/[^"]+)"/)?.[1];
  assert(asset, "SPA must reference a built asset");
  const chunk = await fetch(origin + asset); assert.equal(chunk.status, 200); await chunk.arrayBuffer();
  const fallback = await fetch(origin + "/api/nope"); assert.equal(fallback.status, 404); await fallback.arrayBuffer();
  console.log("Release HTTP smoke: HTML, CSP, built asset, API fallback OK");
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

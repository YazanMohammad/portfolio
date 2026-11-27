import { expect, it } from "vitest";
import { readFileSync } from "node:fs";

it("builds an isolated release and only then atomically changes current", () => {
  const script = readFileSync("deploy/vps/deploy.sh", "utf8");
  expect(script).toContain("git archive");
  expect(script).toContain("mktemp -d");
  expect(script.indexOf("pnpm build:vps")).toBeLessThan(script.indexOf("mv -Tf"));
  expect(script).toContain("scripts/smoke-vps.mjs");
  expect(script).toContain("previous");
  expect(script).not.toMatch(/pnpm (?:db:|admin:)/);
  const unit = readFileSync("deploy/vps/portfolio.service", "utf8");
  expect(unit).toContain("WorkingDirectory=/home/hosting/portfolio/current");
  expect(unit).toContain("ExecStart=/usr/bin/node /home/hosting/portfolio/current/dist-server/server.mjs");
  expect(unit).toContain("EnvironmentFile=/home/hosting/portfolio/.env");
  expect(unit).toContain("ReadWritePaths=/home/hosting/data/portfolio");
});
it("ships a per-app canonical-domain snippet and keeps the shared Caddy host separate", () => {
  const main = readFileSync("deploy/vps/Caddyfile", "utf8");
  expect(main).toContain("import /etc/caddy/sites/*.caddy");
  expect(main).toContain("vps.yznmoh.com {");
  expect(main).not.toContain("reverse_proxy");
  const caddy = readFileSync("deploy/vps/portfolio.caddy", "utf8");
  expect(caddy).toContain("www.yznmoh.com {");
  expect(caddy).toContain("yznmoh.com, 185-189-1-11.sslip.io {");
  expect(caddy).toContain("redir https://www.yznmoh.com{uri} 301");
  expect(caddy).toContain('header Strict-Transport-Security "max-age=31536000"');
  expect(caddy).toContain("header -Server");
  expect(caddy).toContain("max_size 4259840");
  expect(caddy).toContain("reverse_proxy 127.0.0.1:3000");
  expect(readFileSync("shared/security-headers.json", "utf8")).not.toContain("Strict-Transport-Security");
});

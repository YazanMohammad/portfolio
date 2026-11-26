import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";

const source = fileURLToPath(new URL("./load-env.ts", import.meta.url));
const fixtures: string[] = [];
const key = "PORTFOLIO_ENV_LOADER_TEST";
const other = "PORTFOLIO_ENV_LOADER_OTHER";

function fixture() {
  expect(existsSync(source), "loadRootEnv implementation exists").toBe(true);
  const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "portfolio-env-"));
  fixtures.push(root);
  mkdirSync(join(root, "db"));
  mkdirSync(join(root, "elsewhere"));
  writeFileSync(join(root, "db/load-env.ts"), readFileSync(source));
  return root;
}

function run(root: string, existing?: string, name = key) {
  const env = { ...process.env };
  delete env[key];
  delete env[other];
  if (existing !== undefined) env[name] = existing;
  const url = pathToFileURL(join(root, "db/load-env.ts")).href;
  return execFileSync(process.execPath, [
    "--input-type=module",
    "--eval",
    `import { loadRootEnv } from ${JSON.stringify(url)}; loadRootEnv(); process.stdout.write(process.env.${name} ?? "unset");`,
  ], { cwd: join(root, "elsewhere"), env, encoding: "utf8" });
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("does nothing when the repository has no .env", () => {
  expect(run(fixture())).toBe("unset");
});

test("loads the repository .env, not the working directory .env", () => {
  const root = fixture();
  writeFileSync(join(root, ".env"), `${key}=repo\n`);
  writeFileSync(join(root, "elsewhere/.env"), `${key}=cwd\n`);
  expect(run(root)).toBe("repo");
});

test(".env overrides an inherited environment variable", () => {
  const root = fixture();
  writeFileSync(join(root, ".env"), `${key}=repo\n`);
  expect(run(root, "inherited")).toBe("repo");
});

test("leaves inherited keys that .env does not define untouched", () => {
  const root = fixture();
  writeFileSync(join(root, ".env"), `${key}=repo\n`);
  expect(run(root, "inherited", other)).toBe("inherited");
});

test("an empty value in .env still overrides", () => {
  const root = fixture();
  writeFileSync(join(root, ".env"), `${key}=\n`);
  expect(run(root, "inherited")).toBe("");
});

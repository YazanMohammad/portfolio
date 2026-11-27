import { readFile, writeFile } from "node:fs/promises";
const source = JSON.parse(await readFile(new URL("../shared/security-headers.json", import.meta.url), "utf8"));
const target = new URL("../netlify.toml", import.meta.url);
const current = await readFile(target, "utf8");
const before = current.split("[[headers]]")[0];
const next = before + '[[headers]]\n  for = "/*"\n  [headers.values]\n' + Object.entries(source).map(([key, value]) => `    ${key} = ${JSON.stringify(value)}`).join("\n") + "\n";
if (process.argv.includes("--check")) {
  if (current.replaceAll("\r\n", "\n").trimEnd() !== next.replaceAll("\r\n", "\n").trimEnd()) throw new Error("Security header drift: run node scripts/sync-security-headers.mjs and commit netlify.toml.");
} else await writeFile(target, next);

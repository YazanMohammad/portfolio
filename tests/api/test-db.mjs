// `pnpm test:db`: RUN_DB_TESTS=1 vitest run --project node tests/api, cross-platform
// (pnpm runs scripts through cmd.exe on Windows, where `VAR=1 command` does not work).
process.env.RUN_DB_TESTS = "1";
const { startVitest } = await import("vitest/node");
const filters = process.argv.slice(2);
const vitest = await startVitest("test", filters.length ? filters : ["tests/api"], { run: true, project: ["node"] });
await vitest?.close();
if (!vitest) process.exitCode = 1;

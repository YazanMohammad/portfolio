// Creates or replaces the admin account in the database. Usage: pnpm admin:create
// (or node_modules/.bin/tsx server/bin/admin-account.ts). Reads the root .env, so .env wins over
// a DATABASE_URL inherited from the shell. Before anything else it shows which database it will
// write to (host, port, database name only) and asks you to type "yes"; piped input (three lines:
// username, password, again) needs the --yes flag instead. Then it asks Username, then the
// password twice (hidden on a terminal). Saving ends every admin session. Never prints the
// password, the hash, the connection string or driver errors.
import { pathToFileURL } from "node:url";
import { loadRootEnv } from "../../db/load-env";
import { AdminPassword, AdminUsername, ADMIN_PASSWORD_MIN } from "../../shared/schemas";
import { saveAdminAccount } from "../admin-account";
import { hashPassword } from "../password";
import { askHidden, askVisible, PromptCancelled, type PromptInput, type PromptOutput } from "../password-prompt";

class UserError extends Error {}

export type CliStdin = PromptInput & AsyncIterable<unknown> & { isTTY?: boolean };
export type CliIo = { stdin: Partial<CliStdin> & Partial<PromptInput>; stdout: PromptOutput; stderr: PromptOutput };
export type CliOptions = {
  env?: Record<string, string | undefined>;
  args?: string[];
  // Keys the root .env set (from loadRootEnv), to say where DATABASE_URL came from.
  envFromFile?: ReadonlySet<string>;
};

export const CONFIRM_PROMPT = 'Type "yes" to write the admin account to this database: ';

function parseDatabaseUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "postgres:" || url.protocol === "postgresql:" ? url : null;
  } catch {
    return null;
  }
}

// host[:port] / database: no user, password or query string.
function describeTarget(env: NonNullable<CliOptions["env"]>, envFromFile?: ReadonlySet<string>): string[] {
  const raw = env.DATABASE_URL;
  if (!raw) throw new UserError("DATABASE_URL is not set. Put it in .env.");
  const url = parseDatabaseUrl(raw);
  if (!url || !url.hostname) throw new UserError("DATABASE_URL is not a valid Postgres URL.");
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "(default)";
  const source = envFromFile === undefined ? "" : envFromFile.has("DATABASE_URL") ? " (DATABASE_URL from .env)" : " (DATABASE_URL from the shell)";
  const test = env.DATABASE_URL_TEST ? parseDatabaseUrl(env.DATABASE_URL_TEST) : null;
  const match = !env.DATABASE_URL_TEST ? "no (DATABASE_URL_TEST is not set)" : test && test.hostname === url.hostname ? "yes" : "no";
  return [`Target database: ${url.host} / ${database}${source}`, `Matches DATABASE_URL_TEST host: ${match}`];
}

async function readPipedLines(stdin: CliIo["stdin"]): Promise<[string, string, string]> {
  let text = "";
  stdin.setEncoding?.("utf8");
  for await (const chunk of stdin as AsyncIterable<unknown>) text += String(chunk);
  const lines = text.split(/\r?\n/);
  return [lines[0] ?? "", lines[1] ?? "", lines[2] ?? ""];
}

async function main({ stdin, stdout, stderr }: CliIo, options: CliOptions): Promise<void> {
  const env = options.env ?? process.env;
  const args = options.args ?? [];
  // Preflight: nothing is read from stdin until the target is known and confirmed.
  for (const line of describeTarget(env, options.envFromFile)) stderr.write(`${line}\n`);
  let name: string;
  let first: string;
  let second: string;
  if (stdin.isTTY) {
    const tty = stdin as PromptInput;
    // The prompts put the terminal back to the mode they found, on every path, before they settle.
    if ((await askVisible(CONFIRM_PROMPT, tty, stderr)).trim() !== "yes") throw new UserError("Cancelled. Nothing was changed.");
    name = await askVisible("Username: ", tty, stderr);
    first = await askHidden("Password: ", tty, stderr);
    second = await askHidden("Again: ", tty, stderr);
  } else {
    if (!args.includes("--yes")) throw new UserError("Piped input needs --yes to confirm the target database.");
    [name, first, second] = await readPipedLines(stdin);
  }
  const username = AdminUsername.safeParse(name);
  if (!username.success) throw new UserError("Username must be 3 to 64 characters.");
  if (!AdminPassword.safeParse(first).success) throw new UserError(`Password must be at least ${ADMIN_PASSWORD_MIN} characters.`);
  if (first !== second) throw new UserError("The two passwords do not match.");

  await saveAdminAccount(username.data, await hashPassword(first));
  stdout.write("Admin account saved.\n");
}

// Returns the exit code.
export async function run(io: CliIo, options: CliOptions = {}): Promise<number> {
  try {
    await main(io, options);
    return 0;
  } catch (error) {
    if (error instanceof PromptCancelled) {
      io.stderr.write("Cancelled.\n");
      return 130;
    }
    if (error instanceof UserError) {
      io.stderr.write(`${error.message}\n`);
      return 1;
    }
    // Driver errors can contain the connection string: print nothing from them.
    io.stderr.write("Could not save the admin account.\n");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const envFromFile = loadRootEnv();
  run({ stdin: process.stdin as unknown as CliIo["stdin"], stdout: process.stdout, stderr: process.stderr },
    { env: process.env, args: process.argv.slice(2), envFromFile }).then((code) => {
    process.exitCode = code;
  });
}

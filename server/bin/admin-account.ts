// Creates or replaces the admin account in the database. Usage: pnpm admin:create
// (or node_modules/.bin/tsx server/bin/admin-account.ts). Reads the root .env, so .env wins over
// a DATABASE_URL inherited from the shell. Prompts for the username, then the password twice
// (hidden when stdin is a terminal; piped input is three lines). Saving ends every admin session.
// Never prints the password or the hash.
import { pathToFileURL } from "node:url";
import { loadRootEnv } from "../../db/load-env";
import { AdminPassword, AdminUsername, ADMIN_PASSWORD_MIN } from "../../shared/schemas";
import { saveAdminAccount } from "../admin-account";
import { hashPassword } from "../password";
import { askHidden, askVisible, PromptCancelled, type PromptInput, type PromptOutput } from "../password-prompt";

class UserError extends Error {}

export type CliStdin = PromptInput & AsyncIterable<unknown> & { isTTY?: boolean };
export type CliIo = { stdin: Partial<CliStdin> & Partial<PromptInput>; stdout: PromptOutput; stderr: PromptOutput };

async function readPipedLines(stdin: CliIo["stdin"]): Promise<[string, string, string]> {
  let text = "";
  stdin.setEncoding?.("utf8");
  for await (const chunk of stdin as AsyncIterable<unknown>) text += String(chunk);
  const lines = text.split(/\r?\n/);
  return [lines[0] ?? "", lines[1] ?? "", lines[2] ?? ""];
}

async function main({ stdin, stdout, stderr }: CliIo): Promise<void> {
  let name: string;
  let first: string;
  let second: string;
  if (stdin.isTTY) {
    const tty = stdin as PromptInput;
    // The prompts put the terminal back to the mode they found, on every path, before they settle.
    name = await askVisible("Username: ", tty, stderr);
    first = await askHidden("Password: ", tty, stderr);
    second = await askHidden("Again: ", tty, stderr);
  } else {
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
export async function run(io: CliIo): Promise<number> {
  try {
    await main(io);
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
  loadRootEnv();
  run({ stdin: process.stdin as unknown as CliIo["stdin"], stdout: process.stdout, stderr: process.stderr }).then((code) => {
    process.exitCode = code;
  });
}

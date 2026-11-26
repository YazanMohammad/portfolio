// Makes a value for ADMIN_PASSWORD_HASH. Usage: pnpm admin:hash
// The password is read from stdin (hidden when it is a terminal), never from the command line,
// so it does not end up in shell history.
import { pathToFileURL } from "node:url";
import { hashPassword } from "../password";
import { askHidden, PromptCancelled, type PromptInput, type PromptOutput } from "../password-prompt";

const MIN_LENGTH = 12;

class UserError extends Error {}

export type CliStdin = PromptInput & AsyncIterable<unknown> & { isTTY?: boolean };
export type CliIo = { stdin: Partial<CliStdin> & PromptInput; stdout: PromptOutput; stderr: PromptOutput };

// Piped input (for scripts and tests): first two lines.
async function readPipedLines(stdin: CliIo["stdin"]): Promise<[string, string]> {
  let text = "";
  stdin.setEncoding?.("utf8");
  for await (const chunk of stdin as AsyncIterable<unknown>) text += String(chunk);
  const lines = text.split(/\r?\n/);
  return [lines[0] ?? "", lines[1] ?? ""];
}

async function main({ stdin, stdout, stderr }: CliIo): Promise<void> {
  let first: string;
  let second: string;
  if (stdin.isTTY) {
    // askHidden puts the terminal back to the mode it found, on every path, before it settles.
    first = await askHidden("Password: ", stdin, stderr);
    second = await askHidden("Again: ", stdin, stderr);
  } else {
    [first, second] = await readPipedLines(stdin);
  }
  if ([...first].length < MIN_LENGTH) throw new UserError(`Password must be at least ${MIN_LENGTH} characters.`);
  if (first !== second) throw new UserError("The two passwords do not match.");

  const hash = await hashPassword(first);
  stdout.write(`${hash}\n`);
  stderr.write("Put this value in ADMIN_PASSWORD_HASH in the Netlify env settings and in your local .env.\n");
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
    io.stderr.write("Could not make the hash.\n");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run({ stdin: process.stdin as unknown as CliIo["stdin"], stdout: process.stdout, stderr: process.stderr }).then((code) => {
    process.exitCode = code;
  });
}

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

// Root .env wins over inherited process env for this repo's local tooling (a user-level
// DATABASE_URL from another project must not shadow it). Keys .env does not define are left
// alone. Netlify production has no .env, so nothing changes there.
// Returns the keys it set, so a caller can say where a value came from.
export function loadRootEnv(): Set<string> {
  const loaded = new Set<string>();
  const envPath = fileURLToPath(new URL("../.env", import.meta.url));
  if (!existsSync(envPath)) return loaded;
  const values = parseEnv(readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) { process.env[key] = value; loaded.add(key); }
  }
  return loaded;
}

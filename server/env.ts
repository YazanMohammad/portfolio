type EnvName = "DATABASE_URL" | "ADMIN_PASSWORD_HASH" | "SESSION_SECRET" | "SITE_ORIGIN";

export function env(name: EnvName): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

// True only for plain http on a loopback hostname, with no credentials in the URL. A prefix test
// would also match "http://localhost.evil.com" and drop Secure/__Host- for a real host.
export function isLocalHttpOrigin(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname) && url.username === "" && url.password === "";
}

export function isLocalHttp(): boolean {
  return isLocalHttpOrigin(env("SITE_ORIGIN"));
}

type Environment = Record<string, string | undefined>;
type Snapshot = { production: readonly string[]; test: string; unpooled?: string };
// Private snapshots survive environment override; never log connection URLs.
const snapshots = new WeakMap<Environment, Snapshot>();
const refused = () => new Error("Refusing unsafe test database configuration.");
function identity(raw: string): string {
  try {
    if (raw !== raw.trim() || /[\\\s]/.test(raw)) throw refused();
    // Only a plain ASCII DNS authority and the PostgreSQL port are supported.
    const authority = raw.match(/^postgres(?:ql)?:\/\/(?:[^@/?#]+@)?([^/?#]+)\//)?.[1];
    if (!authority || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*(?::5432)?$/.test(authority)) throw refused();
    const url = new URL(raw);
    const driverUrl = new URL(raw.replace(/^postgres(?:ql)?:/, "http:"));
    if (driverUrl.hostname.toLowerCase() !== url.hostname.toLowerCase() || driverUrl.port !== url.port || driverUrl.pathname !== url.pathname) throw refused();
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.hash) throw refused();
    for (const [key] of url.searchParams) {
      if (!["sslmode", "channel_binding", "connect_timeout", "application_name"].includes(key)) throw refused();
    }
    const path = decodeURIComponent(url.pathname);
    if (!/^\/[^/\u0000-\u0020]+\/?$/.test(path) || /[\\?#]/.test(path)) throw refused();
    let host = url.hostname.toLowerCase().replace(/\.$/, "");
    // Known Neon alias only; NOT arbitrary DNS alias detection.
    if (host.endsWith(".neon.tech")) host = host.replace(/-pooler(?=\.)/, "");
    return JSON.stringify([host, url.port || "5432", path.replace(/\/$/, "")]);
  } catch { throw refused(); }
}
function validate(snapshot: Snapshot): void {
  if (!snapshot.production.length) throw refused();
  const originals = snapshot.production.map(identity);
  const target = identity(snapshot.test);
  if (originals.includes(target)) throw refused();
  if (snapshot.unpooled && identity(snapshot.unpooled) !== target) throw refused();
}
export function prepareTestDatabase(env: Environment): void {
  if (!env.DATABASE_URL_TEST || snapshots.has(env)) throw refused();
  const snapshot: Snapshot = Object.freeze({
    production: Object.freeze([env.DATABASE_URL, env.DATABASE_URL_UNPOOLED].filter((v): v is string => v !== undefined)),
    test: env.DATABASE_URL_TEST, unpooled: env.DATABASE_URL_TEST_UNPOOLED,
  });
  validate(snapshot);
  snapshots.set(env, snapshot);
  env.DATABASE_URL = snapshot.test;
}
export function assertSafeReset(env: Environment): void {
  const snapshot = snapshots.get(env);
  if (!snapshot || env.DATABASE_URL !== snapshot.test || env.DATABASE_URL_TEST !== snapshot.test ||
      env.DATABASE_URL_TEST_UNPOOLED !== snapshot.unpooled) throw refused();
  validate(snapshot);
  if (env.DATABASE_URL_UNPOOLED && identity(env.DATABASE_URL_UNPOOLED) === identity(snapshot.test)) throw refused();
}

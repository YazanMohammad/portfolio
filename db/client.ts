import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Database = NeonHttpDatabase<typeof schema>;
let instance: Database | undefined;
let boundUrl: string | undefined;

// Compare without disclosing the immutable connection string or rebinding clients.
export function assertDatabaseBinding(expectedUrl: string): void {
  if (instance && boundUrl !== expectedUrl) throw new Error("Refusing mismatched database client binding.");
  if (process.env.DATABASE_URL !== expectedUrl) throw new Error("Refusing changed database configuration.");
  getDb();
  if (boundUrl !== expectedUrl) throw new Error("Refusing mismatched database client binding.");
}

export function getDb(): Database {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL missing");
    instance = drizzle(neon(url), { schema });
    boundUrl = url;
  }
  return instance;
}

// Keep imports safe without env; resolve and bind methods only on use.
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const database = getDb();
    const value: unknown = Reflect.get(database, property, database);
    return typeof value === "function" ? value.bind(database) : value;
  },
});

import { defineConfig } from "drizzle-kit";
import { loadRootEnv } from "./db/load-env";

loadRootEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL_TEST_UNPOOLED! },
});

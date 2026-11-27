import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? process.env.E2E_BASE_URL ?? "http://localhost:8888",
    channel: "chrome", // installed Chrome; no browser download
  },
  // needs `netlify dev` running
});

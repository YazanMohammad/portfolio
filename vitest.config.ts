import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
};

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: [
            "server/**/*.test.ts",
            "db/**/*.test.ts",
            "shared/**/*.test.ts",
            "netlify/**/*.test.ts",
            "src/lib/api.test.ts",
            "tests/api/**/*.test.ts",
            "vite-plugins/**/*.test.ts",
          ],
          setupFiles: ["tests/api/setup.ts"],
          fileParallelism: false,
          testTimeout: 20000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/lib/api.test.ts"],
          setupFiles: ["src/test/setup.ts"],
        },
      },
    ],
  },
});

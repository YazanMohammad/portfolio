import { build } from "esbuild";
await build({
  entryPoints: ["vps/server.ts"], outfile: "dist-server/server.mjs", bundle: true,
  platform: "node", target: "node22", format: "esm", sourcemap: false,
  // Bundled CommonJS dependencies may require Node builtins at runtime.
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
});

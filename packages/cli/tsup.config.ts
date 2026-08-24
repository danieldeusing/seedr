import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("package.json", "utf-8"));

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  shims: true,
  // Workspace packages are TypeScript source and never published: bundle them.
  noExternal: ["@seedr/shared", "@seedr/registry-ops"],
  define: {
    CLI_VERSION: JSON.stringify(version),
  },
  banner: {
    js: "#!/usr/bin/env node",
  },
});

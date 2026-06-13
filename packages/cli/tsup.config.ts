import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("package.json", "utf-8"));

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  shims: true,
  define: {
    CLI_VERSION: JSON.stringify(version),
  },
  banner: {
    js: "#!/usr/bin/env node",
  },
});

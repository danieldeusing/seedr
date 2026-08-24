import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
  clearScreen: false,
  server: {
    port: 6300,
    strictPort: true,
    // src-tauri: cargo artifacts; coverage: vitest output — neither may reload the app
    watch: { ignored: ["**/src-tauri/**", "**/coverage/**"] },
  },
  build: { outDir: "dist" },
});

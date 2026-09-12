import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { dirname, join, relative, resolve } from "path";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import type { IncomingMessage, ServerResponse } from "http";
import { parseHeadersFile, headersFor } from "./scripts/headers-file.mjs";
// Deep-relative on purpose: Vite externalizes every bare specifier in a config
// file, so `@seedr/registry-ops` would be handed to Node, which cannot resolve the
// package's TS source (its `./paths.js` imports have no built .js on disk). A
// relative path is bundled into the config instead, and esbuild maps .js to .ts.
import { resolveRegistryDir } from "../../packages/registry-ops/src/fsPaths.js";

// A fork keeps its items in a directory upstream does not have (named by
// seedr.config.json at the repo root, two levels up), so `git merge upstream/main`
// never sees them. registryDataPlugin below emits and serves that directory.
const registryDir = resolveRegistryDir(resolve(__dirname, "../.."));

type DevReq = IncomingMessage;
type DevRes = ServerResponse;

/**
 * Serve a local directory under a URL prefix during dev, confined to that
 * directory (rejects path traversal). `binary` reads files as bytes so media
 * isn't corrupted; otherwise files are served as text with a small MIME map.
 */
function serveDir(
  urlPrefix: string,
  dir: string,
  { binary = false, mimeTypes = {} as Record<string, string> } = {}
) {
  return (req: DevReq, res: DevRes, next: () => void) => {
    if (!req.url?.startsWith(urlPrefix)) return next();
    const relativePath = decodeURIComponent(req.url.slice(urlPrefix.length).split("?")[0]!);
    const filePath = resolve(dir, relativePath);
    if (!filePath.startsWith(dir + "/")) {
      res.statusCode = 403;
      res.end();
      return;
    }
    if (!existsSync(filePath)) return next();
    const ext = filePath.split(".").pop() ?? "";
    if (mimeTypes[ext]) res.setHeader("Content-Type", mimeTypes[ext]);
    res.end(binary ? readFileSync(filePath) : readFileSync(filePath, "utf-8"));
  };
}

// The registry the app renders is fetched at runtime, not bundled: a few thousand
// plugin records belong in cached JSON, not in the entry chunk. The build emits the
// index, the per-type manifests, every item.json, and a first-party item's whole
// content tree (its file preview reads that back, same origin, in dev and
// production alike — see fileSource.ts) under dist/registry/; dev answers the
// same paths from the configured registry directory (which a fork moves with
// seedr.config.json, unlike the upstream registry the plugin below serves).
const ITEM_MANIFEST = "item.json";

function registryDataPlugin(): Plugin {
  const read = (path: string): Buffer => readFileSync(resolve(registryDir, path));
  const readJson = <T,>(path: string): T => JSON.parse(read(path).toString("utf-8")) as T;

  // Every file under `dir`, recursively, as paths relative to `registryDir`.
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : [relative(registryDir, join(dir, entry.name))]
    );

  // One item's contribution: its item.json alone, unless it's first-party, in
  // which case its whole tree — the file preview reads a first-party item back
  // from here, not from GitHub, so its bytes have to actually be here too. See
  // fileSource.ts for why a first-party item can never rely on
  // raw.githubusercontent.com.
  const itemFiles = (typeDir: string, slug: string): string[] => {
    const itemPath = `${typeDir}/${slug}/${ITEM_MANIFEST}`;
    if (!existsSync(resolve(registryDir, itemPath))) return [];
    const item = readJson<{ sourceType?: string }>(itemPath);
    return item.sourceType === "seedr" ? walk(resolve(registryDir, typeDir, slug)) : [itemPath];
  };

  const registryFiles = (): { path: string; source: Buffer }[] => {
    const index = readJson<{ types: Record<string, { file: string }> }>("manifest.json");
    const files = [{ path: "manifest.json", source: read("manifest.json") }];
    for (const { file } of Object.values(index.types)) {
      files.push({ path: file, source: read(file) });
      const typeDir = dirname(file);
      if (!existsSync(resolve(registryDir, typeDir))) continue;
      for (const entry of readdirSync(resolve(registryDir, typeDir), { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        for (const path of itemFiles(typeDir, entry.name)) files.push({ path, source: read(path) });
      }
    }
    return files;
  };
  const data = serveDir("/registry/", registryDir, { mimeTypes: { json: "application/json", md: "text/markdown", txt: "text/plain" } });
  return {
    name: "registry-data",
    generateBundle() {
      for (const { path, source } of registryFiles()) this.emitFile({ type: "asset", fileName: `registry/${path}`, source });
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req: DevReq, res: DevRes, next: () => void) => data(req, res, next));
    },
  };
}

// Dev-only middleware: serve the dev-sample media (lives outside public/ so it
// isn't shipped to production). /registry/ itself is registryDataPlugin's, above.
function serveLocalFilesPlugin(): Plugin {
  const devSamples = serveDir("/dev-samples/", resolve(__dirname, "./dev-samples"), {
    binary: true,
    mimeTypes: {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
      svg: "image/svg+xml", webp: "image/webp", mp4: "video/mp4", mp3: "audio/mpeg",
      pdf: "application/pdf",
    },
  });
  return {
    name: "serve-local-files",
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req: DevReq, res: DevRes, next: () => void) => devSamples(req, res, next));
    },
  };
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

/**
 * `vite preview` with the Cloudflare Pages semantics the e2e suite depends on:
 * the response headers from dist/_headers (CSP included), directory indexes
 * served at the clean URL (dist/skills/index.html at /skills, trailing slashes
 * redirected away), a real 404 status with dist/404.html for unknown paths, and
 * /api/* never falling through to the SPA shell. Pages Functions themselves are
 * not emulated — /api/* answers 501 and the function has unit tests instead.
 */
function previewPagesPlugin(): Plugin {
  return {
    name: "preview-pages-semantics",
    configurePreviewServer(server: PreviewServer) {
      const distDir = resolve(__dirname, "dist");
      const rules = parseHeadersFile(readFileSync(resolve(distDir, "_headers"), "utf8"));
      const notFoundPage = readFileSync(resolve(distDir, "404.html"));
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = new URL(req.url ?? "/", "http://preview.local");
        const pathname = decodeURIComponent(url.pathname);
        for (const [name, value] of headersFor(rules, pathname)) res.setHeader(name, value);

        if (pathname.startsWith("/api/")) {
          res.statusCode = 501;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Pages Functions are not available in vite preview", code: "not_implemented" }));
          return;
        }
        if (pathname.length > 1 && pathname.endsWith("/")) {
          res.statusCode = 301;
          res.setHeader("Location", pathname.slice(0, -1) + url.search);
          res.end();
          return;
        }
        const filePath = resolve(distDir, `.${pathname}`);
        if (!filePath.startsWith(distDir)) {
          res.statusCode = 403;
          res.end();
          return;
        }
        if (pathname !== "/" && isFile(resolve(filePath, "index.html"))) {
          req.url = `${pathname}/index.html${url.search}`;
          return next();
        }
        if (pathname === "/" || isFile(filePath) || isFile(`${filePath}.html`)) return next();

        res.statusCode = 404;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(notFoundPage);
      });
    },
  };
}

export default defineConfig(({ isPreview }) => ({
  plugins: [react(), tailwindcss(), registryDataPlugin(), serveLocalFilesPlugin(), previewPagesPlugin()],
  // preview mimics Pages (no SPA fallback: unknown paths are real 404s); dev keeps it
  appType: isPreview ? "mpa" : "spa",
  server: {
    port: 6200,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    // src/lib/registry.ts awaits the registry at the top level of the module
    target: "es2022",
    // never inline fonts as data: URIs — the CSP's font-src allows 'self' only
    assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf)$/.test(filePath) ? false : undefined),
    // Budget (enforced by scripts/check-bundle-budget.mjs after every build):
    // entry chunk ≤ 260 kB, every other chunk ≤ 320 kB, minified. The warning
    // limit below mirrors the per-chunk ceiling so Vite flags a regression too.
    chunkSizeWarningLimit: 320,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return "vendor-react";
          if (/node_modules\/(react-markdown|remark-[\w-]+|micromark[\w-]*|mdast-[\w-]+|unist-[\w-]+|unified|vfile[\w-]*|hast-[\w-]+|bail|trough|devlop|property-information|space-separated-tokens|comma-separated-tokens|html-url-attributes|estree-util-[\w-]+|zwitch|longest-streak|ccount|character-[\w-]+|decode-named-character-reference|markdown-table|trim-lines|style-to-[\w-]+|inline-style-parser|extend|is-plain-obj)\//.test(id)) return "vendor-markdown";
          return undefined;
        },
      },
    },
  },
}));

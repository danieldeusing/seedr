import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { readFileSync, existsSync, statSync } from "fs";
import type { IncomingMessage, ServerResponse } from "http";
import { parseHeadersFile, headersFor } from "./scripts/headers-file.mjs";

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

// Dev-only middleware: serve the registry and the dev-sample media (both live
// outside public/ so they aren't shipped to production).
function serveLocalFilesPlugin(): Plugin {
  const registry = serveDir("/registry/", resolve(__dirname, "../../registry"), {
    mimeTypes: { md: "text/markdown", json: "application/json", txt: "text/plain" },
  });
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
      server.middlewares.use((req: DevReq, res: DevRes, next: () => void) =>
        registry(req, res, () => devSamples(req, res, next))
      );
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
  plugins: [react(), tailwindcss(), serveLocalFilesPlugin(), previewPagesPlugin()],
  // preview mimics Pages (no SPA fallback: unknown paths are real 404s); dev keeps it
  appType: isPreview ? "mpa" : "spa",
  server: {
    port: 6200,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@registry": resolve(__dirname, "../../registry"),
    },
  },
  build: {
    outDir: "dist",
    // never inline fonts as data: URIs — the CSP's font-src allows 'self' only
    assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf)$/.test(filePath) ? false : undefined),
    // Budget (enforced by scripts/check-bundle-budget.mjs after every build):
    // entry chunk ≤ 260 kB, every other chunk ≤ 320 kB, minified. The warning
    // limit below mirrors the per-chunk ceiling so Vite flags a regression too.
    chunkSizeWarningLimit: 320,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // registry data changes on every sync; keep it apart from the code so one
          // doesn't bust the other's cache
          if (id.includes("/registry/") && id.endsWith("manifest.json")) return "registry";
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return "vendor-react";
          if (/node_modules\/(react-markdown|remark-[\w-]+|micromark[\w-]*|mdast-[\w-]+|unist-[\w-]+|unified|vfile[\w-]*|hast-[\w-]+|bail|trough|devlop|property-information|space-separated-tokens|comma-separated-tokens|html-url-attributes|estree-util-[\w-]+|zwitch|longest-streak|ccount|character-[\w-]+|decode-named-character-reference|markdown-table|trim-lines|style-to-[\w-]+|inline-style-parser|extend|is-plain-obj)\//.test(id)) return "vendor-markdown";
          return undefined;
        },
      },
    },
  },
}));

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";

interface DevServer {
  middlewares: { use: (middleware: unknown) => void };
}
interface DevReq {
  url?: string;
}
interface DevRes {
  statusCode: number;
  setHeader: (key: string, value: string) => void;
  end: (content?: string | Buffer) => void;
}

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
function serveLocalFilesPlugin() {
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
    configureServer(server: DevServer) {
      server.middlewares.use((req: DevReq, res: DevRes, next: () => void) =>
        registry(req, res, () => devSamples(req, res, next))
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serveLocalFilesPlugin()],
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
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve, join } from "path";
import { readFileSync, existsSync, readdirSync } from "fs";
import type { FileTreeNode, RegistryItem } from "@seedr/shared";
import { ALL_TYPES, typeDirName } from "../../scripts/compile-manifest";

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

/**
 * Private registry — merge an out-of-tree item directory into the build.
 *
 * Point SEEDR_PRIVATE_REGISTRY at a directory shaped like registry/
 * (<type dir>/<slug>/item.json) and every item in it is bundled into the SPA
 * alongside the public registry, marked sourceType "private". Nothing in the
 * repo changes: the committed manifests stay untouched, and a build without
 * the variable is exactly the public site. This is how a company runs its own
 * seedr with internal content without forking or publishing anything.
 */
function privateRegistryPlugin() {
  const virtualId = "virtual:seedr-private-registry";
  const resolvedVirtualId = "\0" + virtualId;
  const publicVirtualId = "virtual:seedr-public-registry";
  const emptyPublicId = "\0seedr-public-registry-empty";
  // A private-only build (private registry set, SEEDR_INCLUDE_PUBLIC not "true")
  // swaps the public registry for an empty stub, so no public manifest or
  // item.json ever enters the bundle or the emitted chunks.
  const includePublic = () =>
    !process.env.SEEDR_PRIVATE_REGISTRY || process.env.SEEDR_INCLUDE_PUBLIC === "true";

  const buildFileTree = (dir: string): FileTreeNode[] =>
    readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."))
      .sort((a, b) =>
        a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1
      )
      .map((entry) =>
        entry.isDirectory()
          ? { name: entry.name, type: "directory", children: buildFileTree(join(dir, entry.name)) }
          : { name: entry.name, type: "file" }
      );

  const loadPrivateItems = (registryDir: string): RegistryItem[] => {
    const items: RegistryItem[] = [];
    for (const type of ALL_TYPES) {
      const typeDir = join(registryDir, typeDirName(type));
      if (!existsSync(typeDir)) continue;
      for (const entry of readdirSync(typeDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const itemDir = join(typeDir, entry.name);
        const itemJsonPath = join(itemDir, "item.json");
        if (!existsSync(itemJsonPath)) continue;
        const item = JSON.parse(readFileSync(itemJsonPath, "utf-8")) as RegistryItem;
        for (const field of ["slug", "name", "description"] as const) {
          if (!item[field]) throw new Error(`${itemJsonPath}: missing required field "${field}"`);
        }
        if (item.type !== type) {
          throw new Error(`${itemJsonPath}: type "${item.type}" does not match its directory (${typeDirName(type)}/)`);
        }
        if (item.slug !== entry.name) {
          throw new Error(`${itemJsonPath}: slug "${item.slug}" does not match its directory name "${entry.name}"`);
        }
        item.sourceType ??= "private";
        // Derive the detail page's file tree from what actually sits next to
        // item.json, unless the item declares its own.
        const contentFiles = buildFileTree(itemDir).filter(
          (node) => !(node.type === "file" && node.name === "item.json")
        );
        item.contents ??= contentFiles.length ? { files: contentFiles } : undefined;
        items.push(item);
      }
    }
    return items;
  };

  return {
    name: "seedr-private-registry",
    resolveId(id: string) {
      if (id === virtualId) return resolvedVirtualId;
      if (id === publicVirtualId) {
        return includePublic() ? resolve(__dirname, "./src/lib/publicRegistry.ts") : emptyPublicId;
      }
    },
    load(id: string) {
      if (id === emptyPublicId) {
        return `export default { version: "2.0.0", items: [], itemJsonLoaders: {} };`;
      }
      if (id !== resolvedVirtualId) return;
      const registryDir = process.env.SEEDR_PRIVATE_REGISTRY;
      const items = registryDir ? loadPrivateItems(resolve(registryDir)) : [];
      if (registryDir) {
        console.log(
          `seedr: private registry ${registryDir} contributed ${items.length} item(s)` +
            (includePublic() ? " (merged with the public registry)" : " (private-only build)")
        );
      }
      return `export default ${JSON.stringify({ items })};`;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serveLocalFilesPlugin(), privateRegistryPlugin()],
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

/*
 * File-preview rules for the detail page.
 *
 * A registry item's files are fetched from a host we do not control (GitHub raw
 * content), so nothing about a response is trusted on its own: the extension,
 * the Content-Type header and the bytes must agree before anything is rendered.
 *
 *   - text   → decoded as UTF-8 only when the extension (or, for extension-less
 *              files, the Content-Type) says text, the bytes carry no NUL byte, do
 *              not start with a known binary signature, and are valid UTF-8
 *   - image  → png/jpg/jpeg/gif/webp/svg by extension AND matching magic bytes;
 *              rendered through an <img> from a blob URL, never inlined as markup
 *   - binary → everything else (pdf, fonts, archives, media, unknown types,
 *              mismatches): a metadata panel with a link, never decoded
 *
 * Size limits are enforced before the body is read when the server announces a
 * Content-Length, and while streaming otherwise.
 */

export const TEXT_LIMIT_BYTES = 1024 * 1024;
export const IMAGE_LIMIT_BYTES = 5 * 1024 * 1024;

export type PreviewCategory = "text" | "image" | "binary";

export type PreviewDecision =
  | { kind: "text"; text: string; language: string; size: number }
  | { kind: "image"; mime: string; bytes: Uint8Array; size: number }
  | { kind: "binary"; reason: string; mime: string | null; size: number }
  | { kind: "too-large"; category: PreviewCategory; limit: number; size?: number };

export type PreviewError = { kind: "error"; message: string; status?: number };

export type PreviewResult = PreviewDecision | PreviewError;

export interface FetchedFile {
  path: string;
  contentType: string | null;
  bytes: Uint8Array;
}

const TEXT_EXTENSIONS = new Set([
  "md", "markdown", "mdx", "txt", "text", "rst", "adoc",
  "json", "jsonc", "json5", "yml", "yaml", "toml", "ini", "cfg", "conf", "env", "properties",
  "js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx", "py", "rb", "go", "rs", "java", "kt", "kts",
  "swift", "c", "h", "cpp", "hpp", "cc", "cs", "php", "lua", "pl", "r", "scala", "dart", "ex", "exs",
  "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd",
  "html", "htm", "css", "scss", "less", "xml", "sql", "graphql", "gql", "proto", "csv", "tsv",
  "gitignore", "gitattributes", "editorconfig", "npmrc", "nvmrc", "prettierrc", "eslintrc", "lock",
]);

const JPEG_MIME = "image/jpeg";

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: JPEG_MIME,
  jpeg: JPEG_MIME,
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

const BINARY_EXTENSIONS = new Set([
  "pdf", "ttf", "otf", "woff", "woff2", "eot", "gz", "tgz", "zip", "tar", "7z", "bz2", "xz", "rar",
  "exe", "dll", "so", "dylib", "bin", "wasm", "o", "a", "jar", "class", "pyc",
  "mp3", "mp4", "m4a", "mov", "webm", "ogg", "wav", "flac", "avi", "mkv",
  "ico", "bmp", "tif", "tiff", "psd", "heic", "avif",
  "db", "sqlite", "sqlite3", "parquet", "pkl", "npy",
]);

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "typescript",
  json: "json", jsonc: "json", json5: "json",
  md: "markdown", markdown: "markdown", mdx: "markdown",
  yml: "yaml", yaml: "yaml", toml: "toml", ini: "ini", cfg: "ini", conf: "ini", env: "ini", properties: "ini",
  sh: "shell", bash: "shell", zsh: "shell", fish: "shell",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", kts: "kotlin",
  swift: "swift", c: "c", h: "c", cpp: "cpp", hpp: "cpp", cc: "cpp", cs: "csharp", php: "php",
  lua: "lua", html: "html", htm: "html", css: "css", scss: "scss", less: "less", xml: "xml",
  sql: "sql", graphql: "graphql", gql: "graphql",
};

export function fileExtension(path: string): string {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  // ".gitignore" → "gitignore"; "Makefile" → "" ; "archive.tar.gz" → "gz"
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function getLanguageFromPath(path: string): string {
  const name = (path.split("/").pop() ?? "").toLowerCase();
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile") return "makefile";
  return LANGUAGE_BY_EXTENSION[fileExtension(path)] ?? "plaintext";
}

/** What the file name alone promises; "unknown" defers to the Content-Type. */
export function categoryFromExtension(path: string): PreviewCategory | "unknown" {
  const ext = fileExtension(path);
  if (ext in IMAGE_MIME_BY_EXTENSION) return "image";
  if (BINARY_EXTENSIONS.has(ext)) return "binary";
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  return "unknown";
}

const TEXT_CONTENT_TYPES = /^(text\/|application\/(json|xml|javascript|ecmascript|x-sh|x-yaml|yaml|toml|x-httpd-php))/i;

export function contentTypeSaysText(contentType: string | null): boolean {
  return !!contentType && TEXT_CONTENT_TYPES.test(contentType.trim());
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, Math.min(end, bytes.length)));
}

/** MIME type implied by well-known leading bytes, or null when nothing matches. */
export function sniffMime(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return JPEG_MIME;
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (ascii(bytes, 0, 4) === "%PDF") return "application/pdf";
  if (startsWith(bytes, [0x1f, 0x8b])) return "application/gzip";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "application/zip";
  if (ascii(bytes, 0, 4) === "wOFF") return "font/woff";
  if (ascii(bytes, 0, 4) === "wOF2") return "font/woff2";
  if (startsWith(bytes, [0x00, 0x01, 0x00, 0x00]) || ascii(bytes, 0, 4) === "true") return "font/ttf";
  if (ascii(bytes, 0, 4) === "OTTO") return "font/otf";
  if (startsWith(bytes, [0x00, 0x61, 0x73, 0x6d])) return "application/wasm";
  return null;
}

export function hasNulByte(bytes: Uint8Array, scanLimit = 64 * 1024): boolean {
  const end = Math.min(bytes.length, scanLimit);
  for (let i = 0; i < end; i++) if (bytes[i] === 0) return true;
  return false;
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  if (hasNulByte(bytes)) return false;
  // non-fatal: the 512-byte cut may split a multi-byte character
  const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 512));
  return /^\uFEFF?\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head);
}

export function sizeLimitFor(category: PreviewCategory): number {
  return category === "image" ? IMAGE_LIMIT_BYTES : TEXT_LIMIT_BYTES;
}

/** Decides how a fetched file may be shown. Pure; safe to call with any bytes. */
export function classifyPreview(file: FetchedFile): PreviewDecision {
  const { path, contentType, bytes } = file;
  const size = bytes.length;
  const ext = fileExtension(path);
  const category = categoryFromExtension(path);
  const sniffed = sniffMime(bytes);

  if (category === "image") {
    const expected = IMAGE_MIME_BY_EXTENSION[ext]!;
    const matches = expected === "image/svg+xml" ? looksLikeSvg(bytes) : sniffed === expected;
    if (!matches) {
      return { kind: "binary", reason: `content does not look like a .${ext} image`, mime: sniffed ?? contentType, size };
    }
    if (size > IMAGE_LIMIT_BYTES) return { kind: "too-large", category: "image", limit: IMAGE_LIMIT_BYTES, size };
    return { kind: "image", mime: expected, bytes, size };
  }

  if (category === "binary") {
    return { kind: "binary", reason: `.${ext} files are not previewed`, mime: sniffed ?? contentType, size };
  }

  const textCandidate = category === "text" || (category === "unknown" && contentTypeSaysText(contentType));
  if (!textCandidate) {
    return { kind: "binary", reason: "unknown file type", mime: sniffed ?? contentType, size };
  }
  if (sniffed) {
    return { kind: "binary", reason: `content looks like ${sniffed}, not text`, mime: sniffed, size };
  }
  if (hasNulByte(bytes)) {
    return { kind: "binary", reason: "content contains NUL bytes", mime: contentType, size };
  }
  if (size > TEXT_LIMIT_BYTES) return { kind: "too-large", category: "text", limit: TEXT_LIMIT_BYTES, size };
  const text = decodeUtf8(bytes);
  if (text === null) {
    return { kind: "binary", reason: "content is not valid UTF-8", mime: contentType, size };
  }
  return { kind: "text", text, language: getLanguageFromPath(path), size };
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Reads a body up to `limit` bytes; returns null (and cancels the stream) when it is larger. */
async function readCapped(response: Response, limit: number): Promise<Uint8Array | null> {
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    return buffer.length > limit ? null : buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Fetches `url` and classifies the response. The size limit applied while
 * downloading is the largest one the file name allows (images may be bigger
 * than text); classifyPreview applies the exact per-kind limit afterwards.
 */
export async function loadPreview(
  path: string,
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<PreviewResult> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    return { kind: "error", message: "Could not reach the file host" };
  }
  if (!response.ok) {
    return {
      kind: "error",
      status: response.status,
      message: response.status === 404 ? "File not found (404)" : `Failed to fetch file (${response.status})`,
    };
  }
  const category = categoryFromExtension(path);
  const contentType = response.headers.get("content-type");
  const declaredLength = Number(response.headers.get("content-length"));
  const declared = Number.isFinite(declaredLength) && declaredLength >= 0 ? declaredLength : undefined;
  if (category === "binary") {
    // the metadata panel needs no bytes — don't download an archive or a PDF
    await response.body?.cancel();
    return { kind: "binary", reason: `.${fileExtension(path)} files are not previewed`, mime: contentType, size: declared ?? 0 };
  }
  if (category === "unknown" && !contentTypeSaysText(contentType)) {
    await response.body?.cancel();
    return { kind: "binary", reason: "unknown file type", mime: contentType, size: declared ?? 0 };
  }
  const limit = sizeLimitFor(category === "unknown" ? "text" : category);
  const tooLargeCategory: PreviewCategory = category === "unknown" ? "text" : category;
  if (declared !== undefined && declared > limit) {
    await response.body?.cancel();
    return { kind: "too-large", category: tooLargeCategory, limit, size: declared };
  }
  const bytes = await readCapped(response, limit);
  if (bytes === null) {
    return { kind: "too-large", category: tooLargeCategory, limit, size: declared };
  }
  return classifyPreview({ path, contentType, bytes });
}

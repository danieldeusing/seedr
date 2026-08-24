import { describe, expect, it } from "vitest";
import {
  IMAGE_LIMIT_BYTES,
  TEXT_LIMIT_BYTES,
  categoryFromExtension,
  classifyPreview,
  fileExtension,
  formatBytes,
  getLanguageFromPath,
  hasNulByte,
  loadPreview,
  sniffMime,
} from "./preview";

const TEXT_PLAIN = "text/plain";
const JPEG_MIME = "image/jpeg";
const OCTET_STREAM = "application/octet-stream";

const utf8 = (text: string) => new TextEncoder().encode(text);
const bytes = (...values: number[]) => new Uint8Array(values);

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46);
const WEBP = new Uint8Array([...utf8("RIFF"), 0x24, 0, 0, 0, ...utf8("WEBPVP8 ")]);
const PDF = utf8("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
const TTF = bytes(0x00, 0x01, 0x00, 0x00, 0x00, 0x0c, 0x00, 0x80, 0x00, 0x03);
const GZ = bytes(0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 0x00, 0x03);

function fakeResponse(
  body: Uint8Array | null,
  init: { status?: number; contentType?: string; contentLength?: number | false } = {}
): Response {
  const headers = new Headers();
  if (init.contentType) headers.set("content-type", init.contentType);
  if (init.contentLength !== false) headers.set("content-length", String(init.contentLength ?? body?.length ?? 0));
  return new Response(body as BodyInit | null, { status: init.status ?? 200, headers });
}

describe("file name rules", () => {
  it("extracts extensions, dotfiles and extension-less names", () => {
    expect(fileExtension("a/b/SKILL.md")).toBe("md");
    expect(fileExtension(".gitignore")).toBe("gitignore");
    expect(fileExtension("Makefile")).toBe("");
    expect(fileExtension("archive.tar.gz")).toBe("gz");
    expect(fileExtension("ICON.PNG")).toBe("png");
  });

  it("maps extensions to preview categories", () => {
    expect(categoryFromExtension("SKILL.md")).toBe("text");
    expect(categoryFromExtension("logo.png")).toBe("image");
    expect(categoryFromExtension("font.ttf")).toBe("binary");
    expect(categoryFromExtension("bundle.tgz")).toBe("binary");
    expect(categoryFromExtension("LICENSE")).toBe("unknown");
  });

  it("maps extensions to highlighter languages", () => {
    expect(getLanguageFromPath("x/y.ts")).toBe("typescript");
    expect(getLanguageFromPath("Dockerfile")).toBe("dockerfile");
    expect(getLanguageFromPath("notes.unknownext")).toBe("plaintext");
  });
});

describe("sniffMime", () => {
  it("recognises well-known signatures", () => {
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(JPEG)).toBe(JPEG_MIME);
    expect(sniffMime(WEBP)).toBe("image/webp");
    expect(sniffMime(PDF)).toBe("application/pdf");
    expect(sniffMime(TTF)).toBe("font/ttf");
    expect(sniffMime(GZ)).toBe("application/gzip");
    expect(sniffMime(utf8("# hello"))).toBeNull();
    expect(sniffMime(new Uint8Array())).toBeNull();
  });
});

describe("classifyPreview", () => {
  it("decodes a markdown file served as text", () => {
    const result = classifyPreview({ path: "SKILL.md", contentType: "text/plain; charset=utf-8", bytes: utf8("# Title\n\nBody ünïcode") });
    expect(result).toMatchObject({ kind: "text", language: "markdown", text: "# Title\n\nBody ünïcode" });
  });

  it("decodes an extension-less file only when the content type says text", () => {
    expect(classifyPreview({ path: "LICENSE", contentType: TEXT_PLAIN, bytes: utf8("MIT") }).kind).toBe("text");
    expect(classifyPreview({ path: "LICENSE", contentType: OCTET_STREAM, bytes: utf8("MIT") })).toMatchObject({
      kind: "binary",
      reason: "unknown file type",
    });
  });

  it("renders PNG, JPEG and WebP as images when the bytes match the extension", () => {
    expect(classifyPreview({ path: "a.png", contentType: "image/png", bytes: PNG })).toMatchObject({ kind: "image", mime: "image/png" });
    expect(classifyPreview({ path: "a.jpg", contentType: JPEG_MIME, bytes: JPEG })).toMatchObject({ kind: "image", mime: JPEG_MIME });
    expect(classifyPreview({ path: "a.jpeg", contentType: JPEG_MIME, bytes: JPEG })).toMatchObject({ kind: "image", mime: JPEG_MIME });
    expect(classifyPreview({ path: "a.webp", contentType: "image/webp", bytes: WEBP })).toMatchObject({ kind: "image", mime: "image/webp" });
  });

  it("accepts an SVG document as an image but never as markup", () => {
    const svg = utf8('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const result = classifyPreview({ path: "icon.svg", contentType: "image/svg+xml", bytes: svg });
    expect(result).toMatchObject({ kind: "image", mime: "image/svg+xml" });
    expect(result).not.toHaveProperty("text");
  });

  it("refuses an image whose bytes do not match its extension", () => {
    expect(classifyPreview({ path: "a.png", contentType: "image/png", bytes: JPEG })).toMatchObject({
      kind: "binary",
      reason: "content does not look like a .png image",
      mime: JPEG_MIME,
    });
    expect(classifyPreview({ path: "a.svg", contentType: "image/svg+xml", bytes: utf8("<html><body>no</body></html>") }).kind).toBe("binary");
  });

  it("never decodes PDF, TTF or GZ, regardless of the content type", () => {
    expect(classifyPreview({ path: "doc.pdf", contentType: TEXT_PLAIN, bytes: PDF })).toMatchObject({ kind: "binary", mime: "application/pdf" });
    expect(classifyPreview({ path: "font.ttf", contentType: TEXT_PLAIN, bytes: TTF })).toMatchObject({ kind: "binary", mime: "font/ttf" });
    expect(classifyPreview({ path: "bundle.gz", contentType: TEXT_PLAIN, bytes: GZ })).toMatchObject({ kind: "binary", mime: "application/gzip" });
  });

  it("treats a binary served as text/plain with a text extension as binary", () => {
    const misleading = classifyPreview({ path: "notes.txt", contentType: "text/plain; charset=utf-8", bytes: PNG });
    expect(misleading).toMatchObject({ kind: "binary", reason: "content looks like image/png, not text", mime: "image/png" });

    const withNul = classifyPreview({ path: "data.md", contentType: TEXT_PLAIN, bytes: bytes(0x68, 0x69, 0x00, 0x21) });
    expect(withNul).toMatchObject({ kind: "binary", reason: "content contains NUL bytes" });

    const latin1 = classifyPreview({ path: "legacy.txt", contentType: TEXT_PLAIN, bytes: bytes(0x63, 0x61, 0x66, 0xe9) });
    expect(latin1).toMatchObject({ kind: "binary", reason: "content is not valid UTF-8" });
  });

  it("enforces the size limits per kind", () => {
    const bigText = new Uint8Array(TEXT_LIMIT_BYTES + 1).fill(0x61);
    expect(classifyPreview({ path: "big.md", contentType: TEXT_PLAIN, bytes: bigText })).toMatchObject({
      kind: "too-large",
      category: "text",
      limit: TEXT_LIMIT_BYTES,
    });
    const bigImage = new Uint8Array(IMAGE_LIMIT_BYTES + 1);
    bigImage.set(PNG);
    expect(classifyPreview({ path: "big.png", contentType: "image/png", bytes: bigImage })).toMatchObject({
      kind: "too-large",
      category: "image",
      limit: IMAGE_LIMIT_BYTES,
    });
    // an image below 5 MB but above the text limit is still an image
    const mediumImage = new Uint8Array(TEXT_LIMIT_BYTES + 10);
    mediumImage.set(PNG);
    expect(classifyPreview({ path: "medium.png", contentType: "image/png", bytes: mediumImage }).kind).toBe("image");
  });
});

describe("loadPreview", () => {
  it("returns a 404 error without decoding anything", async () => {
    const result = await loadPreview("SKILL.md", "https://raw.example/SKILL.md", async () => fakeResponse(utf8("Not Found"), { status: 404 }));
    expect(result).toEqual({ kind: "error", status: 404, message: "File not found (404)" });
  });

  it("reports unreachable hosts", async () => {
    const result = await loadPreview("SKILL.md", "https://raw.example/SKILL.md", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(result).toEqual({ kind: "error", message: "Could not reach the file host" });
  });

  it("fetches and classifies a text file", async () => {
    const result = await loadPreview("SKILL.md", "https://raw.example/SKILL.md", async () => fakeResponse(utf8("# hi"), { contentType: TEXT_PLAIN }));
    expect(result).toMatchObject({ kind: "text", text: "# hi", language: "markdown" });
  });

  it("does not download binaries — the metadata panel needs only the headers", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(PDF);
      },
      cancel() {
        cancelled = true;
      },
    });
    const headers = new Headers({ "content-type": "application/pdf", "content-length": "123456" });
    const result = await loadPreview("paper.pdf", "https://raw.example/paper.pdf", async () => new Response(stream, { headers }));
    expect(result).toMatchObject({ kind: "binary", mime: "application/pdf", size: 123456 });
    expect(cancelled).toBe(true);
  });

  it("does not download extension-less files unless the server calls them text", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(utf8("binary?"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const headers = new Headers({ "content-type": OCTET_STREAM, "content-length": "7" });
    const result = await loadPreview("BLOB", "https://raw.example/BLOB", async () => new Response(stream, { headers }));
    expect(result).toMatchObject({ kind: "binary", reason: "unknown file type", mime: OCTET_STREAM, size: 7 });
    expect(cancelled).toBe(true);
    const text = await loadPreview("LICENSE", "https://raw.example/LICENSE", async () => fakeResponse(utf8("MIT"), { contentType: TEXT_PLAIN }));
    expect(text).toMatchObject({ kind: "text", text: "MIT" });
  });

  it("rejects oversized files from the Content-Length header before reading", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(utf8("x"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const headers = new Headers({ "content-type": TEXT_PLAIN, "content-length": String(TEXT_LIMIT_BYTES + 1) });
    const result = await loadPreview("huge.md", "https://raw.example/huge.md", async () => new Response(stream, { headers }));
    expect(result).toMatchObject({ kind: "too-large", category: "text", limit: TEXT_LIMIT_BYTES, size: TEXT_LIMIT_BYTES + 1 });
    expect(cancelled).toBe(true);
  });

  it("stops reading a chunked body once it exceeds the limit", async () => {
    let chunksSent = 0;
    const chunk = new Uint8Array(256 * 1024).fill(0x61);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksSent += 1;
        controller.enqueue(chunk);
        if (chunksSent > 100) controller.close();
      },
    });
    const result = await loadPreview("huge.md", "https://raw.example/huge.md", async () => new Response(stream, { headers: { "content-type": TEXT_PLAIN } }));
    expect(result).toMatchObject({ kind: "too-large", category: "text" });
    // 1 MB limit = 4 chunks of 256 KB; the fifth chunk trips it, nothing close to 100 is read
    expect(chunksSent).toBeLessThanOrEqual(6);
  });

  it("uses the image limit for image extensions", async () => {
    const bigImage = new Uint8Array(TEXT_LIMIT_BYTES * 2);
    bigImage.set(PNG);
    const result = await loadPreview("big.png", "https://raw.example/big.png", async () => fakeResponse(bigImage, { contentType: "image/png" }));
    expect(result).toMatchObject({ kind: "image", mime: "image/png", size: TEXT_LIMIT_BYTES * 2 });
  });
});

describe("formatBytes", () => {
  it("formats sizes for the metadata panel", () => {
    expect(formatBytes(12)).toBe("12 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("hasNulByte", () => {
  it("scans only the requested window", () => {
    const late = new Uint8Array(100).fill(0x41);
    late[90] = 0;
    expect(hasNulByte(late, 50)).toBe(false);
    expect(hasNulByte(late)).toBe(true);
  });
});

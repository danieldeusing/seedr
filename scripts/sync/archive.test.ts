import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { writeTar } from "../test/fake-github.js";
import { readTar, readTarball } from "./archive.js";

describe("readTar", () => {
  it("returns regular files by path with the archive's top directory stripped, skipping the pax global header and symlinks", () => {
    const files = readTar(writeTar({ "README.md": "hi\n", "skills/a/SKILL.md": "---\nname: a\n---\n", "AGENTS.md": { symlink: "README.md" } }, "owner-repo-abc1234"));
    expect([...files.keys()].sort()).toEqual(["README.md", "skills/a/SKILL.md"]);
    expect(files.get("skills/a/SKILL.md")!.toString("utf-8")).toBe("---\nname: a\n---\n");
  });

  it("takes a path longer than the ustar name field from the pax extended header before it", () => {
    const deep = `${"deeply/".repeat(14)}nested/file-with-a-long-name.md`;
    expect(deep.length).toBeGreaterThan(100);
    const files = readTar(writeTar({ [deep]: "long\n", "short.md": "s\n" }, "o-r-1234567"));
    expect([...files.keys()].sort()).toEqual([deep, "short.md"]);
    expect(files.get(deep)!.toString("utf-8")).toBe("long\n");
  });

  it("reads a name split across the ustar prefix and name fields", () => {
    const header = Buffer.alloc(512);
    header.write("file.md", 0, "utf-8");
    header.write("0000005\0", 124, "ascii");
    header.write("0", 156, "ascii");
    header.write("ustar\0", 257, "ascii");
    header.write("top/dir", 345, "utf-8");
    const tar = Buffer.concat([header, Buffer.from("five\n".padEnd(512, "\0")), Buffer.alloc(1024)]);
    expect([...readTar(tar).entries()].map(([path, bytes]) => [path, bytes.toString("utf-8")])).toEqual([["dir/file.md", "five\n"]]);
  });

  it("reads a gzip-compressed tarball", () => {
    const files = readTarball(gzipSync(writeTar({ "a.txt": "a" }, "o-r-1234567")));
    expect(files.get("a.txt")!.toString("utf-8")).toBe("a");
  });
});

/**
 * A commit's archive (`GET /repos/{repo}/tarball/{sha}`) read in memory: every regular
 * file of the repository for one request, where raw.githubusercontent.com costs one
 * request per file and a mirror of thousands of plugins runs into that host's hourly
 * limit within minutes. `git archive` writes ustar, a pax global header first, pax
 * extended headers for names that do not fit, and every path under one top directory
 * (`owner-repo-shortsha/`), which is stripped here.
 */

import { gunzipSync } from "node:zlib";

const BLOCK = 512;

function cString(block: Buffer, start: number, length: number): string {
  const field = block.subarray(start, start + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString("utf-8");
}

/** pax extended-header records: `<length> <key>=<value>\n`, the length counting itself. */
function paxRecords(data: Buffer): Map<string, string> {
  const records = new Map<string, string>();
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) break;
    const length = Number(data.subarray(offset, space).toString("ascii"));
    if (!Number.isInteger(length) || length <= 0) break;
    const record = data.subarray(space + 1, offset + length).toString("utf-8").replace(/\n$/, "");
    const equals = record.indexOf("=");
    if (equals > 0) records.set(record.slice(0, equals), record.slice(equals + 1));
    offset += length;
  }
  return records;
}

/** Regular files of an uncompressed tar, by path with the top directory stripped. */
export function readTar(tar: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  let overrideName: string | null = null;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = parseInt(cString(header, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(header[156]!);
    const dataStart = offset + BLOCK;
    const data = tar.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;

    if (type === "x") {
      overrideName = paxRecords(data).get("path") ?? null;
      continue;
    }
    if (type === "L") {
      overrideName = cString(data, 0, data.length);
      continue;
    }
    if (type === "g") continue;

    const prefix = cString(header, 257, 5) === "ustar" ? cString(header, 345, 155) : "";
    const name = overrideName ?? (prefix ? `${prefix}/${cString(header, 0, 100)}` : cString(header, 0, 100));
    overrideName = null;
    if (type !== "0" && type !== "\0") continue;
    const path = name.split("/").slice(1).join("/");
    if (path) files.set(path, Buffer.from(data));
  }
  return files;
}

/** Regular files of a gzip-compressed tarball, as GitHub serves archives. */
export function readTarball(bytes: Buffer): Map<string, Buffer> {
  return readTar(gunzipSync(bytes));
}

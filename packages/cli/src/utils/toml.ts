/**
 * A deliberately small TOML table editor for `~/.codex/config.toml`.
 *
 * It does not parse TOML values. It only recognises table headers
 * (`[a.b]`, `[[a.b]]`) as section boundaries and treats every other line as
 * opaque text, so unrelated configuration survives byte-for-byte. The CLI
 * uses it to replace, insert, remove and list `[mcp_servers.<name>]` tables
 * (and their `.env` / `.http_headers` sub-tables) — nothing else.
 */

export type TomlScalar = string | number | boolean;
export type TomlValue = TomlScalar | TomlScalar[];

export interface TomlSection {
  /** Parsed header key path; `[]` for the implicit root section. */
  keyPath: string[];
  /** Raw lines, including the header line for non-root sections. */
  lines: string[];
}

const BARE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Parse a header line such as `[mcp_servers."my server".env] # comment` into
 * its key path. Returns null for lines that are not table headers.
 */
export function parseTomlHeader(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("[")) return null;

  const isArrayTable = trimmed.startsWith("[[");
  const open = isArrayTable ? "[[" : "[";
  const close = isArrayTable ? "]]" : "]";
  const closeIndex = findHeaderClose(trimmed, open.length, close);
  if (closeIndex === -1) return null;

  const inner = trimmed.slice(open.length, closeIndex);
  return splitKeyPath(inner);
}

function findHeaderClose(line: string, start: number, close: string): number {
  let quote: '"' | "'" | null = null;
  for (let i = start; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === "\\" && quote === '"') {
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (line.startsWith(close, i)) {
      return i;
    }
  }
  return -1;
}

/**
 * Read a quoted key starting at `start` (the opening quote). Returns the
 * decoded text and the index just past the closing quote, or null when the
 * quote never closes.
 */
function readQuotedKey(inner: string, start: number): { text: string; end: number } | null {
  const quote = inner[start]!;
  let text = "";
  for (let i = start + 1; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch === quote) return { text, end: i + 1 };
    if (ch === "\\" && quote === '"') {
      const next = inner[i + 1];
      if (next === undefined) return null;
      text += unescapeBasic(next);
      i++;
    } else {
      text += ch;
    }
  }
  return null;
}

/** Read one dotted-key part starting at `start`; stops before the next dot. Null when malformed. */
function readKeyPart(inner: string, start: number): { text: string; end: number } | null {
  let text = "";
  let sawQuoted = false;
  let i = start;
  while (i < inner.length && inner[i] !== ".") {
    const ch = inner[i]!;
    if (ch === '"' || ch === "'") {
      const quoted = readQuotedKey(inner, i);
      if (!quoted) return null;
      text += quoted.text;
      sawQuoted = true;
      i = quoted.end;
      continue;
    }
    if (ch !== " " && ch !== "\t") text += ch;
    i++;
  }
  if (text === "" && !sawQuoted) return null;
  return { text, end: i };
}

/** Split a dotted key path (`a."b.c".d`) into its parts; null when malformed. */
function splitKeyPath(inner: string): string[] | null {
  const parts: string[] = [];
  let i = 0;
  for (;;) {
    const part = readKeyPart(inner, i);
    if (!part) return null;
    parts.push(part.text);
    if (part.end >= inner.length) return parts;
    i = part.end + 1; // skip the dot
  }
}

function unescapeBasic(ch: string): string {
  switch (ch) {
    case "n": return "\n";
    case "t": return "\t";
    case "r": return "\r";
    case "b": return "\b";
    case "f": return "\f";
    default: return ch;
  }
}

/** Split a document into its root section followed by one section per table header. */
export function parseTomlSections(text: string): TomlSection[] {
  const lines = text.split(/\r?\n/);
  const sections: TomlSection[] = [{ keyPath: [], lines: [] }];
  for (const line of lines) {
    const keyPath = parseTomlHeader(line);
    if (keyPath) {
      sections.push({ keyPath, lines: [line] });
    } else {
      sections[sections.length - 1]!.lines.push(line);
    }
  }
  return sections;
}

function keyPathStartsWith(keyPath: string[], prefix: string[]): boolean {
  return prefix.length <= keyPath.length && prefix.every((part, i) => keyPath[i] === part);
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]!.trim() === "") start++;
  while (end > start && lines[end - 1]!.trim() === "") end--;
  return lines.slice(start, end);
}

function joinSections(sections: TomlSection[]): string {
  const blocks = sections
    .map((section) => trimBlankEdges(section.lines))
    .filter((lines) => lines.length > 0)
    .map((lines) => lines.join("\n"));
  return blocks.length === 0 ? "" : blocks.join("\n\n") + "\n";
}

export function formatTomlKey(key: string): string {
  return BARE_KEY_PATTERN.test(key) ? key : formatTomlString(key);
}

export function formatTomlString(value: string): string {
  let out = '"';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\r") out += "\\r";
    else if (code < 0x20 || code === 0x7f) out += `\\u${code.toString(16).padStart(4, "0")}`;
    else out += ch;
  }
  return out + '"';
}

export function formatTomlValue(value: TomlValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => formatTomlValue(v)).join(", ")}]`;
  }
  if (typeof value === "string") return formatTomlString(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Cannot encode ${value} as TOML`);
    return String(value);
  }
  return value ? "true" : "false";
}

export interface TomlTableSpec {
  keyPath: string[];
  entries: Record<string, TomlValue>;
}

function renderTable(table: TomlTableSpec): TomlSection {
  const header = `[${table.keyPath.map(formatTomlKey).join(".")}]`;
  const lines = [header];
  for (const [key, value] of Object.entries(table.entries)) {
    lines.push(`${formatTomlKey(key)} = ${formatTomlValue(value)}`);
  }
  return { keyPath: table.keyPath, lines };
}

/**
 * Remove every table whose key path equals `prefix` or lies below it, then
 * append the given tables at the end of the document. Everything outside
 * those tables is preserved verbatim.
 */
export function upsertTomlTables(text: string, prefix: string[], tables: TomlTableSpec[]): string {
  const kept = parseTomlSections(text).filter((section) => !keyPathStartsWith(section.keyPath, prefix));
  return joinSections([...kept, ...tables.map(renderTable)]);
}

/** Remove every table at or below `prefix`. Returns the new text and whether anything was removed. */
export function removeTomlTables(text: string, prefix: string[]): { text: string; removed: boolean } {
  const sections = parseTomlSections(text);
  const kept = sections.filter((section) => !keyPathStartsWith(section.keyPath, prefix));
  if (kept.length === sections.length) return { text, removed: false };
  return { text: joinSections(kept), removed: true };
}

/** Whether a table with exactly this key path exists. */
export function hasTomlTable(text: string, keyPath: string[]): boolean {
  return parseTomlSections(text).some(
    (section) => section.keyPath.length === keyPath.length && keyPathStartsWith(section.keyPath, keyPath)
  );
}

/** Names of the direct child tables of `parent` (e.g. the servers under `mcp_servers`). */
export function listTomlChildTables(text: string, parent: string[]): string[] {
  const names = new Set<string>();
  for (const section of parseTomlSections(text)) {
    if (section.keyPath.length === parent.length + 1 && keyPathStartsWith(section.keyPath, parent)) {
      names.add(section.keyPath[parent.length]!);
    }
  }
  return Array.from(names);
}

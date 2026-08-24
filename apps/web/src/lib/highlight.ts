/*
 * A deliberately small, dependency-free tokenizer for read-only file previews.
 * It colours the four things that help a reader orient in a file — comments,
 * strings, numbers and keywords (plus headings and fences in markdown) — and
 * leaves everything else alone. It never parses; a wrong guess costs a colour,
 * not correctness. Output is a list of tokens per line, rendered as React
 * elements (never as markup), so content can't inject anything.
 */

export type TokenType = "comment" | "string" | "number" | "keyword" | "heading" | "punct";

export interface Token {
  text: string;
  type?: TokenType;
}

interface LanguageRules {
  lineComment?: string[];
  blockComment?: [string, string];
  keywords: string[];
}

const C_LIKE_KEYWORDS = [
  "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for", "from", "function", "if",
  "implements", "import", "in", "instanceof", "interface", "let", "new", "null", "of", "private", "protected",
  "public", "return", "static", "super", "switch", "this", "throw", "true", "try", "type", "typeof", "undefined",
  "var", "void", "while", "yield", "fn", "impl", "mut", "pub", "struct", "trait", "use", "match", "func", "go",
  "package", "defer", "chan", "range", "int", "string", "bool", "nil", "int64", "float64", "byte", "error",
];

const SCRIPT_KEYWORDS = [
  "and", "as", "assert", "async", "await", "break", "case", "class", "continue", "def", "del", "do", "done",
  "elif", "else", "end", "esac", "except", "exit", "export", "fi", "finally", "for", "from", "function", "global",
  "if", "import", "in", "is", "lambda", "local", "module", "nonlocal", "not", "or", "pass", "raise", "return",
  "self", "then", "try", "until", "while", "with", "yield", "True", "False", "None", "echo", "set", "source",
  "require", "unless", "begin", "rescue", "ensure", "nil", "true", "false", "FROM", "RUN", "COPY", "ADD", "CMD",
  "ENTRYPOINT", "ENV", "ARG", "WORKDIR", "EXPOSE", "VOLUME", "USER", "LABEL",
];

const RULES: Record<string, LanguageRules> = {
  javascript: { lineComment: ["//"], blockComment: ["/*", "*/"], keywords: C_LIKE_KEYWORDS },
  typescript: { lineComment: ["//"], blockComment: ["/*", "*/"], keywords: C_LIKE_KEYWORDS },
  go: { lineComment: ["//"], blockComment: ["/*", "*/"], keywords: C_LIKE_KEYWORDS },
  rust: { lineComment: ["//"], blockComment: ["/*", "*/"], keywords: C_LIKE_KEYWORDS },
  java: { lineComment: ["//"], blockComment: ["/*", "*/"], keywords: C_LIKE_KEYWORDS },
  kotlin: { lineComment: ["//"], blockComment: ["/*", "*/"], keywords: C_LIKE_KEYWORDS },
  swift: { lineComment: ["//"], blockComment: ["/*", "*/"], keywords: C_LIKE_KEYWORDS },
  c: { lineComment: ["//"], blockComment: ["/*", "*/"], keywords: C_LIKE_KEYWORDS },
  cpp: { lineComment: ["//"], blockComment: ["/*", "*/"], keywords: C_LIKE_KEYWORDS },
  csharp: { lineComment: ["//"], blockComment: ["/*", "*/"], keywords: C_LIKE_KEYWORDS },
  php: { lineComment: ["//", "#"], blockComment: ["/*", "*/"], keywords: C_LIKE_KEYWORDS },
  css: { blockComment: ["/*", "*/"], keywords: [] },
  scss: { lineComment: ["//"], blockComment: ["/*", "*/"], keywords: [] },
  less: { lineComment: ["//"], blockComment: ["/*", "*/"], keywords: [] },
  json: { keywords: ["true", "false", "null"] },
  shell: { lineComment: ["#"], keywords: SCRIPT_KEYWORDS },
  python: { lineComment: ["#"], keywords: SCRIPT_KEYWORDS },
  ruby: { lineComment: ["#"], keywords: SCRIPT_KEYWORDS },
  yaml: { lineComment: ["#"], keywords: ["true", "false", "null", "yes", "no"] },
  toml: { lineComment: ["#"], keywords: ["true", "false"] },
  ini: { lineComment: ["#", ";"], keywords: ["true", "false"] },
  dockerfile: { lineComment: ["#"], keywords: SCRIPT_KEYWORDS },
  makefile: { lineComment: ["#"], keywords: [] },
  lua: { lineComment: ["--"], keywords: SCRIPT_KEYWORDS },
  sql: { lineComment: ["--"], blockComment: ["/*", "*/"], keywords: ["SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "INDEX", "ON", "AND", "OR", "NOT", "NULL", "PRIMARY", "KEY", "DEFAULT", "JOIN", "LEFT", "INNER", "ORDER", "BY", "GROUP", "LIMIT", "AS", "IN", "IS"] },
  html: { blockComment: ["<!--", "-->"], keywords: [] },
  xml: { blockComment: ["<!--", "-->"], keywords: [] },
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const matcherCache = new Map<string, RegExp>();

function matcherFor(language: string, rules: LanguageRules): RegExp {
  const cached = matcherCache.get(language);
  if (cached) return cached;
  const alternatives = [
    rules.lineComment?.length ? `(?<comment>(?:${rules.lineComment.map(escapeRegExp).join("|")}).*)` : null,
    rules.blockComment ? `(?<block>${escapeRegExp(rules.blockComment[0])})` : null,
    `(?<string>"(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)`,
    `(?<number>(?<![\\w.])-?\\d+(?:\\.\\d+)?(?![\\w.]))`,
    rules.keywords.length ? `(?<keyword>(?<![\\w$])(?:${rules.keywords.map(escapeRegExp).join("|")})(?![\\w$]))` : null,
  ].filter((part): part is string => part !== null);
  const matcher = new RegExp(alternatives.join("|"), "g");
  matcherCache.set(language, matcher);
  return matcher;
}

function push(tokens: Token[], text: string, type?: TokenType) {
  if (text.length === 0) return;
  const last = tokens[tokens.length - 1];
  if (last && last.type === type) last.text += text;
  else tokens.push(type ? { text, type } : { text });
}

/**
 * Consume a block comment beginning at `start`: everything up to the closer (searched
 * from `searchFrom`) becomes one comment token. When the closer is not on this line the
 * rest of the line is the comment and `state.inBlock` carries into the next line.
 * Returns the position tokenizing resumes at.
 */
function consumeBlockComment(
  tokens: Token[],
  line: string,
  start: number,
  searchFrom: number,
  closer: string,
  state: { inBlock: boolean }
): number {
  const close = line.indexOf(closer, searchFrom);
  if (close === -1) {
    push(tokens, line.slice(start), "comment");
    state.inBlock = true;
    return line.length;
  }
  const end = close + closer.length;
  push(tokens, line.slice(start, end), "comment");
  state.inBlock = false;
  return end;
}

function matchedType(groups: Record<string, string | undefined>): TokenType {
  if (groups.comment !== undefined) return "comment";
  if (groups.string !== undefined) return "string";
  if (groups.number !== undefined) return "number";
  return "keyword";
}

function tokenizeCodeLine(line: string, rules: LanguageRules, matcher: RegExp, state: { inBlock: boolean }): Token[] {
  const tokens: Token[] = [];
  let position = 0;
  while (position < line.length) {
    if (state.inBlock) {
      position = consumeBlockComment(tokens, line, position, position, rules.blockComment![1], state);
      continue;
    }
    matcher.lastIndex = position;
    const match = matcher.exec(line);
    if (!match) {
      push(tokens, line.slice(position));
      break;
    }
    push(tokens, line.slice(position, match.index));
    const groups = match.groups ?? {};
    if (groups.block !== undefined) {
      position = consumeBlockComment(
        tokens,
        line,
        match.index,
        match.index + groups.block.length,
        rules.blockComment![1],
        state
      );
      continue;
    }
    push(tokens, match[0], matchedType(groups));
    position = match.index + match[0].length;
  }
  return tokens;
}

function tokenizeMarkdownLine(line: string, state: { inFence: boolean }): Token[] {
  if (/^\s*(```|~~~)/.test(line)) {
    state.inFence = !state.inFence;
    return [{ text: line, type: "punct" }];
  }
  if (state.inFence) return [{ text: line }];
  if (/^#{1,6}\s/.test(line)) return [{ text: line, type: "heading" }];
  if (/^\s*>/.test(line)) return [{ text: line, type: "comment" }];
  const tokens: Token[] = [];
  const bullet = /^(\s*(?:[-*+]|\d+\.)\s+)/.exec(line)?.[1];
  let rest = line;
  if (bullet) {
    push(tokens, bullet, "punct");
    rest = line.slice(bullet.length);
  }
  const inlineCode = /`[^`\n]+`/g;
  let position = 0;
  for (const match of rest.matchAll(inlineCode)) {
    push(tokens, rest.slice(position, match.index));
    push(tokens, match[0], "string");
    position = match.index + match[0].length;
  }
  push(tokens, rest.slice(position));
  return tokens;
}

/** Splits `text` into lines of tokens for `language` ("plaintext" yields untyped lines). */
export function tokenize(text: string, language: string): Token[][] {
  const lines = text.split("\n");
  if (language === "markdown") {
    const state = { inFence: false };
    return lines.map((line) => tokenizeMarkdownLine(line, state));
  }
  const rules = RULES[language];
  if (!rules) return lines.map((line) => [{ text: line }]);
  const matcher = matcherFor(language, rules);
  const state = { inBlock: false };
  return lines.map((line) => tokenizeCodeLine(line, rules, matcher, state));
}

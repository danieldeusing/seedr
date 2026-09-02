/**
 * Everything the registry records about an item's content at one pinned commit:
 * the full file tree, the contract digest over the file bytes, the license provenance
 * and the legacy blob hash. Shared by the official and community sources.
 */

import type { GitHubClient } from "./github.js";
import { computeContentDigest } from "./digest.js";
import { describeLicense, locateLicense } from "./license.js";
import type { FileTreeNode, LicenseInfo, ManifestItem, PluginType } from "./types.js";
import { buildFileTree, computeLegacyContentHash, isSkillDirectory, listTreeFiles, mapConcurrent, parsePluginContents, skillNamesIn, treeHasDirectory, type PluginJson, type TreeFile } from "./utils.js";
import type { GitTreeItem } from "./types.js";

/** Refuse to hash repositories beyond this size; the CLI would have to download all of it per install. */
export const MAX_CONTENT_BYTES = 200 * 1024 * 1024;
const FILE_CONCURRENCY = 8;

export interface CollectedContent {
  files: FileTreeNode[];
  /** Every regular file under the item directory with its bytes. */
  entries: { path: string; bytes: Buffer; blobSha: string }[];
  contentDigest: string | null;
  contentHash: string | null;
  license: LicenseInfo;
  /** Symlinks and submodules that were left out of the tree. */
  skipped: string[];
}

export interface ContentLocation {
  /** "owner/repo" */
  repo: string;
  /** Commit the content is read at. */
  sha: string;
  /** Directory inside the repository, "" for the root. */
  path: string;
}

/** Look up one file's bytes among collected entries. */
export function findEntry(content: CollectedContent, path: string): Buffer | null {
  return content.entries.find((entry) => entry.path === path)?.bytes ?? null;
}

export async function collectContent(client: GitHubClient, location: ContentLocation, tree: readonly GitTreeItem[]): Promise<CollectedContent> {
  const { repo, sha, path } = location;
  if (!treeHasDirectory(tree, path)) {
    throw new Error(`directory "${path}" does not exist in ${repo} at ${sha}`);
  }
  const { files, skipped } = listTreeFiles(tree, path);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_CONTENT_BYTES) {
    throw new Error(`content of ${repo}/${path || "."} at ${sha} is ${totalBytes} bytes, above the ${MAX_CONTENT_BYTES}-byte limit`);
  }

  const fullPath = (file: TreeFile): string => (path ? `${path}/${file.path}` : file.path);
  const entries = await mapConcurrent(files, FILE_CONCURRENCY, async (file) => ({
    path: file.path,
    bytes: await client.getRawBytes(repo, sha, fullPath(file), file.blobSha),
    blobSha: file.blobSha,
  }));

  const rootFiles = path === "" ? files : listTreeFiles(tree, "").files;
  const licenseLocation = locateLicense(
    files.map((file) => file.path),
    rootFiles.map((file) => file.path),
    path,
  );
  const bytesByPath = new Map(entries.map((entry) => [entry.path, entry.bytes]));
  const digestEntries: { path: string; bytes: Buffer }[] = entries.map(({ path: entryPath, bytes }) => ({ path: entryPath, bytes }));
  let licenseText: string | null = null;
  if (licenseLocation?.installAs) {
    // Root-level license outside the item tree: it travels with the install, so it is part of the digest (§2 step 2).
    const rootFile = rootFiles.find((file) => file.path === licenseLocation.file);
    if (!rootFile) throw new Error(`license file ${licenseLocation.file} vanished from the tree of ${repo} at ${sha}`);
    const bytes = await client.getRawBytes(repo, sha, licenseLocation.file, rootFile.blobSha);
    licenseText = bytes.toString("utf-8");
    if (!bytesByPath.has(licenseLocation.installAs)) {
      digestEntries.push({ path: licenseLocation.installAs, bytes });
    }
  } else if (licenseLocation) {
    const relativePath = path ? licenseLocation.file.slice(path.length + 1) : licenseLocation.file;
    licenseText = bytesByPath.get(relativePath)?.toString("utf-8") ?? null;
  }

  return {
    files: buildFileTree(files.map((file) => file.path)),
    entries,
    contentDigest: computeContentDigest(digestEntries),
    contentHash: computeLegacyContentHash(files),
    license: describeLicense(licenseLocation, licenseText),
    skipped,
  };
}

/** Server names from an .mcp.json-style file: `{ mcpServers: {...} }` or a flat map. */
function mcpServerNamesFromFile(content: CollectedContent, path: string): string[] {
  const mcp = parseJsonEntry<Record<string, unknown>>(content, path.replace(/^(\.\/)+/, ""));
  if (!mcp) return [];
  const servers = (mcp.mcpServers as Record<string, unknown> | undefined) ?? mcp;
  return Object.keys(servers).filter((key) => key !== "mcpServers");
}

/**
 * plugin.json `mcpServers` is either an inline map of servers, a path to an .mcp.json file
 * inside the plugin, or an array of such paths.
 */
export function declaredMcpServerNames(content: CollectedContent, declared: unknown): string[] {
  if (typeof declared === "string") return mcpServerNamesFromFile(content, declared);
  if (Array.isArray(declared)) {
    return [...new Set(declared.flatMap((entry) => (typeof entry === "string" ? mcpServerNamesFromFile(content, entry) : [])))];
  }
  if (typeof declared === "object" && declared !== null) return Object.keys(declared);
  return [];
}

export function parseJsonEntry<T>(content: CollectedContent, path: string): T | null {
  const bytes = findEntry(content, path);
  if (!bytes) return null;
  try {
    return JSON.parse(bytes.toString("utf-8")) as T;
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${(error as Error).message}`, { cause: error });
  }
}

/**
 * When no license text exists upstream but plugin.json declares one, record the declared
 * identifier next to the note so the registry still says what the author claims.
 */
export function withDeclaredLicense(license: LicenseInfo, declared: unknown): LicenseInfo {
  if (license.file || typeof declared !== "string" || declared.trim().length === 0) return license;
  return { spdx: declared.trim(), note: `${license.note ?? "No license text found upstream."} plugin.json declares "${declared.trim()}".` };
}

/**
 * Names of the skills a plugin.json declares by path. Each path is either a
 * skill itself (`./skills/engineering/tdd` → `tdd`) or a directory of skills
 * (`./skills/` → every skill in it), resolved against the file tree so a path
 * that ships nothing counts nothing.
 */
export function declaredSkillNames(value: PluginJson["skills"], files: readonly FileTreeNode[]): string[] {
  const paths = typeof value === "string" ? [value] : Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  const names = new Set<string>();
  for (const declared of paths) {
    const segments = declared.split("/").filter((segment) => segment !== "" && segment !== ".");
    let level: readonly FileTreeNode[] | undefined = files;
    let node: FileTreeNode | undefined;
    for (const segment of segments) {
      node = level?.find((candidate) => candidate.name === segment);
      level = node?.children;
    }
    if (segments.length > 0 && !node) continue;
    if (node && isSkillDirectory(node)) names.add(node.name);
    else for (const name of skillNamesIn(level ?? [])) names.add(name);
  }
  return [...names];
}

export interface PluginClassification {
  pluginType: PluginType;
  wrapper?: string;
  integration?: string;
  package?: Record<string, number>;
}

/**
 * Classify a plugin from its file tree plus the declarations that are not visible in the
 * tree: hooks.json trigger names, .mcp.json / plugin.json server names, inline marketplace
 * `lspServers` (integration) and `skills` (strict:false entries without a skills/ folder).
 */
export function classifyPlugin(
  content: CollectedContent,
  options: { pluginJson: PluginJson | null; lspServers?: Record<string, unknown>; inlineSkills?: string[]; existing: ManifestItem | null },
): PluginClassification {
  const { existing } = options;
  if (options.lspServers || existing?.pluginType === "integration") {
    return { pluginType: "integration", integration: existing?.integration ?? "lsp" };
  }

  const parsed = parsePluginContents(content.files);
  if (parsed.hooks) {
    for (const hooksPath of ["hooks/hooks.json", ".claude/hooks/hooks.json"]) {
      const hooks = parseJsonEntry<{ hooks?: Record<string, unknown> }>(content, hooksPath);
      if (hooks?.hooks && Object.keys(hooks.hooks).length > 0) {
        parsed.hooks = Object.keys(hooks.hooks);
        break;
      }
    }
  }
  if (parsed.mcpServers?.[0] === ".mcp.json") {
    const names = mcpServerNamesFromFile(content, ".mcp.json");
    if (names.length > 0) parsed.mcpServers = names;
  } else if (!parsed.mcpServers) {
    const names = declaredMcpServerNames(content, options.pluginJson?.mcpServers);
    if (names.length > 0) parsed.mcpServers = names;
  }
  if (!parsed.skills && options.inlineSkills && options.inlineSkills.length > 0) {
    parsed.skills = options.inlineSkills;
  }
  const declaredSkills = declaredSkillNames(options.pluginJson?.skills, content.files);
  if (declaredSkills.length > 0) parsed.skills = [...new Set([...(parsed.skills ?? []), ...declaredSkills])];

  const contentKeyToType: Record<string, string> = { skills: "skill", agents: "agent", hooks: "hook", commands: "command", mcpServers: "mcp" };
  const counts: Record<string, number> = {};
  for (const [key, typeName] of Object.entries(contentKeyToType)) {
    const list = parsed[key as keyof typeof parsed];
    if (Array.isArray(list) && list.length > 0) counts[typeName] = list.length;
  }
  const kinds = Object.keys(counts);
  if (kinds.length === 1) return { pluginType: "wrapper", wrapper: kinds[0]! };
  return { pluginType: "package", package: counts };
}

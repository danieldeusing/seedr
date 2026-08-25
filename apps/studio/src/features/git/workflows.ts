import { fs as defaultFs, type FsApi } from "@/api/fs";

/**
 * Which GitHub workflows a push to a branch would start. Publishing is not a
 * local act when a branch is wired to a deploy: seedr's `prod` ships the web app
 * and publishes the CLI to npm. Studio reads that from the workflows themselves
 * rather than carrying a list that can go stale.
 */
const WORKFLOW_DIR = ".github/workflows";

const unquote = (value: string): string => value.trim().replace(/^["']|["']$/g, "");

/**
 * The branches a workflow's `on: push:` names, in either YAML shape. Walked line
 * by line rather than matched in one expression: indentation is what says where
 * the push block ends, and that is easier to read than to encode.
 */
export function pushBranches(yaml: string): string[] {
  const branches: string[] = [];
  let pushIndent: number | null = null;
  let listing = false;
  for (const line of yaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (pushIndent !== null && indent <= pushIndent) {
      pushIndent = null;
      listing = false;
    }
    if (/^push:\s*$/.test(trimmed)) {
      pushIndent = indent;
      continue;
    }
    if (pushIndent === null) continue;

    const inline = /^branches:\s*\[([^\]]*)]/.exec(trimmed);
    if (inline?.[1] !== undefined) {
      branches.push(...inline[1].split(",").map(unquote).filter(Boolean));
      continue;
    }
    if (/^branches:\s*$/.test(trimmed)) {
      listing = true;
      continue;
    }
    const item = listing ? /^-\s*(.+)$/.exec(trimmed) : null;
    if (item?.[1]) branches.push(unquote(item[1]));
    else if (!item) listing = false;
  }
  return branches;
}

/** Branch name → the workflow files a push to it triggers. */
export async function pushTriggers(fs: FsApi = defaultFs): Promise<Record<string, string[]>> {
  const triggers: Record<string, string[]> = {};
  if (!(await fs.pathExists(WORKFLOW_DIR))) return triggers;
  for (const entry of await fs.listDir(WORKFLOW_DIR)) {
    if (entry.kind !== "file" || !/\.ya?ml$/.test(entry.name)) continue;
    let yaml: string;
    try {
      yaml = await fs.readText(`${WORKFLOW_DIR}/${entry.name}`);
    } catch {
      continue;
    }
    for (const branch of pushBranches(yaml)) (triggers[branch] ??= []).push(entry.name);
  }
  return triggers;
}

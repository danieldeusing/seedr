#!/usr/bin/env node
/**
 * Link the agent-neutral `.agents/` tree into the places Claude Code reads.
 *
 * `.agents/` is canonical and committed: skills, rules, agents (subagents) and
 * hooks. Claude Code discovers `.claude/skills/<name>`, `.claude/rules` and
 * `.claude/agents`, so this script links those to `.agents/` — per skill, because
 * a symlinked `.claude/skills` parent is undocumented, and as whole directories
 * for rules and agents. Hooks need no link: `.claude/settings.json` names their
 * path directly. The links are generated and gitignored; the root `prepare`
 * script runs this on `pnpm install`, so a fresh clone needs no manual step.
 *
 * Directories only, as junctions on Windows: a junction needs no elevation, a
 * file symlink does. Where even a junction is refused the directory is copied
 * instead and a marker records the source tree's hash, so drift is detected and
 * re-synced on the next run. A real directory that is neither a link nor a
 * marker-owned copy is never touched — that is someone's work, and the script
 * fails loudly instead.
 *
 * Zero dependencies on purpose: it runs before anything is installed.
 */
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Written into a copied directory so a later run can tell it from someone's real one. */
export const MARKER = ".setup-agents.json";

const LINK_TYPE = process.platform === "win32" ? "junction" : "dir";

/**
 * The links to maintain, relative to the repo root: two whole directories plus
 * one entry per canonical skill.
 */
function linkPlan(root) {
  const skillsDir = resolve(root, ".agents", "skills");
  const skills = existsSync(skillsDir)
    ? readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];
  return {
    skills,
    links: [
      { link: ".claude/rules", target: ".agents/rules" },
      { link: ".claude/agents", target: ".agents/agents" },
      ...skills.map((name) => ({ link: `.claude/skills/${name}`, target: `.agents/skills/${name}` })),
    ],
  };
}

/** sha256 over a directory's sorted relative paths and file contents. */
export function hashTree(dir) {
  const hash = createHash("sha256");
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        hash.update(relative(dir, full).split("\\").join("/"));
        hash.update("\0");
        hash.update(readFileSync(full));
        hash.update("\0");
      }
    }
  };
  walk(dir);
  return hash.digest("hex");
}

function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/** Where a link points, as an absolute path, or null for anything that is not a link. */
function linkTarget(linkPath) {
  const raw = readlinkSync(linkPath).replace(/^\\\\\?\\/, "");
  return resolve(dirname(linkPath), raw);
}

function samePath(a, b) {
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function readMarker(dir) {
  const markerPath = join(dir, MARKER);
  if (!existsSync(markerPath)) return null;
  return JSON.parse(readFileSync(markerPath, "utf8"));
}

function copyWithMarker(absTarget, absLink, target) {
  cpSync(absTarget, absLink, { recursive: true });
  writeFileSync(
    join(absLink, MARKER),
    JSON.stringify({ source: target, hash: hashTree(absTarget) }, null, 2) + "\n"
  );
}

/**
 * Make `link` point at `target` (both relative to `root`). Returns what happened:
 * "linked", "copied", "resynced" or "unchanged".
 */
function ensureLink(root, { link, target }, symlink) {
  const absTarget = resolve(root, target);
  const absLink = resolve(root, link);
  if (!existsSync(absTarget)) {
    throw new Error(`${target} does not exist — the canonical .agents/ tree is incomplete`);
  }
  mkdirSync(dirname(absLink), { recursive: true });

  const stat = lstatOrNull(absLink);
  if (stat?.isSymbolicLink()) {
    if (existsSync(absLink) && samePath(linkTarget(absLink), absTarget)) return "unchanged";
    // Dangling, or pointing somewhere else: replace it. unlink, never rm — rm
    // follows a link to a directory and would reach into the canonical tree.
    unlinkSync(absLink);
  } else if (stat?.isDirectory()) {
    const marker = readMarker(absLink);
    if (!marker) {
      throw new Error(
        `${link} is a real directory, not a link. Move its contents into ${target} and delete it, then re-run.`
      );
    }
    if (marker.hash === hashTree(absTarget)) return "unchanged";
    rmSync(absLink, { recursive: true, force: true });
    copyWithMarker(absTarget, absLink, target);
    return "resynced";
  } else if (stat) {
    throw new Error(`${link} exists and is not a directory or link. Remove it, then re-run.`);
  }

  try {
    // Relative on Unix so the checkout stays relocatable; Node makes a junction's
    // target absolute itself, which is what Windows requires.
    symlink(relative(dirname(absLink), absTarget), absLink, LINK_TYPE);
    return "linked";
  } catch (error) {
    if (!["EPERM", "EACCES", "ENOSYS"].includes(error.code)) throw error;
    copyWithMarker(absTarget, absLink, target);
    return "copied";
  }
}

/**
 * Remove `.claude/skills/<name>` entries we created for skills that no longer
 * exist in `.agents/skills`. Only links and marker-owned copies are removed; a
 * real directory someone keeps there is not ours to delete.
 */
function removeStaleSkillLinks(root, skills) {
  const dir = resolve(root, ".claude", "skills");
  if (!existsSync(dir)) return [];
  const removed = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skills.includes(entry.name)) continue;
    const full = join(dir, entry.name);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) {
      unlinkSync(full);
    } else if (stat.isDirectory() && readMarker(full) !== null) {
      rmSync(full, { recursive: true, force: true });
    } else {
      continue;
    }
    removed.push(`.claude/skills/${entry.name}`);
  }
  return removed;
}

/**
 * @param {string} root repo root
 * @param {{ symlink?: typeof symlinkSync }} [options] `symlink` is injectable so
 *   the copy fallback can be exercised on a machine where links work.
 */
export function setupAgents(root, { symlink = symlinkSync } = {}) {
  const { skills, links } = linkPlan(root);
  const report = { linked: [], copied: [], resynced: [], unchanged: [], removed: [] };
  for (const entry of links) {
    report[ensureLink(root, entry, symlink)].push(entry.link);
  }
  report.removed.push(...removeStaleSkillLinks(root, skills));
  return report;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const root = process.argv[2]
    ? resolve(process.argv[2])
    : resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const report = setupAgents(root);
    const changes = [
      ...report.linked.map((p) => `linked   ${p}`),
      ...report.copied.map((p) => `copied   ${p} (links unavailable; marker written)`),
      ...report.resynced.map((p) => `resynced ${p}`),
      ...report.removed.map((p) => `removed  ${p}`),
    ];
    for (const line of changes) console.log(`setup-agents: ${line}`);
    console.log(
      `setup-agents: ${report.unchanged.length + changes.length} entries in .claude/ → .agents/ (${changes.length} changed)`
    );
  } catch (error) {
    console.error(`setup-agents: ${error.message}`);
    process.exit(1);
  }
}

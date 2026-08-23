/**
 * License detection per docs/registry-integrity.md §3.
 *
 * The upstream tree is searched for LICENSE, LICENSE.*, COPYING, COPYING.*, NOTICE,
 * NOTICE.* (case-insensitive) — first among the item directory's own files, then at the
 * source repository root. A root match is not part of the item tree, so the CLI writes it
 * next to the installed content under `installAs`.
 */

import type { LicenseInfo } from "./types.js";

const LICENSE_NAME = /^(license|copying|notice)(\..*)?$/i;

/** Search priority: LICENSE before COPYING before NOTICE; an exact name before its extension variants. */
function licenseRank(name: string): number {
  const lower = name.toLowerCase();
  const family = lower.startsWith("license") ? 0 : lower.startsWith("copying") ? 1 : 2;
  const exact = lower === "license" || lower === "copying" || lower === "notice" ? 0 : 1;
  return family * 2 + exact;
}

function pickLicense(names: readonly string[]): string | null {
  const candidates = names.filter((name) => LICENSE_NAME.test(name));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => licenseRank(a) - licenseRank(b) || (a < b ? -1 : a > b ? 1 : 0));
  return candidates[0]!;
}

export interface LicenseLocation {
  /** Path of the license file relative to the repository root. */
  file: string;
  /** Set when the file lies outside the item directory (it is then materialised under this name). */
  installAs?: "LICENSE" | "NOTICE";
}

/**
 * @param itemFiles  paths (relative to the item directory) of the item's own files
 * @param rootFiles  paths (relative to the repository root) of the repository's root-level files
 * @param itemDir    item directory relative to the repository root ("" when the item is the root)
 */
export function locateLicense(
  itemFiles: readonly string[],
  rootFiles: readonly string[],
  itemDir: string,
): LicenseLocation | null {
  const ownTopLevel = itemFiles.filter((path) => !path.includes("/"));
  const own = pickLicense(ownTopLevel);
  if (own) {
    return { file: itemDir ? `${itemDir}/${own}` : own };
  }
  if (itemDir === "") return null;

  const root = pickLicense(rootFiles.filter((path) => !path.includes("/")));
  if (!root) return null;
  return { file: root, installAs: root.toLowerCase().startsWith("notice") ? "NOTICE" : "LICENSE" };
}

/**
 * Best-effort SPDX guess from the license text; `undefined` when no known wording is
 * recognised. Covers the contract's list plus the Creative Commons 4.0 licenses that
 * several skill collections use.
 */
export function guessSpdx(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (/Attribution-NonCommercial-ShareAlike 4\.0 International|CC BY-NC-SA 4\.0/i.test(normalized)) return "CC-BY-NC-SA-4.0";
  if (/Attribution-ShareAlike 4\.0 International|CC BY-SA 4\.0/i.test(normalized)) return "CC-BY-SA-4.0";
  if (/Attribution 4\.0 International|CC BY 4\.0/i.test(normalized)) return "CC-BY-4.0";
  if (/Apache License,? Version 2\.0|Apache-2\.0/i.test(normalized)) return "Apache-2.0";
  if (/Mozilla Public License,? (?:Version |v\.? ?)2\.0|MPL-2\.0/i.test(normalized)) return "MPL-2.0";
  if (/GNU GENERAL PUBLIC LICENSE Version 3|GPL-3\.0/i.test(normalized)) return "GPL-3.0-only";
  if (/Redistribution and use in source and binary forms/i.test(normalized)) {
    return /Neither the name of .* nor the names of .* may be used to endorse/i.test(normalized)
      ? "BSD-3-Clause"
      : "BSD-2-Clause";
  }
  if (/Permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee/i.test(normalized)) {
    return "ISC";
  }
  if (/^ISC License/i.test(normalized)) return "ISC";
  if (/Permission is hereby granted, free of charge, to any person obtaining a copy/i.test(normalized)) return "MIT";
  if (/^(The )?MIT License/i.test(normalized)) return "MIT";
  return undefined;
}

export function describeLicense(location: LicenseLocation | null, text: string | null): LicenseInfo {
  if (!location) {
    return { note: "No license text found upstream (searched the item directory and the repository root)." };
  }
  const spdx = text === null ? undefined : guessSpdx(text);
  return {
    ...(spdx && { spdx }),
    file: location.file,
    ...(location.installAs && { installAs: location.installAs }),
  };
}

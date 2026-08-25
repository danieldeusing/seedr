import { readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { ensureDir, writeFileAtomic } from "./fs.js";

/**
 * Read and parse a JSON file. Returns empty object if file doesn't exist.
 */
export async function readJson<T = Record<string, unknown>>(
  path: string
): Promise<T> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as T;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {} as T;
    }
    if (error instanceof SyntaxError) {
      // Seven different config files reach this; without the path the user
      // cannot tell which one is malformed.
      throw new Error(`${path} is not valid JSON: ${error.message}`, { cause: error });
    }
    throw error;
  }
}

async function existingFileMode(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).mode & 0o777;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * Write an object to a JSON file with pretty formatting.
 *
 * The write is atomic: the document goes to a temporary file in the same
 * directory and is renamed over the target, so a crash or a failing write
 * never leaves a truncated `settings.json` behind. An existing file keeps
 * its permission bits.
 */
export async function writeJson(
  path: string,
  data: unknown
): Promise<void> {
  await ensureDir(dirname(path));
  const mode = await existingFileMode(path);
  await writeFileAtomic(path, JSON.stringify(data, null, 2) + "\n", { mode });
}

/**
 * Deep merge two objects. Arrays are replaced, not merged.
 * Source values override target values.
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue !== null &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Merge a value into a specific field of a JSON file.
 */
export async function mergeJsonField<T = unknown>(
  path: string,
  field: string,
  value: T
): Promise<void> {
  const data = await readJson(path);

  if (field) {
    const existing = data[field];
    if (
      existing !== null &&
      typeof existing === "object" &&
      !Array.isArray(existing) &&
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      data[field] = { ...existing, ...value };
    } else {
      data[field] = value;
    }
  } else {
    // No field specified - merge at root level
    Object.assign(data, value);
  }

  await writeJson(path, data);
}

/**
 * Remove a key from a specific field of a JSON file.
 */
export async function removeJsonFieldKey(
  path: string,
  field: string,
  key: string
): Promise<boolean> {
  const data = await readJson(path);
  const fieldData = field ? data[field] : data;

  if (
    fieldData === null ||
    typeof fieldData !== "object" ||
    Array.isArray(fieldData)
  ) {
    return false;
  }

  if (!(key in fieldData)) {
    return false;
  }

  delete (fieldData as Record<string, unknown>)[key];
  await writeJson(path, data);
  return true;
}

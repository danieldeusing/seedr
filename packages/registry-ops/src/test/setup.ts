import { afterAll } from "vitest";
import { cleanupTempDirs } from "./tempDir.js";

// Runs per test file: everything makeTempDir() handed out is removed.
afterAll(cleanupTempDirs);

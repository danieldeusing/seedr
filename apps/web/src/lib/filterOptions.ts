import { agentLabels, sourceLabels, scopeLabels } from "./colors";
import { getAllItems } from "./registry";

export const agentOptions = [
  { value: "claude", label: agentLabels.claude },
  { value: "copilot", label: agentLabels.copilot },
  { value: "gemini", label: agentLabels.gemini },
  { value: "codex", label: agentLabels.codex },
  { value: "opencode", label: agentLabels.opencode },
];

// Only offer sources that exist in this build — a private-only instance
// shouldn't show public source filters, and the public site no "Private" one.
// The ?? "toolr" default mirrors Browse's filter matching.
const presentSources = new Set(getAllItems().map((item) => item.sourceType ?? "toolr"));
export const sourceOptions = (["official", "toolr", "community", "private"] as const)
  .filter((source) => presentSources.has(source))
  .map((source) => ({ value: source, label: sourceLabels[source] }));

export const scopeOptions = [
  { value: "user", label: scopeLabels.user },
  { value: "project", label: scopeLabels.project },
  { value: "local", label: scopeLabels.local },
];

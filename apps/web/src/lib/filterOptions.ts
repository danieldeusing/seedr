import { agentLabels, sourceLabels, scopeLabels } from "./colors";
import { hasPrivateItems } from "./registry";

export const agentOptions = [
  { value: "claude", label: agentLabels.claude },
  { value: "copilot", label: agentLabels.copilot },
  { value: "gemini", label: agentLabels.gemini },
  { value: "codex", label: agentLabels.codex },
  { value: "opencode", label: agentLabels.opencode },
];

export const sourceOptions = [
  { value: "official", label: sourceLabels.official },
  { value: "toolr", label: sourceLabels.toolr },
  { value: "community", label: sourceLabels.community },
  // Only offered when this build actually bundles private items, so the
  // public site never shows a filter that can't match anything.
  ...(hasPrivateItems ? [{ value: "private", label: sourceLabels.private }] : []),
];

export const scopeOptions = [
  { value: "user", label: scopeLabels.user },
  { value: "project", label: scopeLabels.project },
  { value: "local", label: scopeLabels.local },
];

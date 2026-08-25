import { CANONICAL_AGENTS } from "@seedr/registry-ops/pure";
import { agentLabels, sourceLabels, scopeLabels } from "./colors";

export const agentOptions = CANONICAL_AGENTS.map((agent) => ({ value: agent, label: agentLabels[agent] }));

export const sourceOptions = [
  { value: "official", label: sourceLabels.official },
  { value: "seedr", label: sourceLabels.seedr },
  { value: "community", label: sourceLabels.community },
];

export const scopeOptions = [
  { value: "user", label: scopeLabels.user },
  { value: "project", label: scopeLabels.project },
  { value: "local", label: scopeLabels.local },
];

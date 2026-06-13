// toolr-design-ignore-next-line
import { Sparkles, Bot, Webhook, Terminal, Plug } from "lucide-react";

export const capabilityTypes = [
  { type: "skill", icon: Sparkles, label: "Skill", labelPlural: "Skills" },
  { type: "agent", icon: Bot, label: "Agent", labelPlural: "Agents" },
  { type: "hook", icon: Webhook, label: "Hook", labelPlural: "Hooks" },
  { type: "command", icon: Terminal, label: "Command", labelPlural: "Commands" },
  { type: "mcp", icon: Plug, label: "MCP Server", labelPlural: "MCP Servers" },
] as const;

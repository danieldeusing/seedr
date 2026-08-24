/* global document, navigator, setTimeout */
// Seedr CLI Explorer. Builds every piece of dynamic markup with DOM APIs — the
// item name is free text typed by the visitor and must never be interpreted as
// HTML. No inline handlers or styles: the page runs under the site's strict CSP.
(() => {
  "use strict";

  const COMMANDS = ["add", "list", "remove", "init"];

  const TYPES = {
    skill: { label: "Skill", structure: "directory", mainFile: "SKILL.md" },
    command: { label: "Command", structure: "directory", mainFile: "COMMAND.md" },
    agent: { label: "Agent", structure: "file", mainFile: "{slug}.md" },
    hook: { label: "Hook", structure: "json-merge", mergeTarget: "settings.json", mergeField: "hooks" },
    mcp: { label: "MCP", structure: "json-merge", mergeTarget: ".mcp.json", mergeField: "mcpServers" },
    plugin: { label: "Plugin", structure: "plugin" },
    settings: { label: "Settings", structure: "json-merge", mergeTarget: "settings.json" },
  };

  const TOOLS = {
    claude: { label: "Claude Code", short: "claude", dir: ".claude", userDir: "~/.claude" },
    copilot: { label: "GitHub Copilot", short: "copilot", dir: ".github", userDir: "~/.config/github-copilot" },
    gemini: { label: "Gemini", short: "gemini", dir: ".gemini", userDir: "~/.gemini" },
    codex: { label: "OpenAI Codex", short: "codex", dir: ".codex", userDir: "~/.codex" },
    opencode: { label: "OpenCode", short: "opencode", dir: ".opencode", userDir: "~/.opencode" },
  };

  const COMPATIBILITY = {
    skill: ["claude", "copilot", "gemini", "codex", "opencode"],
    command: ["claude"],
    agent: ["claude"],
    hook: ["claude"],
    plugin: ["claude"],
    settings: ["claude"],
    mcp: ["claude"],
  };

  // Tools that read .agents/skills/ directly (no symlink needed when using central storage)
  const READS_AGENTS_DIR = ["gemini", "codex", "opencode"];

  const SAMPLE_ITEMS = {
    pdf: { type: "skill", desc: "Generate, read, and manipulate PDF documents", files: ["SKILL.md", "scripts/"] },
    commit: { type: "skill", desc: "Commit changes following project conventions", files: ["SKILL.md"] },
    playground: { type: "skill", desc: "Create interactive HTML playgrounds", files: ["SKILL.md", "templates/"] },
    "pre-commit-lint": { type: "hook", desc: "Run linting before commits", hook: "PreToolUse", matcher: "Bash", script: "pre-commit-lint.sh" },
    context7: { type: "mcp", desc: "Fetch up-to-date documentation", server: { command: "npx", args: ["-y", "@upstash/context7-mcp"] } },
    superpowers: { type: "plugin", desc: "Ships 29 agents, 22 commands, 19 skills", version: "1.0.0", marketplace: "superpowers", pluginName: "superpowers" },
    "code-review": { type: "agent", desc: "Review code for quality and security issues", files: ["code-review.md"] },
    memory: { type: "settings", desc: "Optimized memory and context settings", settings: { preferredNotifyMethod: "terminal", taskAutoArchive: true } },
    "slash-commands": { type: "command", desc: "Custom slash commands for workflows", files: ["COMMAND.md", "scripts/"] },
  };

  const PRESETS = [
    { label: "Simple Skill", command: "add", add: { name: "pdf", type: "skill", agents: ["claude"], scope: "project", method: "copy", yes: false, force: false, dryRun: false } },
    { label: "Multi-Tool", command: "add", add: { name: "pdf", type: "skill", agents: ["claude", "copilot", "gemini"], scope: "project", method: "symlink", yes: false, force: false, dryRun: false } },
    { label: "Hook", command: "add", add: { name: "pre-commit-lint", type: "hook", agents: ["claude"], scope: "project", method: "copy", yes: false, force: false, dryRun: false } },
    { label: "MCP Server", command: "add", add: { name: "context7", type: "mcp", agents: ["claude"], scope: "user", method: "copy", yes: false, force: false, dryRun: false } },
    { label: "Dry Run", command: "add", add: { name: "pdf", type: "skill", agents: ["claude", "copilot"], scope: "project", method: "symlink", yes: false, force: false, dryRun: true } },
  ];

  const state = {
    command: "add",
    add: { name: "pdf", type: "skill", agents: ["claude"], scope: "project", method: "copy", yes: false, force: false, dryRun: false },
    list: { type: "", installed: false, scope: "project" },
    remove: { name: "pdf", agents: ["claude"], scope: "project", yes: false },
  };

  // ── DOM helpers ──

  function el(tag, { className, text, attrs, dataset } = {}, ...children) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    if (attrs) for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    if (dataset) Object.assign(node.dataset, dataset);
    node.append(...children);
    return node;
  }

  const span = (className, text) => el("span", { className, text });
  const blank = () => el("div", { className: "term-blank" });

  function sectionLabel(text, hint) {
    const label = el("div", { className: "section-label", text });
    if (hint) label.append(" ", span("section-hint", hint));
    return label;
  }

  function radioGroup(values, current, action) {
    return el(
      "div",
      { className: "radio-group" },
      ...values.map((value) =>
        el("button", { className: `radio-btn${current === value ? " active" : ""}`, text: value, attrs: { type: "button" }, dataset: { action, value } })
      )
    );
  }

  function toggleRow(label, on, action, key) {
    return el(
      "div",
      { className: "toggle-row" },
      span("toggle-label", label),
      el("button", { className: `toggle${on ? " on" : ""}`, attrs: { type: "button", role: "switch", "aria-checked": String(on), "aria-label": label }, dataset: { action, key } })
    );
  }

  // ── Rendering ──

  function renderCmdTabs() {
    document.getElementById("cmdTabs").replaceChildren(
      ...COMMANDS.map((command) =>
        el("button", { className: `cmd-tab${state.command === command ? " active" : ""}`, text: command, attrs: { type: "button" }, dataset: { action: "select-command", value: command } })
      )
    );
  }

  function renderPresets() {
    document.getElementById("presets").replaceChildren(
      ...PRESETS.map((preset, index) =>
        el("button", { className: "preset-btn", text: preset.label, attrs: { type: "button" }, dataset: { action: "apply-preset", value: String(index) } })
      )
    );
  }

  function renderOptions() {
    const panel = document.getElementById("optionsPanel");
    const renderers = { add: renderAddOptions, list: renderListOptions, remove: renderRemoveOptions, init: renderInitOptions };
    panel.replaceChildren(...renderers[state.command]());
    bindEvents();
  }

  function typeSelect(id, current, includeAll) {
    const select = el("select", { attrs: { id } });
    if (includeAll) select.append(el("option", { text: "All types", attrs: { value: "" } }));
    for (const [key, type] of Object.entries(TYPES)) select.append(el("option", { text: type.label, attrs: { value: key } }));
    select.value = current;
    return select;
  }

  function toolChecks(dataKey, agents, compat) {
    return el(
      "div",
      { className: "check-group" },
      ...Object.entries(TOOLS).map(([key, tool]) => {
        const supported = compat ? compat.includes(key) : true;
        const checkbox = el("input", { attrs: { type: "checkbox" }, dataset: { [dataKey]: key } });
        checkbox.checked = agents.includes(key) && supported;
        checkbox.disabled = !supported;
        const label = el("label", { className: `check-item${supported ? "" : " disabled"}` }, checkbox, span("tool-label", tool.short));
        if (!supported) label.append(span("compat-badge", `${TYPES[state.add.type].label} only`));
        return label;
      })
    );
  }

  function renderAddOptions() {
    const s = state.add;
    const compat = COMPATIBILITY[s.type] || [];
    const showMethod = s.type === "skill" || s.type === "command";
    const nameInput = el("input", { className: "text-input", attrs: { type: "text", id: "addName", placeholder: "e.g. pdf, commit" } });
    nameInput.value = s.name;
    const groups = [
      el("div", { className: "control-group" }, sectionLabel("Item Name"), nameInput),
      el("div", { className: "control-group" }, sectionLabel("Type"), typeSelect("addType", s.type, false)),
      el("div", { className: "control-group" }, sectionLabel("Target Tools", "(-a, --agents)"), toolChecks("tool", s.agents, compat)),
      el("div", { className: "control-group" }, sectionLabel("Scope", "(-s, --scope)"), radioGroup(["project", "user", "local"], s.scope, "set-add-scope")),
    ];
    if (showMethod) {
      groups.push(el("div", { className: "control-group" }, sectionLabel("Method", "(-m, --method)"), radioGroup(["copy", "symlink"], s.method, "set-add-method")));
    }
    groups.push(
      el(
        "div",
        { className: "control-group" },
        sectionLabel("Flags"),
        toggleRow("--yes", s.yes, "toggle-add", "yes"),
        toggleRow("--force", s.force, "toggle-add", "force"),
        toggleRow("--dry-run", s.dryRun, "toggle-add", "dryRun")
      )
    );
    return groups;
  }

  function renderListOptions() {
    const s = state.list;
    const groups = [
      el("div", { className: "control-group" }, sectionLabel("Type Filter", "(-t, --type)"), typeSelect("listType", s.type, true)),
      el("div", { className: "control-group" }, sectionLabel("Mode"), toggleRow("--installed", s.installed, "toggle-list", "installed")),
    ];
    if (s.installed) {
      groups.push(el("div", { className: "control-group" }, sectionLabel("Scope"), radioGroup(["project", "user"], s.scope, "set-list-scope")));
    }
    return groups;
  }

  function renderRemoveOptions() {
    const s = state.remove;
    const nameInput = el("input", { className: "text-input", attrs: { type: "text", id: "removeName", placeholder: "e.g. pdf" } });
    nameInput.value = s.name;
    return [
      el("div", { className: "control-group" }, sectionLabel("Item Name"), nameInput),
      el("div", { className: "control-group" }, sectionLabel("Target Tools", "(-a, --agents)"), toolChecks("rtool", s.agents, null)),
      el("div", { className: "control-group" }, sectionLabel("Scope"), radioGroup(["project", "user"], s.scope, "set-remove-scope")),
      el("div", { className: "control-group" }, sectionLabel("Flags"), toggleRow("--yes", s.yes, "toggle-remove", "yes")),
    ];
  }

  function renderInitOptions() {
    return [
      el(
        "div",
        { className: "init-help" },
        el("p", {}, el("strong", { text: "seedr init" }), " sets up a new project for seedr."),
        el("p", { text: "Creates the base directory structure and configuration files needed to install and manage AI coding assistant content." }),
        el("p", { className: "muted", text: "No options available." })
      ),
    ];
  }

  function bindEvents() {
    const addName = document.getElementById("addName");
    if (addName) {
      addName.addEventListener("input", (event) => {
        state.add.name = event.target.value || "pdf";
        updateAll();
      });
    }

    const addType = document.getElementById("addType");
    if (addType) {
      addType.addEventListener("change", (event) => {
        state.add.type = event.target.value;
        const compat = COMPATIBILITY[state.add.type] || [];
        state.add.agents = state.add.agents.filter((agent) => compat.includes(agent));
        if (state.add.agents.length === 0 && compat.length > 0) state.add.agents = [compat[0]];
        // Auto-set name to a sample of that type
        const sample = Object.entries(SAMPLE_ITEMS).find(([, item]) => item.type === state.add.type);
        if (sample) state.add.name = sample[0];
        renderOptions();
        updateAll();
      });
    }

    document.querySelectorAll("[data-tool]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const checked = [...document.querySelectorAll("[data-tool]:checked")].map((node) => node.dataset.tool);
        state.add.agents = checked.length ? checked : ["claude"];
        updateAll();
      });
    });

    const listType = document.getElementById("listType");
    if (listType) {
      listType.addEventListener("change", (event) => {
        state.list.type = event.target.value;
        updateAll();
      });
    }

    const removeName = document.getElementById("removeName");
    if (removeName) {
      removeName.addEventListener("input", (event) => {
        state.remove.name = event.target.value || "pdf";
        updateAll();
      });
    }

    document.querySelectorAll("[data-rtool]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const checked = [...document.querySelectorAll("[data-rtool]:checked")].map((node) => node.dataset.rtool);
        state.remove.agents = checked.length ? checked : ["claude"];
        updateAll();
      });
    });
  }

  // ── Command string ──

  function buildCommand() {
    const parts = ["npx seedr"];
    if (state.command === "add") {
      const s = state.add;
      parts.push("add", s.name);
      if (s.type) parts.push("--type", s.type);
      if (s.agents.length && !(s.agents.length === 1 && s.agents[0] === "claude")) parts.push("--agents", s.agents.join(","));
      if (s.scope !== "project") parts.push("--scope", s.scope);
      if (s.method !== "copy" && (s.type === "skill" || s.type === "command")) parts.push("--method", s.method);
      if (s.yes) parts.push("--yes");
      if (s.force) parts.push("--force");
      if (s.dryRun) parts.push("--dry-run");
    } else if (state.command === "list") {
      const s = state.list;
      parts.push("list");
      if (s.type) parts.push("--type", s.type);
      if (s.installed) parts.push("--installed");
      if (s.installed && s.scope !== "project") parts.push("--scope", s.scope);
    } else if (state.command === "remove") {
      const s = state.remove;
      parts.push("remove", s.name);
      if (s.agents.length && !(s.agents.length === 1 && s.agents[0] === "claude")) parts.push("--agents", s.agents.join(","));
      if (s.scope !== "project") parts.push("--scope", s.scope);
      if (s.yes) parts.push("--yes");
    } else {
      parts.push("init");
    }
    return parts;
  }

  function renderCommand() {
    const parts = buildCommand();
    const nodes = [];
    parts.forEach((part, index) => {
      if (index > 0) nodes.push(" ");
      if (index === 0) {
        nodes.push(span("dollar", "$"), ` ${part}`);
      } else if (part.startsWith("--")) {
        nodes.push(span("flag", part));
      } else if (parts[index - 1]?.startsWith("--")) {
        nodes.push(span("value", part));
      } else if (index === 2 && (state.command === "add" || state.command === "remove")) {
        nodes.push(span("value", part));
      } else {
        nodes.push(part);
      }
    });
    document.getElementById("cmdText").replaceChildren(...nodes);
  }

  // ── Terminal output ──

  function line(type, label, ...value) {
    const icon = type === "check" ? span("term-check", "✓") : span("term-warn", "⚠");
    return el("div", { className: "term-line" }, icon, " ", span("term-label", label), " ", el("span", { className: "term-value" }, ...value));
  }

  const muted = (text) => el("div", { className: "term-muted", text });
  const done = (text) => el("div", { className: "term-line" }, span("term-check", "✓"), " ", span("term-ok", text));

  function renderAddTerminal(lines) {
    const s = state.add;
    const item = SAMPLE_ITEMS[s.name];
    const typeDef = TYPES[s.type];

    lines.push(line("check", "Resolved:", `${s.name} `, span("type-badge", typeDef?.label || s.type)));
    if (item) lines.push(el("div", { className: "term-desc", text: `"${item.desc}"` }));
    lines.push(blank());
    lines.push(line("check", "Tools:", s.agents.map((agent) => TOOLS[agent].label).join(", ")));
    lines.push(line("check", "Scope:", s.scope));
    if (s.type === "skill" || s.type === "command") lines.push(line("check", "Method:", s.method));

    if (s.dryRun) {
      lines.push(blank());
      lines.push(el("div", { className: "term-line" }, span("term-warn", "⚠"), " ", span("term-value", "Dry run — showing what would happen")));
      return;
    }

    lines.push(blank());
    lines.push(muted(s.yes ? "Confirmation skipped (--yes)" : "? Confirm installation (Y/n)"));
    lines.push(blank());

    const useSymlink = s.method === "symlink" && (s.type === "skill" || s.type === "command");
    const multiTool = s.agents.length > 1;

    if (useSymlink && multiTool) {
      const typeDir = `${s.type}s`;
      lines.push(line("check", "Copied to central:", `.agents/${typeDir}/${s.name}/`));
      for (const tool of s.agents) {
        if (READS_AGENTS_DIR.includes(tool)) lines.push(line("check", `${TOOLS[tool].short}:`, `reads .agents/${typeDir}/ directly (no symlink needed)`));
        else lines.push(line("check", `Symlinked for ${TOOLS[tool].short}:`, `${getToolDir(tool, s.scope)}/${typeDir}/${s.name}/`));
      }
    } else if (typeDef?.structure === "json-merge") {
      const target = getSettingsTarget(s.type, s.scope, s.agents[0]);
      if (s.type === "hook") lines.push(line("check", "Copied hook script:", `${getToolDir("claude", s.scope)}/hooks/${s.name}.sh`));
      lines.push(line("check", "Merged config into:", target));
    } else if (typeDef?.structure === "plugin") {
      const mp = item?.marketplace || "seedr";
      const pn = item?.pluginName || s.name;
      const pv = item?.version || "1.0.0";
      const pid = `${pn}@${mp}`;
      lines.push(line("check", "Fetched to temp:", `~/.claude/plugins/cache/.tmp/${s.name}/`));
      lines.push(line("check", "Read metadata:", ".claude-plugin/plugin.json, marketplace.json"));
      lines.push(line("check", "Plugin ID:", span("term-warn-text", pid)));
      lines.push(line("check", "Marketplace:", `cloned to ~/.claude/plugins/marketplaces/${mp}/`));
      lines.push(line("check", "Cached to:", `~/.claude/plugins/cache/${mp}/${pn}/${pv}/`));
      lines.push(line("check", "Registry:", "~/.claude/plugins/installed_plugins.json"));
      const settingsFile = s.scope === "local" ? ".claude/settings.local.json" : s.scope === "user" ? "~/.claude/settings.json" : ".claude/settings.json";
      lines.push(line("check", "Enabled in:", `${settingsFile} → enabledPlugins["${pid}"] = true`));
    } else {
      for (const tool of s.agents) {
        const typeDir = `${s.type}s`;
        const path = typeDef?.structure === "file" ? `${getToolDir(tool, s.scope)}/${typeDir}/${s.name}.md` : `${getToolDir(tool, s.scope)}/${typeDir}/${s.name}/`;
        lines.push(line("check", `Installed for ${TOOLS[tool].short}:`, path));
      }
    }

    lines.push(blank());
    if (s.force) lines.push(muted("Existing files overwritten (--force)"));
    lines.push(done("Installation complete"));
  }

  function renderListTerminal(lines) {
    const s = state.list;
    if (s.installed) {
      lines.push(el("div", { className: "term-value term-heading", text: `Installed items (${s.scope} scope):` }));
      lines.push(blank());
      lines.push(el("div", { className: "term-group term-group-skill", text: "  claude:" }));
      for (const name of ["pdf", "commit", "playground"]) lines.push(el("div", { className: "term-value", text: `    ${name}` }));
      if (!s.type || s.type === "hook") {
        lines.push(el("div", { className: "term-group term-group-hook", text: "  hooks:" }));
        lines.push(el("div", { className: "term-value", text: "    pre-commit-lint" }));
      }
      return;
    }
    const types = s.type ? { [s.type]: TYPES[s.type] } : TYPES;
    for (const [key, type] of Object.entries(types)) {
      const items = Object.entries(SAMPLE_ITEMS).filter(([, item]) => item.type === key);
      if (items.length === 0) continue;
      lines.push(el("div", { className: "term-group term-group-type", text: `${type.label}s (${items.length})` }));
      for (const [slug, item] of items) {
        lines.push(el("div", { className: "term-value" }, "  ", span("term-slug", slug), " ", span("term-desc-inline", item.desc)));
      }
      lines.push(blank());
    }
  }

  function renderRemoveTerminal(lines) {
    const s = state.remove;
    lines.push(line("check", "Found", `${s.name} installed for: ${s.agents.map((agent) => TOOLS[agent].short).join(", ")}`));
    lines.push(blank());
    lines.push(muted(s.yes ? "Confirmation skipped (--yes)" : "? Confirm removal (Y/n)"));
    lines.push(blank());
    for (const tool of s.agents) lines.push(line("check", `Removed from ${TOOLS[tool].short}:`, `${getToolDir(tool, s.scope)}/skills/${s.name}/`));
    lines.push(blank());
    lines.push(done("Removal complete"));
  }

  function renderInitTerminal(lines) {
    lines.push(muted("Initializing seedr project..."));
    lines.push(blank());
    lines.push(line("check", "Created", ".claude/ directory"));
    lines.push(line("check", "Created", ".claude/settings.json"));
    lines.push(line("check", "Created", ".claude/skills/ directory"));
    lines.push(line("check", "Created", ".claude/commands/ directory"));
    lines.push(blank());
    lines.push(done("Project initialized"));
    lines.push(blank());
    lines.push(muted("Install items with: npx seedr add <name>"));
  }

  function renderTerminal() {
    const lines = [];
    const renderers = { add: renderAddTerminal, list: renderListTerminal, remove: renderRemoveTerminal, init: renderInitTerminal };
    renderers[state.command](lines);
    document.getElementById("termOutput").replaceChildren(...lines);
  }

  // ── File tree ──

  const dir = (name, children) => ({ name, type: "dir", children });
  const created = (name, extra) => ({ name, type: "created", ...extra });
  const modified = (name, annotation) => ({ name, type: "modified", annotation });

  function toolDirName(tool, scope) {
    return scope === "user" ? `${TOOLS[tool].userDir.replace("~/", "")}/` : `${TOOLS[tool].dir}/`;
  }

  function renderFileTree() {
    const container = document.getElementById("fileTree");
    if (state.command === "list") {
      container.replaceChildren(span("tree-dir", "No file system changes — list is read-only"));
      return;
    }
    if (state.command === "init") {
      container.replaceChildren(...treeNodes([dir("my-project/", [created(".claude/", { children: [created("skills/"), created("commands/"), created("settings.json")] })])]));
      return;
    }
    if (state.command === "remove") {
      const s = state.remove;
      const root = dir(s.scope === "user" ? "~/" : "my-project/", []);
      for (const tool of s.agents) {
        root.children.push(dir(toolDirName(tool, s.scope), [dir("skills/", [{ name: `${s.name}/`, type: "deleted", annotation: "removed" }])]));
      }
      container.replaceChildren(...treeNodes([root]));
      return;
    }
    container.replaceChildren(...renderAddFileTree());
  }

  function renderAddFileTree() {
    const s = state.add;
    const typeDef = TYPES[s.type];
    const item = SAMPLE_ITEMS[s.name];
    const useSymlink = s.method === "symlink" && (s.type === "skill" || s.type === "command");
    const multiTool = s.agents.length > 1;
    const typeDir = `${s.type}s`;
    const root = dir(s.scope === "user" ? "~/" : "my-project/", []);

    if (typeDef?.structure === "directory" || typeDef?.structure === "file") {
      if (useSymlink && multiTool) {
        root.children.push(dir(".agents/", [dir(`${typeDir}/`, [created(`${s.name}/`, { annotation: "central copy", children: buildItemFiles(s.type, item) })])]));
        for (const tool of s.agents) {
          if (READS_AGENTS_DIR.includes(tool)) continue; // reads .agents/ directly, no symlink
          root.children.push(dir(toolDirName(tool, s.scope), [dir(`${typeDir}/`, [{ name: `${s.name}/`, type: "symlink", target: `../../.agents/${typeDir}/${s.name}/` }])]));
        }
      } else {
        for (const tool of s.agents) {
          const entry = typeDef.structure === "file" ? created(`${s.name}.md`) : created(`${s.name}/`, { children: buildItemFiles(s.type, item) });
          root.children.push(dir(toolDirName(tool, s.scope), [dir(`${typeDir}/`, [entry])]));
        }
      }
      return treeNodes([root]);
    }

    if (typeDef?.structure === "json-merge") {
      const toolDir = toolDirName("claude", s.scope);
      const children = [];
      if (s.type === "hook") children.push(dir("hooks/", [created(`${s.name}.sh`, { annotation: "hook script" })]));
      const target = s.type === "mcp" ? ".mcp.json" : s.scope === "local" ? "settings.local.json" : "settings.json";
      if (s.type === "mcp" && s.scope !== "user") {
        // .mcp.json is at project root, not inside .claude/
        root.children.push(modified(target, "merged"));
        if (children.length) root.children.push(dir(toolDir, children));
      } else if (s.type === "mcp" && s.scope === "user") {
        // User-scope MCP config goes to ~/.claude.json
        root.children.push(modified(".claude.json", "mcpServers merged"));
      } else {
        children.push(modified(target, "merged"));
        root.children.push(dir(toolDir, children));
      }
      const nodes = treeNodes([root]);
      if (item && (s.type === "hook" || s.type === "mcp" || s.type === "settings")) nodes.push("\n", buildJsonMerge(s.type, s.name, item));
      return nodes;
    }

    if (typeDef?.structure === "plugin") {
      const mp = item?.marketplace || "seedr";
      const pn = item?.pluginName || s.name;
      const pv = item?.version || "1.0.0";
      const pid = `${pn}@${mp}`;
      // Plugin cache, marketplace, and registry are ALWAYS in ~/.claude/ (user home)
      const claudeDir = dir(".claude/", [
        dir("plugins/", [
          dir("cache/", [dir(`${mp}/`, [dir(`${pn}/`, [created(`${pv}/`, { annotation: "cached content", children: [created(".claude-plugin/", { children: [created("plugin.json"), created("marketplace.json")] }), created("skills/"), created("agents/"), created("commands/"), created("hooks/")] })])])]),
          dir("marketplaces/", [created(`${mp}/`, { annotation: "git clone" })]),
          modified("installed_plugins.json", "scope + path"),
          modified("known_marketplaces.json", "marketplace source"),
        ]),
      ]);
      const userHome = dir("~/", [claudeDir]);
      if (s.scope === "user") {
        claudeDir.children.push(modified("settings.json", `enabledPlugins["${pid}"] = true`));
        return [...treeNodes([userHome]), ...buildPluginJsonPreview(pid, s.scope, pv)];
      }
      const settingsFile = s.scope === "local" ? "settings.local.json" : "settings.json";
      const projectRoot = dir("my-project/", [dir(".claude/", [modified(settingsFile, `enabledPlugins["${pid}"] = true`)])]);
      return [...treeNodes([userHome]), "\n", ...treeNodes([projectRoot]), ...buildPluginJsonPreview(pid, s.scope, pv)];
    }

    return treeNodes([root]);
  }

  function buildItemFiles(type, item) {
    const typeDef = TYPES[type];
    if (typeDef.structure === "file") return [];
    if (item?.files) return item.files.map((file) => created(file));
    return [created(typeDef.mainFile || "SKILL.md")];
  }

  const TREE_CLASS = { created: "tree-created", modified: "tree-modified", symlink: "tree-symlink", deleted: "tree-modified" };

  /** Text nodes and spans for the whitespace-pre tree view (same glyphs as the old string builder). */
  function treeNodes(nodes, prefix = "") {
    const out = [];
    nodes.forEach((node, index) => {
      const last = index === nodes.length - 1;
      const connector = prefix === "" ? "" : last ? "└── " : "├── ";
      const childPrefix = prefix === "" ? "" : prefix + (last ? "    " : "│   ");
      out.push(prefix + connector, span(TREE_CLASS[node.type] || "tree-dir", node.name));
      if (node.type === "symlink" && node.target) out.push(" ", span("tree-arrow", "→"), " ", span("tree-symlink", node.target));
      if (node.annotation) out.push(" ", span("tree-annotation", `← ${node.annotation}`));
      out.push("\n");
      if (node.children) out.push(...treeNodes(node.children, childPrefix || "  "));
    });
    return out;
  }

  // ── JSON previews (token lists: [className, text] pairs or plain strings) ──

  const jk = (text) => span("json-key", text);
  const jak = (text) => span("json-added json-key", text);
  const jas = (text) => span("json-added json-str", text);
  const ja = (text) => span("json-added", text);
  const jb = (text) => span("json-bracket", text);

  function jsonBox(...parts) {
    return el("div", { className: "json-preview" }, ...parts);
  }

  function buildJsonMerge(type, name, item) {
    if (type === "hook") {
      const hook = item.hook || "PreToolUse";
      const matcher = item.matcher || "";
      const script = item.script || `${name}.sh`;
      const parts = ["\n", jb("{"), "\n  ", jk('"hooks"'), ": ", jb("{"), "\n    ", jak(`"${hook}"`), ": ", jb("["), "\n      ", jb("{"), "\n        "];
      if (matcher) parts.push(jak('"matcher"'), ": ", jas(`"${matcher}"`), ",");
      parts.push(
        "\n        ", jak('"hooks"'), ": ", jb("[{"),
        "\n          ", jak('"type"'), ": ", jas('"command"'), ",",
        "\n          ", jak('"command"'), ": ", jas(`".claude/hooks/${script}"`),
        "\n        ", jb("}]"), "\n      ", jb("}"), "\n    ", jb("]"), "\n  ", jb("}"), "\n", jb("}")
      );
      return jsonBox(...parts);
    }
    if (type === "mcp" && item.server) {
      const srv = item.server;
      const args = [];
      srv.args.forEach((arg, index) => {
        if (index > 0) args.push(", ");
        args.push(span("json-str", `"${arg}"`));
      });
      return jsonBox(
        "\n", jb("{"), "\n  ", jk('"mcpServers"'), ": ", jb("{"),
        "\n    ", jak(`"${name}"`), ": ", jb("{"),
        "\n      ", jak('"command"'), ": ", jas(`"${srv.command}"`), ",",
        "\n      ", jak('"args"'), ": ", el("span", { className: "json-added" }, "[", ...args, "]"),
        "\n    ", jb("}"), "\n  ", jb("}"), "\n", jb("}")
      );
    }
    if (type === "settings" && item.settings) {
      const parts = ["\n", jb("{")];
      Object.entries(item.settings).forEach(([key, value], index) => {
        parts.push(index === 0 ? "\n    " : ",\n    ", jak(`"${key}"`), ": ", jas(JSON.stringify(value)));
      });
      parts.push("\n", jb("}"));
      return jsonBox(...parts);
    }
    return jsonBox();
  }

  function buildPluginJsonPreview(pid, scope, version) {
    const scopeParts = scope === "user" ? [] : [", ", jak('"projectPath"'), ": ", jas('"/path/to/project"')];
    return [
      el("div", { className: "json-label", text: "installed_plugins.json" }),
      jsonBox(
        jb("{"), "\n  ", jk('"version"'), ": ", ja("2"), ",",
        "\n  ", jk('"plugins"'), ": ", jb("{"),
        "\n    ", jak(`"${pid}"`), ": ", jb("[{"),
        "\n      ", jak('"scope"'), ": ", jas(`"${scope}"`), ...scopeParts, ",",
        "\n      ", jak('"installPath"'), ": ", jas(`"~/.claude/plugins/cache/.../${version}/"`), ",",
        "\n      ", jak('"version"'), ": ", jas(`"${version}"`), ",",
        "\n      ", jak('"installedAt"'), ": ", jas('"2026-02-17T..."'),
        "\n    ", jb("}]"), "\n  ", jb("}"), "\n", jb("}")
      ),
      el("div", { className: "json-label", text: `settings.json (${scope} scope)` }),
      jsonBox(jb("{"), "\n  ", jk('"enabledPlugins"'), ": ", jb("{"), "\n    ", jak(`"${pid}"`), ": ", ja("true"), "\n  ", jb("}"), "\n", jb("}")),
    ];
  }

  // ── Helpers ──

  function getToolDir(tool, scope) {
    return scope === "user" ? TOOLS[tool].userDir : TOOLS[tool].dir;
  }

  function getSettingsTarget(type, scope, tool) {
    if (type === "mcp") return scope === "user" ? "~/.claude.json" : ".mcp.json";
    if (scope === "local") return `${TOOLS[tool].dir}/settings.local.json`;
    if (scope === "user") return `${TOOLS[tool].userDir}/settings.json`;
    return `${TOOLS[tool].dir}/settings.json`;
  }

  // ── Actions (event delegation on data-action) ──

  const actions = {
    "select-command": (value) => {
      state.command = value;
      renderCmdTabs();
      renderOptions();
    },
    "set-add-scope": (value) => {
      state.add.scope = value;
      renderOptions();
    },
    "set-add-method": (value) => {
      state.add.method = value;
      renderOptions();
    },
    "toggle-add": (_value, key) => {
      state.add[key] = !state.add[key];
      renderOptions();
    },
    "set-list-scope": (value) => {
      state.list.scope = value;
      renderOptions();
    },
    "toggle-list": (_value, key) => {
      state.list[key] = !state.list[key];
      renderOptions();
    },
    "set-remove-scope": (value) => {
      state.remove.scope = value;
      renderOptions();
    },
    "toggle-remove": (_value, key) => {
      state.remove[key] = !state.remove[key];
      renderOptions();
    },
    "apply-preset": (value) => {
      const preset = PRESETS[Number(value)];
      if (!preset) return;
      state.command = preset.command;
      if (preset.add) state.add = { ...state.add, ...preset.add };
      renderCmdTabs();
      renderOptions();
    },
  };

  document.querySelector(".controls").addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const handler = actions[target.dataset.action];
    if (!handler) return;
    handler(target.dataset.value, target.dataset.key);
    updateAll();
  });

  function copyCommand() {
    const button = document.getElementById("copyBtn");
    const feedback = (text, cls) => {
      button.textContent = text;
      button.classList.add(cls);
      setTimeout(() => {
        button.textContent = "Copy";
        button.classList.remove(cls);
      }, 1500);
    };
    navigator.clipboard.writeText(buildCommand().join(" ")).then(
      () => feedback("Copied!", "copied"),
      () => feedback("Copy failed", "failed")
    );
  }
  document.getElementById("copyBtn").addEventListener("click", copyCommand);

  function updateAll() {
    renderCommand();
    renderTerminal();
    renderFileTree();
    document.getElementById("dryRunBanner").hidden = !(state.command === "add" && state.add.dryRun);
  }

  // ── Init ──
  renderCmdTabs();
  renderPresets();
  renderOptions();
  updateAll();
})();

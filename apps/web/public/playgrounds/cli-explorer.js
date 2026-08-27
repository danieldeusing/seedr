/* global document, navigator, setTimeout */
// Seedr CLI Explorer. Builds every piece of dynamic markup with DOM APIs — the
// item name is free text typed by the visitor and must never be interpreted as
// HTML. No inline handlers or styles: the page runs under the site's strict CSP.
(() => {
  "use strict";

  const COMMANDS = ["add", "list", "remove", "init"];

  const TYPES = {
    skill: { label: "Skill", structure: "directory", mainFile: "SKILL.md" },
    agent: { label: "Agent", structure: "file", mainFile: "{slug}.md" },
    hook: { label: "Hook", structure: "json-merge", mergeTarget: "settings.json", mergeField: "hooks" },
    mcp: { label: "MCP", structure: "json-merge", mergeTarget: ".mcp.json", mergeField: "mcpServers" },
    plugin: { label: "Plugin", structure: "plugin" },
    settings: { label: "Settings", structure: "json-merge", mergeTarget: "settings.json" },
  };

  const TOOLS = {
    claude: { label: "Claude Code", short: "claude", dir: ".claude", userDir: "~/.claude" },
    copilot: { label: "GitHub Copilot", short: "copilot", dir: ".github", userDir: "~/.github" },
    antigravity: { label: "Google Antigravity", short: "antigravity", dir: ".agents", userDir: "~/.agents" },
    codex: { label: "OpenAI Codex CLI", short: "codex", dir: ".codex", userDir: "~/.codex" },
    opencode: { label: "OpenCode", short: "opencode", dir: ".opencode", userDir: "~/.opencode" },
  };

  const COMPATIBILITY = {
    skill: ["claude", "copilot", "antigravity", "codex", "opencode"],
    agent: ["claude"],
    hook: ["claude"],
    plugin: ["claude"],
    settings: ["claude"],
    mcp: ["claude", "codex", "opencode"],
  };

  // Tools that read .agents/skills/ directly (no symlink needed when using central storage)
  const READS_AGENTS_DIR = ["antigravity", "codex", "opencode"];

  // Where each tool keeps its MCP servers. Copilot and Antigravity have no
  // verified format, so the CLI refuses them rather than guessing.
  const MCP_TARGETS = {
    claude: { file: ".mcp.json", userFile: "~/.claude.json", entry: (name) => `mcpServers.${name}` },
    codex: { file: ".codex/config.toml", userFile: "~/.codex/config.toml", entry: (name) => `[mcp_servers.${name}]` },
    opencode: { file: "opencode.json", userFile: "~/.config/opencode/opencode.json", entry: (name) => `mcp.${name}` },
  };

  // Real slugs, so a command copied out of here resolves. The registry holds no
  // agent and no settings item, so those two are the only invented names —
  // chosen not to collide with a real slug of another type, which is what
  // `code-review` and `context7` were doing here: both are plugins.
  const SAMPLE_ITEMS = {
    pdf: { type: "skill", desc: "Generate, read, and manipulate PDF documents", files: ["SKILL.md", "scripts/"] },
    "lint-doctor": { type: "skill", desc: "Diagnose and fix linting issues across multiple languages", files: ["SKILL.md", "references/"], label: "project-x" },
    "code-smell-doctor": { type: "skill", desc: "Detect and refactor code smells using Martin Fowler's catalog", files: ["SKILL.md", "references/"] },
    "project-security-guard": { type: "hook", desc: "Block dangerous Bash commands and protect sensitive files", hook: "PreToolUse", matcher: "Bash", script: "project-security-guard.sh", label: "project-x" },
    playwright: { type: "mcp", desc: "Drive a real browser through the accessibility tree", server: { command: "npx", args: ["-y", "@playwright/mcp@latest"] } },
    superpowers: { type: "plugin", desc: "Brainstorming, subagent-driven development, systematic debugging and red/green TDD", version: "6.3.0", marketplace: "claude-plugins-official", pluginName: "superpowers" },
    "release-notes": { type: "agent", desc: "Draft release notes from the commits on a branch", files: ["release-notes.md"] },
    memory: { type: "settings", desc: "Optimized memory and context settings", settings: { preferredNotifyMethod: "terminal", taskAutoArchive: true } },
  };

  // What `list --installed` finds on disk, per type and per tool. Settings items
  // are never in here: they merge into settings.json and leave no marker behind.
  const INSTALLED_SAMPLE = {
    skill: { claude: ["lint-doctor", "pdf"], antigravity: ["pdf"] },
    hook: { claude: ["project-security-guard"] },
  };

  const PRESETS = [
    { label: "Simple Skill", command: "add", add: { name: "pdf", type: "skill", agents: ["claude"], scope: "project", method: "copy", yes: false, force: false, dryRun: false } },
    { label: "Multi-Tool", command: "add", add: { name: "pdf", type: "skill", agents: ["claude", "copilot", "antigravity"], scope: "project", method: "symlink", yes: false, force: false, dryRun: false } },
    { label: "Hook", command: "add", add: { name: "project-security-guard", type: "hook", agents: ["claude"], scope: "project", method: "copy", yes: false, force: false, dryRun: false } },
    { label: "MCP Server", command: "add", add: { name: "playwright", type: "mcp", agents: ["claude"], scope: "user", method: "copy", yes: false, force: false, dryRun: false } },
    { label: "Dry Run", command: "add", add: { name: "pdf", type: "skill", agents: ["claude", "copilot"], scope: "project", method: "symlink", yes: false, force: false, dryRun: true } },
  ];

  const state = {
    command: "add",
    add: { name: "pdf", type: "skill", agents: ["claude"], scope: "project", method: "copy", yes: false, force: false, dryRun: false },
    list: { type: "", label: "", installed: false, agents: Object.keys(TOOLS), scope: "project" },
    remove: { name: "pdf", type: "skill", agents: ["claude"], scope: "project", yes: false },
    init: { agents: ["claude"], yes: false },
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

  /** Agent checkboxes for whichever command's panel is on screen; only one is rendered at a time. */
  function toolChecks(agents, type) {
    const compat = type ? COMPATIBILITY[type] : null;
    return el(
      "div",
      { className: "check-group" },
      ...Object.entries(TOOLS).map(([key, tool]) => {
        const supported = compat ? compat.includes(key) : true;
        const checkbox = el("input", { attrs: { type: "checkbox" }, dataset: { agent: key } });
        checkbox.checked = agents.includes(key) && supported;
        checkbox.disabled = !supported;
        const label = el("label", { className: `check-item${supported ? "" : " disabled"}` }, checkbox, span("tool-label", tool.short));
        if (!supported) label.append(span("compat-badge", `no ${TYPES[type].label.toLowerCase()} support`));
        return label;
      })
    );
  }

  function renderAddOptions() {
    const s = state.add;
    const showMethod = s.type === "skill";
    const nameInput = el("input", { className: "text-input", attrs: { type: "text", id: "addName", placeholder: "e.g. pdf, commit" } });
    nameInput.value = s.name;
    const groups = [
      el("div", { className: "control-group" }, sectionLabel("Item Name"), nameInput),
      el("div", { className: "control-group" }, sectionLabel("Type", "(-t, --type)"), typeSelect("addType", s.type, false)),
      el("div", { className: "control-group" }, sectionLabel("Target Tools", "(-a, --agents)"), toolChecks(s.agents, s.type)),
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
    // --label filters the registry listing; --agents and --scope only narrow the installed check.
    if (s.installed) {
      groups.push(
        el("div", { className: "control-group" }, sectionLabel("Target Tools", "(-a, --agents)"), toolChecks(s.agents, null)),
        el("div", { className: "control-group" }, sectionLabel("Scope", "(--scope)"), radioGroup(["project", "user", "local"], s.scope, "set-list-scope"))
      );
    } else {
      const labelInput = el("input", { className: "text-input", attrs: { type: "text", id: "listLabel", placeholder: "e.g. project-x" } });
      labelInput.value = s.label;
      groups.push(el("div", { className: "control-group" }, sectionLabel("Label Filter", "(--label)"), labelInput));
    }
    return groups;
  }

  function renderRemoveOptions() {
    const s = state.remove;
    const nameInput = el("input", { className: "text-input", attrs: { type: "text", id: "removeName", placeholder: "e.g. pdf" } });
    nameInput.value = s.name;
    return [
      el("div", { className: "control-group" }, sectionLabel("Item Name"), nameInput),
      el("div", { className: "control-group" }, sectionLabel("Type", "(-t, --type)"), typeSelect("removeType", s.type, false)),
      el("div", { className: "control-group" }, sectionLabel("Target Tools", "(-a, --agents)"), toolChecks(s.agents, s.type)),
      el("div", { className: "control-group" }, sectionLabel("Scope", "(--scope)"), radioGroup(["project", "user", "local"], s.scope, "set-remove-scope")),
      el("div", { className: "control-group" }, sectionLabel("Flags"), toggleRow("--yes", s.yes, "toggle-remove", "yes")),
    ];
  }

  function renderInitOptions() {
    const s = state.init;
    return [
      el(
        "div",
        { className: "init-help" },
        el("p", {}, el("strong", { text: "seedr init" }), " creates each tool's skills directory with a README."),
        el("p", { text: "It writes nothing else — no settings.json, no registry entry. Install items afterwards with seedr add." })
      ),
      el("div", { className: "control-group" }, sectionLabel("Target Tools", "(-a, --agents)"), toolChecks(s.agents, null)),
      el("div", { className: "control-group" }, sectionLabel("Flags"), toggleRow("--yes", s.yes, "toggle-init", "yes")),
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

    document.querySelectorAll("[data-agent]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const checked = [...document.querySelectorAll("[data-agent]:checked")].map((node) => node.dataset.agent);
        state[state.command].agents = checked.length ? checked : ["claude"];
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

    const listLabel = document.getElementById("listLabel");
    if (listLabel) {
      listLabel.addEventListener("input", (event) => {
        state.list.label = event.target.value;
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

    const removeType = document.getElementById("removeType");
    if (removeType) {
      removeType.addEventListener("change", (event) => {
        state.remove.type = event.target.value;
        const compat = COMPATIBILITY[state.remove.type];
        state.remove.agents = state.remove.agents.filter((agent) => compat.includes(agent));
        if (state.remove.agents.length === 0) state.remove.agents = [compat[0]];
        renderOptions();
        updateAll();
      });
    }
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
      if (s.method !== "copy" && s.type === "skill") parts.push("--method", s.method);
      if (s.yes) parts.push("--yes");
      if (s.force) parts.push("--force");
      if (s.dryRun) parts.push("--dry-run");
    } else if (state.command === "list") {
      const s = state.list;
      parts.push("list");
      if (s.type) parts.push("--type", s.type);
      if (s.installed) {
        parts.push("--installed");
        if (s.agents.length < Object.keys(TOOLS).length) parts.push("--agents", s.agents.join(","));
        if (s.scope !== "project") parts.push("--scope", s.scope);
      } else if (s.label) {
        parts.push("--label", s.label);
      }
    } else if (state.command === "remove") {
      const s = state.remove;
      // --type is mandatory: remove refuses to guess which type a slug belongs to.
      parts.push("remove", s.name, "--type", s.type);
      if (s.agents.length && !(s.agents.length === 1 && s.agents[0] === "claude")) parts.push("--agents", s.agents.join(","));
      if (s.scope !== "project") parts.push("--scope", s.scope);
      if (s.yes) parts.push("--yes");
    } else {
      const s = state.init;
      parts.push("init");
      if (!(s.agents.length === 1 && s.agents[0] === "claude")) parts.push("--agents", s.agents.join(","));
      if (s.yes) parts.push("--yes");
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
    if (s.type === "skill") lines.push(line("check", "Method:", s.method));

    if (s.dryRun) {
      lines.push(blank());
      lines.push(el("div", { className: "term-line" }, span("term-warn", "⚠"), " ", span("term-value", "Dry run — showing what would happen")));
      return;
    }

    lines.push(blank());
    lines.push(muted(s.yes ? "Confirmation skipped (--yes)" : "? Confirm installation (Y/n)"));
    lines.push(blank());

    const useSymlink = s.method === "symlink" && s.type === "skill";

    if (useSymlink) {
      const typeDir = `${s.type}s`;
      const central = `${s.scope === "user" ? "~/" : ""}.agents/${typeDir}`;
      lines.push(line("check", "Copied to central:", `${central}/${s.name}/`));
      for (const tool of s.agents) {
        if (READS_AGENTS_DIR.includes(tool)) lines.push(line("check", `${TOOLS[tool].short}:`, `reads ${central}/ directly (no symlink needed)`));
        else lines.push(line("check", `Symlinked for ${TOOLS[tool].short}:`, `${getToolDir(tool, s.scope)}/${typeDir}/${s.name}/`));
      }
    } else if (s.type === "mcp") {
      for (const tool of s.agents) {
        const target = MCP_TARGETS[tool];
        lines.push(line("check", `Merged for ${TOOLS[tool].short}:`, `${s.scope === "user" ? target.userFile : target.file} → ${target.entry(s.name)}`));
      }
    } else if (typeDef?.structure === "json-merge") {
      if (s.type === "hook") lines.push(line("check", "Copied hook script:", `${getToolDir("claude", s.scope)}/hooks/${s.name}.sh`));
      lines.push(line("check", "Merged config into:", getSettingsTarget(s.scope)));
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
      lines.push(line("check", "Enabled in:", `${getSettingsTarget(s.scope)} → enabledPlugins["${pid}"] = true`));
    } else {
      for (const tool of s.agents) {
        const typeDir = `${s.type}s`;
        const path = typeDef?.structure === "file" ? `${getToolDir(tool, s.scope)}/${typeDir}/${s.name}.md` : `${getToolDir(tool, s.scope)}/${typeDir}/${s.name}/`;
        lines.push(line("check", `Installed for ${TOOLS[tool].short}:`, path));
      }
    }

    lines.push(blank());
    if (s.force) lines.push(muted("Existing files overwritten (--force)"));
    else if (s.yes) lines.push(muted("Existing files kept (--yes without --force refuses to overwrite)"));
    lines.push(done("Installation complete"));
  }

  function renderListTerminal(lines) {
    const s = state.list;
    if (s.installed) {
      lines.push(el("div", { className: "term-value term-heading", text: `Installed items (${s.scope} scope):` }));
      lines.push(blank());
      let total = 0;
      // Grouped by type, then by agent — empty groups are omitted.
      for (const [type, byAgent] of Object.entries(INSTALLED_SAMPLE)) {
        if (s.type && s.type !== type) continue;
        const agents = s.agents.filter((agent) => byAgent[agent]);
        if (agents.length === 0) continue;
        lines.push(el("div", { className: "term-group term-group-type", text: `${type.toUpperCase()}S` }));
        for (const agent of agents) {
          lines.push(el("div", { className: "term-value term-pre", text: `  ${TOOLS[agent].label}` }));
          for (const slug of byAgent[agent]) lines.push(el("div", { className: "term-value term-pre", text: `    ${slug}` }));
          total += byAgent[agent].length;
        }
        lines.push(blank());
      }
      if (!s.type || s.type === "settings") lines.push(muted("Note: settings items cannot be discovered (they are merged into settings.json)"));
      lines.push(el("div", { className: "term-value", text: total === 0 ? "No items installed" : `Total: ${total} installed` }));
      return;
    }

    const all = Object.entries(SAMPLE_ITEMS).filter(([, item]) => !s.type || item.type === s.type);
    const items = s.label ? all.filter(([, item]) => item.label === s.label) : all;
    // A label no item carries is almost always a typo, so the CLI names the ones in use and exits 1.
    if (items.length === 0 && s.label) {
      const known = [...new Set(all.map(([, item]) => item.label).filter(Boolean))].sort();
      lines.push(el("div", { className: "term-line" }, span("term-warn", "⚠"), " ", span("term-value", `No item carries the label "${s.label}".`)));
      if (known.length > 0) lines.push(muted(`Labels in use: ${known.join(", ")}`));
      return;
    }

    for (const key of Object.keys(TYPES)) {
      const typeItems = items.filter(([, item]) => item.type === key);
      if (typeItems.length === 0) continue;
      lines.push(el("div", { className: "term-group term-group-type", text: `${key.toUpperCase()}S` }));
      for (const [slug, item] of typeItems) {
        lines.push(el("div", { className: "term-value term-pre" }, "  ", span("term-slug", slug), " ", span("term-desc-inline", item.desc)));
      }
      lines.push(blank());
    }
    lines.push(el("div", { className: "term-value", text: `Total: ${items.length} items. Use 'npx @danieldeusing/seedr add <name>' to install.` }));
  }

  /** The paths and entries `remove` clears for one tool, mirroring each handler's uninstall. */
  function removalTargets(type, tool, scope, name) {
    const toolDir = getToolDir(tool, scope);
    const settings = getSettingsTarget(scope);
    if (type === "agent") return [`${toolDir}/agents/${name}.md`];
    if (type === "hook") return [`${getToolDir("claude", scope)}/hooks/${name}.sh`, `${settings} → hooks entries dropped`];
    if (type === "mcp") {
      const target = MCP_TARGETS[tool];
      return [`${scope === "user" ? target.userFile : target.file} → ${target.entry(name)} deleted`];
    }
    if (type === "settings") return [`${settings} → merged keys unmerged`];
    if (type === "plugin") return ["~/.claude/plugins/installed_plugins.json", `${settings} → enabledPlugins entry dropped`];
    return [`${toolDir}/skills/${name}/`];
  }

  function renderRemoveTerminal(lines) {
    const s = state.remove;
    lines.push(line("check", "Found", `${s.name} (${TYPES[s.type].label}) installed for: ${s.agents.map((agent) => TOOLS[agent].short).join(", ")}`));
    lines.push(blank());
    lines.push(muted(s.yes ? "Confirmation skipped (--yes)" : "? Proceed with removal? (Y/n)"));
    lines.push(blank());
    for (const tool of s.agents) {
      for (const target of removalTargets(s.type, tool, s.scope, s.name)) {
        lines.push(line("check", `Removed from ${TOOLS[tool].short}:`, target));
      }
    }
    lines.push(blank());
    lines.push(done(`Successfully removed from ${s.agents.length} agent(s)`));
  }

  function renderInitTerminal(lines) {
    const s = state.init;
    lines.push(el("div", { className: "term-value term-heading", text: "Will initialize configuration for:" }));
    for (const tool of s.agents) lines.push(el("div", { className: "term-value term-pre", text: `  - ${TOOLS[tool].label} → ${TOOLS[tool].dir}/skills` }));
    lines.push(blank());
    lines.push(muted(s.yes ? "Confirmation skipped (--yes)" : "? Proceed? (Y/n)"));
    lines.push(blank());
    for (const tool of s.agents) lines.push(line("check", `Initialized ${TOOLS[tool].short}:`, `${TOOLS[tool].dir}/skills/README.md`));
    lines.push(blank());
    lines.push(muted("Done! Use 'npx @danieldeusing/seedr add <skill>' to install skills."));
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

  const settingsFileName = (scope) => (scope === "local" ? "settings.local.json" : "settings.json");

  /** The tool's MCP config file as a tree node, relative to the scope root. */
  function mcpConfigNode(tool, scope, annotation) {
    const path = scope === "user" ? MCP_TARGETS[tool].userFile.replace("~/", "") : MCP_TARGETS[tool].file;
    const segments = path.split("/");
    return segments
      .slice(0, -1)
      .reduceRight((node, segment) => dir(`${segment}/`, [node]), modified(segments[segments.length - 1], annotation));
  }

  function renderFileTree() {
    const container = document.getElementById("fileTree");
    if (state.command === "list") {
      container.replaceChildren(span("tree-dir", "No file system changes — list is read-only"));
      return;
    }
    if (state.command === "init") {
      const root = dir("my-project/", []);
      for (const tool of state.init.agents) {
        root.children.push(created(toolDirName(tool, "project"), { children: [created("skills/", { children: [created("README.md")] })] }));
      }
      container.replaceChildren(...treeNodes([root]));
      return;
    }
    if (state.command === "remove") {
      container.replaceChildren(...renderRemoveFileTree());
      return;
    }
    container.replaceChildren(...renderAddFileTree());
  }

  function renderRemoveFileTree() {
    const s = state.remove;
    const typeDef = TYPES[s.type];
    const deleted = (name) => ({ name, type: "deleted", annotation: "removed" });
    const root = dir(s.scope === "user" ? "~/" : "my-project/", []);

    if (typeDef.structure === "directory" || typeDef.structure === "file") {
      const typeDir = `${s.type}s`;
      for (const tool of s.agents) {
        const entry = typeDef.structure === "file" ? deleted(`${s.name}.md`) : deleted(`${s.name}/`);
        root.children.push(dir(toolDirName(tool, s.scope), [dir(`${typeDir}/`, [entry])]));
      }
      return treeNodes([root]);
    }

    if (s.type === "mcp") {
      for (const tool of s.agents) root.children.push(mcpConfigNode(tool, s.scope, `${MCP_TARGETS[tool].entry(s.name)} deleted`));
      return treeNodes([root]);
    }

    if (s.type === "plugin") {
      const userHome = dir("~/", [dir(".claude/", [dir("plugins/", [modified("installed_plugins.json", "entry dropped")])])]);
      const projectRoot = dir("my-project/", [dir(".claude/", [modified(settingsFileName(s.scope), "enabledPlugins entry dropped")])]);
      return [...treeNodes([userHome]), "\n", ...treeNodes([projectRoot])];
    }

    const children = [];
    if (s.type === "hook") children.push(dir("hooks/", [deleted(`${s.name}.sh`)]));
    children.push(modified(settingsFileName(s.scope), s.type === "hook" ? "hooks entries dropped" : "merged keys unmerged"));
    root.children.push(dir(toolDirName("claude", s.scope), children));
    return treeNodes([root]);
  }

  function renderAddFileTree() {
    const s = state.add;
    const typeDef = TYPES[s.type];
    const item = SAMPLE_ITEMS[s.name];
    const useSymlink = s.method === "symlink" && s.type === "skill";
    const typeDir = `${s.type}s`;
    const root = dir(s.scope === "user" ? "~/" : "my-project/", []);

    if (typeDef?.structure === "directory" || typeDef?.structure === "file") {
      if (useSymlink) {
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

    if (s.type === "mcp") {
      for (const tool of s.agents) root.children.push(mcpConfigNode(tool, s.scope, `${MCP_TARGETS[tool].entry(s.name)} merged`));
      const nodes = treeNodes([root]);
      // The registry stores MCP servers in Claude Code's vocabulary; Codex and
      // OpenCode get a translation into their own schema instead.
      if (item && s.agents.includes("claude")) {
        nodes.push(el("div", { className: "json-label", text: MCP_TARGETS.claude[s.scope === "user" ? "userFile" : "file"] }), buildJsonMerge(s.type, s.name, item));
      }
      return nodes;
    }

    if (typeDef?.structure === "json-merge") {
      const children = [];
      if (s.type === "hook") children.push(dir("hooks/", [created(`${s.name}.sh`, { annotation: "hook script" })]));
      children.push(modified(settingsFileName(s.scope), "merged"));
      root.children.push(dir(toolDirName("claude", s.scope), children));
      const nodes = treeNodes([root]);
      if (item) nodes.push("\n", buildJsonMerge(s.type, s.name, item));
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
      const projectRoot = dir("my-project/", [dir(".claude/", [modified(settingsFileName(s.scope), `enabledPlugins["${pid}"] = true`)])]);
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

  /** Claude Code's settings file for a scope — hooks, settings items and plugin enablement all land here. */
  function getSettingsTarget(scope) {
    if (scope === "local") return `${TOOLS.claude.dir}/settings.local.json`;
    if (scope === "user") return `${TOOLS.claude.userDir}/settings.json`;
    return `${TOOLS.claude.dir}/settings.json`;
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
    "toggle-init": (_value, key) => {
      state.init[key] = !state.init[key];
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

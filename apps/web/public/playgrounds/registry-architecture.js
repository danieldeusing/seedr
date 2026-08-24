/* global document, navigator, setTimeout, CSSStyleSheet */
// Registry Architecture playground. Runs under the strict Content-Security-Policy:
// every piece of markup is built with DOM APIs, dynamic colours are applied through
// generated classes in a constructed stylesheet (no style attributes), and generated
// controls are wired with data-action attributes and one delegated click listener.
(() => {
  "use strict";

  const TYPES_DATA = {
    skill:    { label: "Skill",    color: "#f472b6", count: 26, file: "skills/manifest.json" },
    plugin:   { label: "Plugin",   color: "#818cf8", count: 52, file: "plugins/manifest.json" },
    hook:     { label: "Hook",     color: "#c084fc", count: 2,  file: "hooks/manifest.json" },
    agent:    { label: "Agent",    color: "#60a5fa", count: 0,  file: "agents/manifest.json" },
    command:  { label: "Command",  color: "#fbbf24", count: 0,  file: "commands/manifest.json" },
    mcp:      { label: "MCP",      color: "#14b8a6", count: 0,  file: "mcp/manifest.json" },
    settings: { label: "Settings", color: "#fb923c", count: 0,  file: "settings/manifest.json" },
  };

  const SOURCES = ["all", "official", "toolr", "community"];
  const VIEWS = ["hierarchy", "data-flow", "consumers"];

  const PRESETS = [
    { label: "Full Overview",   view: "hierarchy", type: "",       source: "all",       detail: false },
    { label: "Skill Deep Dive", view: "hierarchy", type: "skill",  source: "all",       detail: true },
    { label: "Data Pipeline",   view: "data-flow", type: "skill",  source: "all",       detail: true },
    { label: "CLI vs Web",      view: "consumers", type: "",       source: "all",       detail: true },
    { label: "Community Items", view: "hierarchy", type: "plugin", source: "community", detail: false },
  ];

  const state = { view: "hierarchy", type: "", source: "all", detail: false };

  // ── DOM helpers ──

  // el(tag, { className, text, dataset }, ...children) — children may be nodes or strings
  // (strings become text nodes).
  function el(tag, options = {}, ...children) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = options.text;
    if (options.dataset) Object.assign(node.dataset, options.dataset);
    node.append(...children);
    return node;
  }

  // cx("node", isHighlighted && "highlighted") → "node highlighted"; falsy entries are dropped.
  const cx = (...names) => names.filter(Boolean).join(" ");

  // Colours are data (TYPES_DATA, the flow steps), but a style attribute is not allowed on
  // any element. Each distinct colour value therefore gets one rule in a constructed
  // stylesheet — `.color-0 { --item-color: #f472b6; --item-tint: #f472b618; }` — and an
  // element picks its colour by carrying that class; registry-architecture.css reads
  // --item-color / --item-tint. The 18-alpha tint exists only for literal hex colours (the
  // chip and badge backgrounds); token colours such as var(--accent) never need one.
  const colorRules = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, colorRules];
  const colorClasses = new Map();
  function colorClass(color) {
    let name = colorClasses.get(color);
    if (!name) {
      name = `color-${colorClasses.size}`;
      const tint = color.startsWith("#") ? ` --item-tint: ${color}18;` : "";
      colorRules.insertRule(`.${name} { --item-color: ${color};${tint} }`);
      colorClasses.set(color, name);
    }
    return name;
  }

  // Syntax-coloured tokens for the JSON and code snippets (classes .jk/.js/.jn/.jb) and the
  // white-space:pre blocks that hold them — every newline and space in those text nodes is
  // part of the layout.
  const jsonKey = (text) => el("span", { className: "jk", text });
  const jsonString = (text) => el("span", { className: "js", text });
  const jsonNumber = (text) => el("span", { className: "jn", text });
  const jsonBracket = (text) => el("span", { className: "jb", text });
  const nodeJson = (...tokens) => el("div", { className: "node-json" }, ...tokens);
  const consumerJson = (...tokens) => el("div", { className: "consumer-json" }, ...tokens);

  const nodeTitle = (text) => el("div", { className: "node-title", text });
  const nodeSub = (text) => el("div", { className: "node-sub", text });

  // ── Controls ──

  function renderControls() {
    const labels = { hierarchy: "Hierarchy", "data-flow": "Data Flow", consumers: "Consumers" };
    document.getElementById("viewTabs").replaceChildren(
      ...VIEWS.map((v) =>
        el("div", { className: cx("view-tab", state.view === v && "active"), text: labels[v], dataset: { action: "set-view", value: v } })
      )
    );

    const allChip = el("div", {
      className: cx("type-chip", !state.type && "active", colorClass("var(--subtext)")),
      text: "All",
      dataset: { action: "set-type", value: "" },
    });
    const typeChips = Object.entries(TYPES_DATA).map(([k, v]) =>
      el("div", {
        className: cx("type-chip", state.type === k && "active", colorClass(v.color)),
        text: v.label,
        dataset: { action: "set-type", value: k },
      })
    );
    document.getElementById("typeChips").replaceChildren(allChip, ...typeChips);

    document.getElementById("sourceChips").replaceChildren(
      ...SOURCES.map((s) =>
        el("div", { className: cx("source-chip", state.source === s && "active"), text: s, dataset: { action: "set-source", value: s } })
      )
    );

    document.getElementById("detailToggle").classList.toggle("on", state.detail);

    document.getElementById("presets").replaceChildren(
      ...PRESETS.map((p, i) =>
        el("button", { className: "preset-btn", text: p.label, dataset: { action: "apply-preset", value: String(i) } })
      )
    );
  }

  // ── Views ──

  function renderCanvas() {
    const canvas = document.getElementById("canvas");
    if (state.view === "hierarchy") canvas.replaceChildren(renderHierarchy());
    else if (state.view === "data-flow") canvas.replaceChildren(renderDataFlow());
    else canvas.replaceChildren(...renderConsumers());
  }

  function rootJson(typesArr, hl) {
    const block = nodeJson(
      jsonBracket("{"), "\n  ", jsonKey('"version"'), ": ", jsonString('"2.0.0"'), ",\n  ",
      jsonKey('"types"'), ": ", jsonBracket("{"), "\n"
    );
    typesArr.forEach(([k, v], i) => {
      const entry = el(
        "span",
        { className: cx(hl && k !== hl && "json-faded") },
        jsonKey(`"${k}"`), ": ", jsonBracket("{"), " ", jsonKey('"file"'), ": ", jsonString(`"${v.file}"`), ", ",
        jsonKey('"count"'), ": ", jsonNumber(String(v.count)), " ", jsonBracket("}")
      );
      block.append(i ? ",\n    " : "    ", entry);
    });
    block.append("\n  ", jsonBracket("}"), "\n", jsonBracket("}"));
    return block;
  }

  function typeManifestJson(k, v) {
    return nodeJson(
      jsonBracket("{"), "\n  ", jsonKey('"type"'), ": ", jsonString(`"${k}"`), ",\n  ",
      jsonKey('"items"'), ": ", jsonBracket("["), "\n    ",
      jsonBracket("{"), " ", jsonKey('"slug"'), ": ", jsonString('"..."'), ", ", jsonKey('"name"'), ": ", jsonString('"..."'), ", ... ", jsonBracket("}"), "\n    ",
      jsonBracket("..."), " ", jsonNumber(`${v.count} items`), "\n  ",
      jsonBracket("]"), "\n", jsonBracket("}")
    );
  }

  function itemJson(k, v, src) {
    return nodeJson(
      jsonBracket("{"), "\n  ",
      jsonKey('"slug"'), ": ", jsonString(`"example-${k}"`), ",\n  ",
      jsonKey('"name"'), ": ", jsonString(`"Example ${v.label}"`), ",\n  ",
      jsonKey('"type"'), ": ", jsonString(`"${k}"`), ",\n  ",
      jsonKey('"description"'), ": ", jsonString('"..."'), ",\n  ",
      jsonKey('"sourceType"'), ": ", jsonString(`"${src}"`), ",\n  ",
      jsonKey('"compatibility"'), ": ", jsonBracket("[...]"), ",\n  ",
      jsonKey('"contents"'), ": ", jsonBracket('{ "files": [...] }'), "\n",
      jsonBracket("}")
    );
  }

  function renderHierarchy() {
    const hl = state.type;
    const typesArr = Object.entries(TYPES_DATA);

    // Level 1: Root manifest
    const rootNode = el(
      "div",
      { className: cx("node", "node-root", !hl && "highlighted") },
      nodeTitle("registry/manifest.json"),
      nodeSub("Points to each type manifest with item counts")
    );
    if (state.detail) rootNode.append(rootJson(typesArr, hl));

    // Level 2: Type manifests
    const typeNodes = typesArr.map(([k, v]) => {
      const active = !hl || k === hl;
      const cls = active ? (k === hl ? "highlighted" : "") : "dimmed";
      const node = el(
        "div",
        { className: cx("node", cls, colorClass(v.color)), dataset: { action: "set-type", value: k === hl ? "" : k } },
        nodeTitle(v.file),
        nodeSub(`${v.count} ${v.label.toLowerCase()}${v.count !== 1 ? "s" : ""}`)
      );
      if (state.detail && active) node.append(typeManifestJson(k, v));
      return node;
    });

    // Level 3: Sample items
    const sampleTypes = hl ? [[hl, TYPES_DATA[hl]]] : [["skill", TYPES_DATA.skill], ["plugin", TYPES_DATA.plugin]];
    const sampleItems = sampleTypes.map(([k, v]) => {
      const src = state.source !== "all" ? state.source : "official";
      const node = el(
        "div",
        { className: cx("node", k === hl && "highlighted", colorClass(v.color)), dataset: { action: "set-type", value: k === hl ? "" : k } },
        nodeTitle(`${k}s/example-${k}/item.json`),
        nodeSub(`Source of truth for one ${v.label.toLowerCase()}`),
        el("div", { className: "node-badge", text: src })
      );
      if (state.detail) node.append(itemJson(k, v, src));
      return node;
    });

    const level = (label, ...nodes) =>
      el("div", { className: "level" }, el("div", { className: "level-label", text: label }), el("div", { className: "level-row" }, ...nodes));

    return el(
      "div",
      { className: "diagram" },
      level("Level 1 — Root Index", rootNode),
      el("div", { className: "flow-arrow" }, "\u2193 ", el("span", { className: "flow-label", text: "references" })),
      level("Level 2 — Type Manifests (one per content type)", ...typeNodes),
      el("div", { className: "flow-arrow" }, "\u2191 ", el("span", { className: "flow-label", text: "compiled from" })),
      level("Level 3 — Individual Items (source of truth)", ...sampleItems)
    );
  }

  function flowJson(step, t, td) {
    if (step.path.includes("item.json")) {
      return consumerJson(
        jsonBracket("{"), " ", jsonKey('"slug"'), ": ", jsonString('"pdf"'), ", ", jsonKey('"type"'), ": ", jsonString(`"${t}"`), ", ",
        jsonKey('"description"'), ": ", jsonString('"..."'), ", ... ", jsonBracket("}")
      );
    }
    if (step.path.includes(`${t}s/manifest`)) {
      return consumerJson(
        jsonBracket("{"), " ", jsonKey('"type"'), ": ", jsonString(`"${t}"`), ", ", jsonKey('"items"'), ": ", jsonBracket("[{...}, {...}, ...]"), " ",
        jsonNumber(`// ${td.count} items`), " ", jsonBracket("}")
      );
    }
    if (step.path.includes("manifest.json") && !step.path.includes(t)) {
      return consumerJson(
        jsonBracket("{"), " ", jsonKey('"version"'), ": ", jsonString('"2.0.0"'), ", ", jsonKey('"types"'), ": ", jsonBracket("{"), " ",
        jsonKey(`"${t}"`), ": ", jsonBracket("{"), " ", jsonKey('"count"'), ": ", jsonNumber(String(td.count)), " ", jsonBracket("} }"), " ", jsonBracket("}")
      );
    }
    return null;
  }

  function flowNode(step, t, td) {
    const node = el(
      "div",
      { className: cx("flow-node", step.isAction && "highlighted", colorClass(step.color)) },
      el("div", { className: "flow-node-title", text: step.title }),
      el("div", { className: "flow-node-path", text: step.path }),
      el("div", { className: "flow-node-desc", text: step.desc })
    );
    if (state.detail) {
      const json = flowJson(step, t, td);
      if (json) node.append(json);
    }
    return node;
  }

  function renderDataFlow() {
    const t = state.type || "skill";
    const td = TYPES_DATA[t];
    const color = td.color;

    const steps = [
      { title: "Source of Truth", path: `registry/${t}s/example-${t}/item.json`, desc: "Individual item files — the only thing you edit directly", color },
      null, // arrow
      { title: "Compile Step", path: "pnpm compile", desc: "Reads all item.json files, assembles type manifests, updates root index counts", color: "var(--warning)", isAction: true },
      null,
      { title: "Type Manifest", path: `registry/${t}s/manifest.json`, desc: `All ${td.count} ${td.label.toLowerCase()} items in one file`, color },
      null,
      { title: "Root Index", path: "registry/manifest.json", desc: "Lightweight index — version + type descriptors with counts and file paths", color: "var(--accent)" },
      null,
      "split",
      { title: "CLI Consumer", path: "loadManifest() → loadTypeItems() → getItem()", desc: "Loads on demand: tries local registry first, falls back to GitHub raw URLs. Caches results.", color: "var(--success)", side: "cli" },
      { title: "Web Consumer", path: 'import skillsData from "@registry/skills/manifest.json"', desc: "Imports all type manifests at build time via Vite. Lazy-loads full item.json only for detail views.", color: "var(--accent)", side: "web" },
    ];

    const container = el("div", { className: "flow-container" });
    let split = null; // the .flow-split row, once the pipeline forks into CLI and Web

    for (const step of steps) {
      if (step === null) {
        if (!split) container.append(el("div", { className: "flow-connector", text: "\u2193" }));
      } else if (step === "split") {
        container.append(el("div", { className: "flow-connector", text: "\u2193\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u2193" }));
        split = el("div", { className: "flow-split" });
        container.append(split);
      } else {
        (split ?? container).append(flowNode(step, t, td));
      }
    }
    return container;
  }

  function consumerCard(color, title, summary, steps) {
    return el(
      "div",
      { className: cx("consumer-card", colorClass(color)) },
      el("div", { className: "consumer-title" }, el("div", { className: "dot" }), title),
      el("div", { className: "consumer-summary", text: summary }),
      ...steps.map((s, i) =>
        el(
          "div",
          { className: "consumer-step" },
          el("div", { className: "consumer-num", text: String(i + 1) }),
          el("div", {}, el("div", { className: "consumer-code", text: s.code }), el("div", { className: "consumer-text", text: s.text }))
        )
      )
    );
  }

  function cliJson(td) {
    return consumerJson(
      jsonNumber("// Resolution order:"), "\n",
      jsonNumber("1."), " ", jsonString(`./registry/${td.file}`), "           ", jsonNumber("// local (dev)"), "\n",
      jsonNumber("2."), " ", jsonString(`https://raw.githubusercontent.com/\n   danieldeusing/seedr/main/\n   registry/${td.file}`), "   ", jsonNumber("// remote (prod)")
    );
  }

  function webJson() {
    return consumerJson(
      jsonNumber("// Vite import resolution:"), "\n",
      jsonKey("import"), " skillsData ", jsonKey("from"), " ", jsonString('"@registry/skills/manifest.json"'), ";\n",
      jsonKey("import"), " pluginsData ", jsonKey("from"), " ", jsonString('"@registry/plugins/manifest.json"'), ";\n",
      jsonNumber("// ... other types"), "\n\n",
      jsonNumber("// Lazy-load for detail views:"), "\n",
      jsonKey("const"), " loaders = ", jsonKey("import"), ".meta.glob(", jsonString('"@registry/*/*/item.json"'), ");"
    );
  }

  function renderConsumers() {
    const t = state.type || "skill";
    const td = TYPES_DATA[t];

    const cliSteps = [
      { code: "loadFile(path)", text: "Try reading from local `registry/` directory first" },
      { code: "fetch(GITHUB_RAW_URL + path)", text: "If local file not found, fetch from GitHub raw content" },
      { code: "loadIndex()", text: "Load root `manifest.json` — get type descriptors and counts" },
      { code: `loadTypeItems("${t}")`, text: `Load \`${td.file}\` — get all ${td.label.toLowerCase()} items` },
      { code: `getItem("pdf", "${t}")`, text: "Look up specific item by slug (+ optional type for disambiguation)" },
      { code: "getItemContent(item)", text: "Fetch main content file (SKILL.md, plugin.json, etc.) for installation" },
    ];

    const webSteps = [
      { code: `import data from "@registry/${t}s/manifest.json"`, text: "Vite resolves registry alias at build time — all items bundled into the app" },
      { code: "getAllItems()", text: "Concatenate all type manifest items into a single array" },
      { code: "getTypeCounts()", text: "Count items per type for the browse page filter badges" },
      { code: "getItem(slug, type?)", text: "Find item in pre-loaded array (no network request needed)" },
      { code: "getLongDescription(slug)", text: "Lazy-load full `item.json` via `import.meta.glob` — only when detail page is opened" },
      { code: "getFileTree(slug)", text: "Also lazy-loaded from `item.json` — shows content structure on detail page" },
    ];

    const cliCard = consumerCard("var(--success)", "CLI Consumer", "Loads on demand at runtime. Local-first with GitHub fallback. Cached per session.", cliSteps);
    const webCard = consumerCard("var(--accent)", "Web Consumer", "Imports manifests at build time via Vite. Lazy-loads full item.json only for detail views.", webSteps);
    if (state.detail) {
      cliCard.append(cliJson(td));
      webCard.append(webJson());
    }
    return [cliCard, webCard];
  }

  // ── Prompt ──

  function renderPrompt() {
    const parts = [];
    const viewLabel = { hierarchy: "manifest hierarchy", "data-flow": "data flow pipeline", consumers: "consumer comparison" }[state.view];
    parts.push(`Viewing the seedr registry **${viewLabel}**`);
    if (state.type) parts.push(`highlighting **${TYPES_DATA[state.type].label}** content type`);
    if (state.source !== "all") parts.push(`filtered to **${state.source}** sources`);
    if (state.detail) parts.push("with expanded JSON content");
    parts.push(".");

    const context = [];
    if (state.view === "hierarchy") {
      context.push("The registry uses a 3-level split manifest: root index, per-type manifests, and individual item.json files. Only item.json files are edited directly; manifests are compiled.");
    } else if (state.view === "data-flow") {
      context.push("Data flows from item.json source files through `pnpm compile` into split manifests, consumed differently by CLI (on-demand loading) and Web (build-time imports with lazy detail loading).");
    } else {
      context.push("CLI loads registry data on demand with local-first fallback to GitHub. Web app bundles all type manifests at build time and lazy-loads full item.json only when viewing detail pages.");
    }

    document.getElementById("promptText").replaceChildren(
      parts.join(", "),
      el("br"),
      el("span", { className: "prompt-context", text: context.join(" ") })
    );
  }

  // ── Actions ──

  function setView(v) { state.view = v; renderControls(); updateAll(); }
  function setType(t) { state.type = state.type === t ? "" : t; renderControls(); updateAll(); }
  function setSource(s) { state.source = s; renderControls(); updateAll(); }
  function toggleDetail() { state.detail = !state.detail; renderControls(); updateAll(); }
  function applyPreset(i) { const p = PRESETS[i]; Object.assign(state, p); renderControls(); updateAll(); }
  function copyPrompt() {
    navigator.clipboard.writeText(document.getElementById("promptText").innerText).then(() => {
      const btn = document.getElementById("copyBtn");
      btn.textContent = "Copied!"; btn.classList.add("copied");
      setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1500);
    });
  }
  function updateAll() { renderCanvas(); renderPrompt(); }

  // ── Events ──

  // Generated controls (tabs, chips, presets, diagram nodes) carry data-action/data-value;
  // one delegated listener dispatches them, so re-rendering never loses a handler.
  const ACTIONS = {
    "set-view": setView,
    "set-type": setType,
    "set-source": setSource,
    "apply-preset": (index) => applyPreset(Number(index)),
  };
  document.body.addEventListener("click", (event) => {
    const control = event.target.closest("[data-action]");
    if (control) ACTIONS[control.dataset.action](control.dataset.value);
  });
  document.getElementById("detailToggle").addEventListener("click", toggleDetail);
  document.getElementById("copyBtn").addEventListener("click", copyPrompt);

  // ── Init ──
  renderControls();
  updateAll();
})();

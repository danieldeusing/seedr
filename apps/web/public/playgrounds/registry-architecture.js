/* global document, navigator, setTimeout, CSSStyleSheet */
// Registry Architecture playground. Runs under the strict Content-Security-Policy:
// every piece of markup is built with DOM APIs, dynamic colours are applied through
// generated classes in a constructed stylesheet (no style attributes), and generated
// controls are wired with data-action attributes and one delegated click listener.
(() => {
  "use strict";

  // Counts mirror registry/manifest.json; the order is ALL_TYPES in
  // packages/registry-ops/src/paths.ts, which is the order the manifests list them in.
  const TYPES_DATA = {
    skill:    { label: "Skill",    color: "#f472b6", count: 39, file: "skills/manifest.json" },
    plugin:   { label: "Plugin",   color: "#818cf8", count: 68, file: "plugins/manifest.json" },
    hook:     { label: "Hook",     color: "#c084fc", count: 3,  file: "hooks/manifest.json" },
    agent:    { label: "Agent",    color: "#60a5fa", count: 0,  file: "agents/manifest.json" },
    mcp:      { label: "MCP",      color: "#14b8a6", count: 1,  file: "mcp/manifest.json" },
    settings: { label: "Settings", color: "#fb923c", count: 0,  file: "settings/manifest.json" },
    command:  { label: "Command",  color: "#fbbf24", count: 0,  file: "commands/manifest.json" },
  };

  // Folder name for a type: plural except `mcp` and `settings`, which are used as-is
  // (typeDirName() in packages/registry-ops/src/paths.ts).
  const typeDirName = (type) => (type === "settings" || type === "mcp" ? type : `${type}s`);

  const SOURCES = ["all", "official", "seedr", "community"];
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
    block.append(
      "\n  ", jsonBracket("}"), ",\n  ",
      jsonKey('"labels"'), ": ", jsonBracket("["), " ",
      jsonBracket("{"), " ", jsonKey('"slug"'), ": ", jsonString('"project-x"'), ", ",
      jsonKey('"name"'), ": ", jsonString('"Project X"'), ", ",
      jsonKey('"color"'), ": ", jsonString('"violet"'), " ", jsonBracket("}"), " ", jsonBracket("]"), "\n",
      jsonBracket("}")
    );
    return block;
  }

  function labelsJson() {
    return nodeJson(
      jsonBracket("{"), "\n  ", jsonKey('"version"'), ": ", jsonNumber("1"), ",\n  ",
      jsonKey('"labels"'), ": ", jsonBracket("["), "\n    ",
      jsonBracket("{"), " ", jsonKey('"slug"'), ": ", jsonString('"project-x"'), ", ",
      jsonKey('"name"'), ": ", jsonString('"Project X"'), ", ",
      jsonKey('"color"'), ": ", jsonString('"violet"'), " ", jsonBracket("}"), "\n  ",
      jsonBracket("]"), "\n", jsonBracket("}")
    );
  }

  function typeManifestJson(k, v) {
    return nodeJson(
      jsonBracket("{"), "\n  ", jsonKey('"type"'), ": ", jsonString(`"${k}"`), ",\n  ",
      jsonKey('"items"'), ": ", jsonBracket("["), "\n    ",
      jsonBracket("{"), " ", jsonKey('"slug"'), ": ", jsonString('"..."'), ", ", jsonKey('"name"'), ": ", jsonString('"..."'), ", ", jsonKey('"label"'), ": ", jsonString('"..."'), ", ... ", jsonBracket("}"), "\n    ",
      jsonBracket("..."), " ", jsonNumber(`${v.count} item${v.count === 1 ? "" : "s"}`), "\n  ",
      jsonBracket("]"), "\n", jsonBracket("}"), "\n",
      jsonNumber(k === "plugin" ? "// longDescription and contents stripped" : "// longDescription stripped")
    );
  }

  // Fields in the order sync/item.ts writes them. The two conditional blocks are
  // mirror images: a synced item must carry provenance, and only a first-party item
  // keeps a label — the sync's curated-field list does not preserve one.
  function itemJson(k, v, src) {
    const firstParty = src === "seedr";
    const block = nodeJson(
      jsonBracket("{"), "\n  ",
      jsonKey('"slug"'), ": ", jsonString(`"example-${k}"`), ",\n  ",
      jsonKey('"name"'), ": ", jsonString(`"Example ${v.label}"`), ",\n  ",
      jsonKey('"type"'), ": ", jsonString(`"${k}"`), ",\n  ",
      jsonKey('"description"'), ": ", jsonString('"..."'), ",\n  ",
      jsonKey('"longDescription"'), ": ", jsonString('"..."'), ",  ", jsonNumber("// stripped from the manifests"), "\n  ",
      jsonKey('"compatibility"'), ": ", jsonBracket('["claude", "copilot", "antigravity", "codex", "opencode"]'), ",\n  ",
      jsonKey('"sourceType"'), ": ", jsonString(`"${src}"`), ",\n  "
    );
    if (firstParty) {
      block.append(jsonKey('"label"'), ": ", jsonString('"project-x"'), ",  ", jsonNumber("// optional; a slug from labels.json"), "\n  ");
    }
    block.append(
      jsonKey('"author"'), ": ", jsonBracket('{ "name": "..." }'), ",\n  ",
      jsonKey('"externalUrl"'), ": ", jsonString('"https://github.com/..."'), ",  ", jsonNumber("// or local://<path>"), "\n  "
    );
    if (!firstParty) {
      block.append(
        jsonKey('"sourceRevision"'), ": ", jsonString('"<40-hex commit>"'), ",\n  ",
        jsonKey('"contentDigest"'), ": ", jsonString('"<sha-256>"'), ",\n  "
      );
    }
    block.append(jsonKey('"contents"'), ": ", jsonBracket('{ "files": [...] }'), "\n", jsonBracket("}"));
    return block;
  }

  function renderHierarchy() {
    const hl = state.type;
    const typesArr = Object.entries(TYPES_DATA);

    // Level 1: Root manifest
    const rootNode = el(
      "div",
      { className: cx("node", "node-root", !hl && "highlighted") },
      nodeTitle("registry/manifest.json"),
      nodeSub("Points to each type manifest with item counts, and carries the label catalogue")
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
        // The plural of a type name is its directory name — "mcp" and "settings" are
        // already plural, so appending an "s" gave "0 settingss".
        nodeSub(`${v.count} ${v.count === 1 ? k : typeDirName(k)}`)
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
        nodeTitle(`${typeDirName(k)}/example-${k}/item.json`),
        nodeSub(`Source of truth for one ${v.label.toLowerCase()}`),
        el("div", { className: "node-badge", text: src })
      );
      if (state.detail) node.append(itemJson(k, v, src));
      return node;
    });

    // The catalogue is edited like an item.json and compiled like one, but it belongs to
    // no type, so it neither highlights nor filters.
    const labelsNode = el(
      "div",
      { className: "node node-static" },
      nodeTitle("registry/labels.json"),
      nodeSub("Label catalogue — copied verbatim into the root index")
    );
    if (state.detail) labelsNode.append(labelsJson());

    const level = (label, ...nodes) =>
      el("div", { className: "level" }, el("div", { className: "level-label", text: label }), el("div", { className: "level-row" }, ...nodes));

    return el(
      "div",
      { className: "diagram" },
      level("Level 1 — Root Index", rootNode),
      el("div", { className: "flow-arrow" }, "\u2193 ", el("span", { className: "flow-label", text: "references" })),
      level("Level 2 — Type Manifests (one per content type)", ...typeNodes),
      el("div", { className: "flow-arrow" }, "\u2191 ", el("span", { className: "flow-label", text: "compiled from" })),
      level("Level 3 — Editable Sources (source of truth)", ...sampleItems, labelsNode)
    );
  }

  function flowJson(step, t, td) {
    if (step.path.includes("item.json")) {
      return consumerJson(
        jsonBracket("{"), " ", jsonKey('"slug"'), ": ", jsonString('"pdf"'), ", ", jsonKey('"type"'), ": ", jsonString(`"${t}"`), ", ",
        jsonKey('"description"'), ": ", jsonString('"..."'), ", ... ", jsonBracket("}")
      );
    }
    if (step.path.includes(`${typeDirName(t)}/manifest`)) {
      return consumerJson(
        jsonBracket("{"), " ", jsonKey('"type"'), ": ", jsonString(`"${t}"`), ", ", jsonKey('"items"'), ": ", jsonBracket("[{...}, {...}, ...]"), " ",
        jsonNumber(`// ${td.count} item${td.count === 1 ? "" : "s"}`), " ", jsonBracket("}")
      );
    }
    if (step.path.includes("manifest.json") && !step.path.includes(typeDirName(t))) {
      return consumerJson(
        jsonBracket("{"), " ", jsonKey('"version"'), ": ", jsonString('"2.0.0"'), ", ", jsonKey('"types"'), ": ", jsonBracket("{"), " ",
        jsonKey(`"${t}"`), ": ", jsonBracket("{"), " ", jsonKey('"count"'), ": ", jsonNumber(String(td.count)), " ", jsonBracket("} }"), ", ",
        jsonKey('"labels"'), ": ", jsonBracket("[...]"), " ", jsonBracket("}")
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
      { title: "Source of Truth", path: `registry/${typeDirName(t)}/example-${t}/item.json`, desc: "Individual item files, plus registry/labels.json — the only things you edit directly", color },
      null, // arrow
      { title: "Compile Step", path: "pnpm compile", desc: "Reads every item.json, strips longDescription into the type manifests, copies labels.json into the root index", color: "var(--warning)", isAction: true },
      null,
      { title: "Type Manifest", path: `registry/${typeDirName(t)}/manifest.json`, desc: `All ${td.count} ${td.label.toLowerCase()} item${td.count === 1 ? "" : "s"} in one file, each keeping its optional label`, color },
      null,
      { title: "Root Index", path: "registry/manifest.json", desc: "Lightweight index — version + type descriptors with counts and file paths + the label catalogue", color: "var(--accent)" },
      null,
      "split",
      { title: "CLI Consumer", path: "loadManifest() → loadTypeItems() → getItem()", desc: "Loads on demand: tries the local registry directory first, falls back to the registry URL. Caches results.", color: "var(--success)", side: "cli" },
      { title: "Web Consumer", path: `import ${typeDirName(t)}Data from "@registry/${typeDirName(t)}/manifest.json"`, desc: "Imports all type manifests at build time via Vite. Lazy-loads full item.json only for detail views.", color: "var(--accent)", side: "web" },
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
      jsonNumber("// Resolution order (packages/cli/src/config/registry.ts):"), "\n",
      jsonNumber("1."), " ", jsonString("$SEEDR_REGISTRY_DIR"), "        ", jsonNumber("// explicit override"), "\n",
      jsonNumber("2."), " ", jsonString("<checkout>/registry"), "        ", jsonNumber("// or the registryDir seedr.config.json names"), "\n",
      jsonNumber("3."), " ", jsonString("$SEEDR_REGISTRY_URL"), "        ", jsonNumber("// else raw.githubusercontent.com/"), "\n",
      "                              ", jsonNumber("//      danieldeusing/seedr/main/registry"), "\n\n",
      jsonNumber("// ...then + "), jsonString(`"/${td.file}"`)
    );
  }

  function webJson() {
    return consumerJson(
      jsonNumber("// Vite import resolution (@registry → seedr.config.json's registryDir):"), "\n",
      jsonKey("import"), " indexData ", jsonKey("from"), " ", jsonString('"@registry/manifest.json"'), ";     ", jsonNumber("// + labels"), "\n",
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
      { code: "loadFile(path)", text: "Try reading from the local registry directory first (`SEEDR_REGISTRY_DIR`, else what `seedr.config.json` names)" },
      { code: "fetchRemote(REGISTRY_URL + path)", text: "If the local file is not there, fetch from `SEEDR_REGISTRY_URL` — GitHub raw by default" },
      { code: "loadIndex()", text: "Load root `manifest.json` — type descriptors, counts and the label catalogue" },
      { code: `loadTypeItems("${t}")`, text: `Load \`${td.file}\` — all ${td.label.toLowerCase()} items, each with its optional \`label\`` },
      { code: `getItem("pdf", "${t}")`, text: "Look up specific item by slug (+ optional type for disambiguation)" },
      { code: "listItems() → item.label", text: "`seedr list --label <slug>` filters on it; a label no item carries is an error naming the ones in use" },
      { code: "getItemContent(item)", text: "Fetch the main content file — `SKILL.md`, or `<type>.md` (`mainFileName`) — for installation" },
    ];

    const webSteps = [
      { code: `import data from "@registry/${typeDirName(t)}/manifest.json"`, text: "Vite resolves the `@registry` alias at build time — all items bundled into the app" },
      { code: "getAllItems()", text: "Concatenate all type manifest items into a single array" },
      { code: "getTypeCounts()", text: "Count items per type for the browse page filter badges" },
      { code: "getItem(slug, type?)", text: "Find item in pre-loaded array (no network request needed)" },
      { code: "labelCatalogue", text: "The root index's `labels`, resolved against each item's `label` for the card badge and the Label filter" },
      { code: "getLongDescription(slug, type?)", text: "Lazy-load full `item.json` via `import.meta.glob` — only when detail page is opened" },
      { code: "getFileTree(slug, type?)", text: "Also lazy-loaded from `item.json` — shows content structure on detail page" },
      { code: "resolveFileSource(item.externalUrl)", text: "Where the detail page reads those files from: a GitHub raw URL, or `local://<path>` this site serves itself" },
    ];

    const cliCard = consumerCard("var(--success)", "CLI Consumer", "Loads on demand at runtime. Local-first with a remote registry URL as fallback. Cached per session.", cliSteps);
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
      context.push("The registry uses a 3-level split manifest: root index, per-type manifests, and individual item.json files. Only item.json and labels.json are edited directly; manifests are compiled. A fork names its own registry directory in seedr.config.json.");
    } else if (state.view === "data-flow") {
      context.push("Data flows from item.json source files through `pnpm compile` into split manifests — longDescription stripped, the label catalogue copied into the root index — consumed differently by CLI (on-demand loading) and Web (build-time imports with lazy detail loading).");
    } else {
      context.push("CLI loads registry data on demand, local registry directory first and the registry URL as fallback. Web app bundles all type manifests at build time and lazy-loads full item.json only when viewing detail pages.");
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
    const btn = document.getElementById("copyBtn");
    const reset = () => { btn.textContent = "Copy"; btn.classList.remove("copied"); };
    navigator.clipboard.writeText(document.getElementById("promptText").innerText).then(() => {
      btn.textContent = "Copied!"; btn.classList.add("copied");
      setTimeout(reset, 1500);
    }, () => {
      // The clipboard API rejects without focus or permission — tell the user instead of throwing.
      btn.textContent = "Copy failed";
      setTimeout(reset, 1500);
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
    if (!control) return;
    // A data-action this page does not implement is a typo, not a crash: an
    // unchecked lookup threw "ACTIONS[...] is not a function" on any stray
    // [data-action] elsewhere in the document.
    const action = ACTIONS[control.dataset.action];
    if (typeof action === "function") action(control.dataset.value);
  });
  document.getElementById("detailToggle").addEventListener("click", toggleDetail);
  document.getElementById("copyBtn").addEventListener("click", copyPrompt);

  // ── Init ──
  renderControls();
  updateAll();
})();

/* global document, navigator, setTimeout, CSSStyleSheet */
// Installation Path Visualizer. Every dynamic element is built with DOM APIs and every
// handler is attached with addEventListener, so the page runs under the strict
// Content-Security-Policy (no inline scripts, handlers or styles).
(() => {
  "use strict";

  const TYPES = {
    skill:    { label: 'Skill',    color: '#f472b6', structure: 'directory', handler: 'SkillHandler',    mainFile: 'SKILL.md',   subDir: 'skills',   sampleFiles: ['SKILL.md', 'scripts/', 'references/'] },
    agent:    { label: 'Agent',    color: '#60a5fa', structure: 'file',      handler: 'AgentHandler',    mainFile: '{slug}.md',  subDir: 'agents',   sampleFiles: [] },
    command:  { label: 'Command',  color: '#fbbf24', structure: 'file',      handler: 'CommandHandler',  mainFile: '{slug}.md',  subDir: 'commands', sampleFiles: [] },
    hook:     { label: 'Hook',     color: '#c084fc', structure: 'json-merge',handler: 'HookHandler',     mergeTarget: 'settings.json', mergeField: 'hooks', subDir: 'hooks' },
    mcp:      { label: 'MCP',      color: '#14b8a6', structure: 'json-merge',handler: 'McpHandler',      subDir: null },
    plugin:   { label: 'Plugin',   color: '#818cf8', structure: 'plugin',    handler: 'PluginHandler',   subDir: 'plugins' },
    settings: { label: 'Settings', color: '#fb923c', structure: 'json-merge',handler: 'SettingsHandler', mergeTarget: 'settings.json', subDir: null },
  };

  const TOOLS = {
    claude:      { label: 'Claude Code',        short: 'claude',      projectDir: '.claude',   userDir: '~/.claude' },
    copilot:     { label: 'GitHub Copilot',     short: 'copilot',     projectDir: '.github',   userDir: '~/.github' },
    antigravity: { label: 'Google Antigravity', short: 'antigravity', projectDir: '.agents',   userDir: '~/.agents' },
    codex:       { label: 'OpenAI Codex',       short: 'codex',       projectDir: '.codex',    userDir: '~/.codex' },
    opencode:    { label: 'OpenCode',           short: 'opencode',    projectDir: '.opencode', userDir: '~/.opencode' },
  };

  // Where each agent keeps its MCP servers, and the entry the handler writes there.
  // Copilot and Antigravity have no verified format, so they are refused rather than guessed at.
  const MCP_CONFIG = {
    claude:   { project: ['.mcp.json'],             user: ['.claude.json'],                         entry: 'mcpServers.my-item' },
    codex:    { project: ['.codex', 'config.toml'], user: ['.codex', 'config.toml'],                entry: '[mcp_servers.my-item]' },
    opencode: { project: ['opencode.json'],         user: ['.config', 'opencode', 'opencode.json'], entry: 'mcp.my-item' },
  };

  const COMPAT = {
    skill: ['claude','copilot','antigravity','codex','opencode'],
    agent: ['claude'],
    command: ['claude'],
    hook: ['claude'],
    plugin: ['claude'],
    settings: ['claude'],
    mcp: ['claude','codex','opencode'],
  };

  // Tools that read .agents/skills/ directly (no symlink needed)
  const READS_AGENTS_DIR = ['antigravity', 'codex', 'opencode'];

  const PRESETS = [
    { label: 'Skill \u2192 Claude',        type: 'skill',   tools: ['claude'],                       scope: 'project', method: 'copy' },
    { label: 'Skill \u2192 3 Tools',       type: 'skill',   tools: ['claude','copilot','antigravity'], scope: 'project', method: 'symlink' },
    { label: 'Hook \u2192 Project',        type: 'hook',    tools: ['claude'],                       scope: 'project', method: 'copy' },
    { label: 'MCP \u2192 User',            type: 'mcp',     tools: ['claude'],                       scope: 'user',    method: 'copy' },
    { label: 'Plugin \u2192 User',         type: 'plugin',  tools: ['claude'],                       scope: 'user',    method: 'copy' },
  ];

  const state = {
    type: 'skill',
    tools: ['claude'],
    scope: 'project',
    method: 'copy',
  };

  // ── DOM helpers ──

  function el(tag, options = {}, ...children) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = options.text;
    if (options.dataset) Object.assign(node.dataset, options.dataset);
    node.append(...children);
    return node;
  }

  // A JSON preview is a list of tokens: a plain string is appended as text, a
  // [className, text] pair becomes a coloured <span>.
  function jsonBox(tokens) {
    const box = el('div', { className: 'json-box' });
    for (const token of tokens) {
      box.append(typeof token === 'string' ? token : el('span', { className: token[0], text: token[1] }));
    }
    return box;
  }

  // Publishes each type's colour from TYPES as custom properties on [data-type="…"], which
  // install-paths.css reads for the chips and the structure badge. A constructed stylesheet is
  // a CSSOM write (allowed under CSP); element.style would serialise into a style="" attribute.
  function applyTypeColors() {
    const sheet = new CSSStyleSheet();
    for (const [key, type] of Object.entries(TYPES)) {
      sheet.insertRule(`[data-type="${key}"] { --type-color: ${type.color}; --type-bg: ${type.color}18; --type-border: ${type.color}40; }`);
    }
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }

  // ── Controls ──

  function renderTypeChips() {
    document.getElementById('typeChips').replaceChildren(...Object.entries(TYPES).map(([key, type]) => {
      const chip = el('div', { className: 'type-chip', text: type.label, dataset: { type: key } });
      chip.classList.toggle('active', state.type === key);
      chip.addEventListener('click', () => selectType(key));
      return chip;
    }));
  }

  function renderToolChecks() {
    const compat = COMPAT[state.type];
    document.getElementById('toolChecks').replaceChildren(...Object.entries(TOOLS).map(([key, tool]) => {
      const ok = compat.includes(key);
      // MCP servers go into one config file per agent, not into the agent's content root.
      const target = state.type === 'mcp' && ok
        ? mcpConfigPath(key)
        : (state.scope === 'user' ? tool.userDir : tool.projectDir) + '/';

      const checkbox = el('input', { dataset: { tool: key } });
      checkbox.type = 'checkbox';
      checkbox.checked = state.tools.includes(key) && ok;
      checkbox.disabled = !ok;
      checkbox.addEventListener('change', () => {
        const checked = [...document.querySelectorAll('[data-tool]:checked')].map(input => input.dataset.tool);
        state.tools = checked.length ? checked : [COMPAT[state.type][0]];
        updateAll();
      });

      const item = el('label', { className: 'check-item' },
        checkbox,
        el('span', { className: 'tool-label', text: tool.short }),
        ok ? el('span', { className: 'tool-dir', text: target }) : el('span', { className: 'compat-tag', text: 'not supported' }));
      item.classList.toggle('disabled', !ok);
      return item;
    }));
  }

  function radioButton(value, isActive, onSelect) {
    const button = el('div', { className: 'radio-btn', text: value });
    button.classList.toggle('active', isActive);
    button.addEventListener('click', () => onSelect(value));
    return button;
  }

  function renderScopeRadio() {
    const scopes = ['project', 'user', 'local'];
    document.getElementById('scopeRadio').replaceChildren(...scopes.map(scope => radioButton(scope, state.scope === scope, setScope)));
  }

  function renderMethodSection() {
    const show = state.type === 'skill';
    const section = document.getElementById('methodSection');
    section.hidden = !show;
    if (show) {
      document.getElementById('methodRadio').replaceChildren(...['copy','symlink'].map(method => radioButton(method, state.method === method, setMethod)));
    }
  }

  function renderPresets() {
    document.getElementById('presets').replaceChildren(...PRESETS.map((preset, index) => {
      const button = el('button', { className: 'preset-btn', text: preset.label });
      button.addEventListener('click', () => applyPreset(index));
      return button;
    }));
  }

  // ── Summary ──

  function renderSummary() {
    const t = TYPES[state.type];
    const useSymlink = state.method === 'symlink' && state.type === 'skill';
    const linkedTools = state.tools.filter(tool => !READS_AGENTS_DIR.includes(tool));

    let operation = 'Copy files';
    if (state.type === 'hook') operation = 'Copy script + merge triggers';
    else if (state.type === 'mcp') operation = 'Write one server entry';
    else if (t.structure === 'json-merge') operation = 'Deep merge into JSON';
    else if (t.structure === 'plugin') operation = 'Cache to ~/.claude + clone marketplace + enable';
    else if (useSymlink) operation = 'Central copy + symlinks';

    let fileCount = 0;
    if (t.structure === 'directory') {
      const itemFileCount = t.sampleFiles?.length || 1;
      fileCount = useSymlink ? itemFileCount + linkedTools.length : itemFileCount * state.tools.length;
    }
    else if (t.structure === 'file') fileCount = state.tools.length;
    else if (state.type === 'hook') fileCount = 2;
    else if (state.type === 'mcp') fileCount = state.tools.length;
    else if (t.structure === 'json-merge') fileCount = 1;
    else if (t.structure === 'plugin') fileCount = 5; // cache dir + marketplace clone + installed_plugins + known_marketplaces + settings

    const rows = [
      ['Handler', el('span', { className: 'summary-value' }, t.handler, el('span', { className: 'handler-method', text: '.install()' }))],
      ['Content Structure', el('span', { className: 'summary-badge', text: t.structure, dataset: { type: state.type } })],
      ['Operation', el('span', { className: 'summary-value', text: operation })],
      ['Files Affected', el('span', { className: 'summary-value', text: String(fileCount) })],
      ['Tools', el('span', { className: 'summary-value', text: state.tools.map(tool => TOOLS[tool].short).join(', ') })],
      ['Scope', el('span', { className: 'summary-value', text: state.scope })],
    ];
    document.getElementById('summaryCard').replaceChildren(...rows.map(([label, value]) =>
      el('div', { className: 'summary-row' }, el('span', { className: 'summary-label', text: label }), value)));
  }

  // ── File Tree ──

  function renderFileTree() {
    const tree = document.getElementById('fileTree');
    const t = TYPES[state.type];
    const useSymlink = state.method === 'symlink' && state.type === 'skill';
    const slug = 'my-item';
    const rootName = state.scope === 'user' ? '~/' : 'my-project/';
    const nodes = [];

    if (t.structure === 'directory') {
      // Symlink mode always writes the central copy first, however many tools were picked.
      if (useSymlink) {
        // Central storage
        const itemFiles = (t.sampleFiles || [t.mainFile]).map(f => ({ name: f, type: f.endsWith('/') ? 'new-dir' : 'new' }));
        nodes.push({ name: '.agents/', cls: 'dir', children: [
          { name: t.subDir + '/', cls: 'dir', children: [
            { name: slug + '/', cls: 'new', note: 'central copy', children: itemFiles }
          ]}
        ]});
        state.tools.forEach(tool => {
          if (READS_AGENTS_DIR.includes(tool)) return; // reads .agents/ directly
          const dir = toolDir(tool);
          nodes.push({ name: dir + '/', cls: 'dir', children: [
            { name: t.subDir + '/', cls: 'dir', children: [
              { name: slug + '/', cls: 'sym', target: `../../.agents/${t.subDir}/${slug}/` }
            ]}
          ]});
        });
      } else {
        state.tools.forEach(tool => {
          const dir = toolDir(tool);
          const itemFiles = (t.sampleFiles || [t.mainFile]).map(f => ({ name: f, type: f.endsWith('/') ? 'new-dir' : 'new' }));
          nodes.push({ name: dir + '/', cls: 'dir', children: [
            { name: t.subDir + '/', cls: 'dir', children: [
              { name: slug + '/', cls: 'new', children: itemFiles.map(f => ({ name: f.name, cls: 'new' })) }
            ]}
          ]});
        });
      }
    } else if (t.structure === 'file') {
      state.tools.forEach(tool => {
        const dir = toolDir(tool);
        nodes.push({ name: dir + '/', cls: 'dir', children: [
          { name: t.subDir + '/', cls: 'dir', children: [
            { name: slug + '.md', cls: 'new' }
          ]}
        ]});
      });
    } else if (t.structure === 'json-merge') {
      if (state.type === 'hook') {
        const dir = toolDir('claude');
        const settingsFile = state.scope === 'local' ? 'settings.local.json' : 'settings.json';
        nodes.push({ name: dir + '/', cls: 'dir', children: [
          { name: 'hooks/', cls: 'dir', children: [
            { name: slug + '.sh', cls: 'new', note: 'hook script' }
          ]},
          { name: settingsFile, cls: 'mod', note: 'hooks merged' }
        ]});
      } else if (state.type === 'mcp') {
        state.tools.forEach(tool => {
          const config = MCP_CONFIG[tool];
          const segments = state.scope === 'user' ? config.user : config.project;
          nodes.push(...pathNodes(segments, { cls: 'mod', note: config.entry + ' written' }));
        });
      } else if (state.type === 'settings') {
        const dir = toolDir('claude');
        const settingsFile = state.scope === 'local' ? 'settings.local.json' : 'settings.json';
        nodes.push({ name: dir + '/', cls: 'dir', children: [
          { name: settingsFile, cls: 'mod', note: 'settings merged' }
        ]});
      }
    } else if (t.structure === 'plugin') {
      const mp = 'marketplace';
      const pid = slug + '@' + mp;

      // Cache, marketplace clone, and registry are ALWAYS in ~/.claude/ (user home)
      const userNodes = [{ name: '~/', cls: 'dir', children: [
        { name: '.claude/', cls: 'dir', children: [
          { name: 'plugins/', cls: 'dir', children: [
            { name: 'cache/', cls: 'dir', children: [
              { name: mp + '/', cls: 'dir', children: [
                { name: slug + '/', cls: 'dir', children: [
                  { name: '1.0.0/', cls: 'new', note: 'cached content', children: [
                    { name: '.claude-plugin/', cls: 'new', children: [
                      { name: 'plugin.json', cls: 'new' },
                      { name: 'marketplace.json', cls: 'new' },
                    ]},
                    { name: 'skills/', cls: 'new' },
                    { name: 'agents/', cls: 'new' },
                    { name: 'commands/', cls: 'new' },
                  ]}
                ]}
              ]}
            ]},
            { name: 'marketplaces/', cls: 'dir', children: [
              { name: mp + '/', cls: 'new', note: 'git clone' },
            ]},
            { name: 'installed_plugins.json', cls: 'mod', note: 'scope + path' },
            { name: 'known_marketplaces.json', cls: 'mod', note: 'marketplace source' },
          ]},
          ...(state.scope === 'user' ? [{ name: 'settings.json', cls: 'mod', note: `enabledPlugins["${pid}"] = true` }] : []),
        ]}
      ]}];

      tree.replaceChildren();
      appendTree(tree, userNodes, '');

      // For project/local scope, settings.json is in the project
      if (state.scope !== 'user') {
        const settingsFile = state.scope === 'local' ? 'settings.local.json' : 'settings.json';
        const projectNodes = [{ name: 'my-project/', cls: 'dir', children: [
          { name: '.claude/', cls: 'dir', children: [
            { name: settingsFile, cls: 'mod', note: `enabledPlugins["${pid}"] = true` },
          ]}
        ]}];
        tree.append('\n');
        appendTree(tree, projectNodes, '');
      }

      // Plugin JSON previews
      tree.append(...pluginJsonPreview(pid, state.scope));
      return;
    }

    const root = [{ name: rootName, cls: 'dir', children: nodes }];
    tree.replaceChildren();
    appendTree(tree, root, '');

    // JSON merge preview
    if (t.structure === 'json-merge') {
      tree.append(...jsonPreview());
    }
  }

  function toolDir(tool) {
    return state.scope === 'user' ? TOOLS[tool].userDir.replace('~/', '') : TOOLS[tool].projectDir;
  }

  function mcpConfigPath(tool) {
    const config = MCP_CONFIG[tool];
    return state.scope === 'user' ? '~/' + config.user.join('/') : config.project.join('/');
  }

  // Nests a path given as segments, so `['.codex', 'config.toml']` becomes a directory
  // holding the leaf. Only the last segment carries the leaf's class and note.
  function pathNodes(segments, leaf) {
    const [head, ...rest] = segments;
    return rest.length === 0
      ? [{ ...leaf, name: head }]
      : [{ name: head + '/', cls: 'dir', children: pathNodes(rest, leaf) }];
  }

  const TREE_CLASS = { dir: 't-dir', new: 't-new', 'new-dir': 't-new', mod: 't-mod', sym: 't-sym' };

  // Appends one line per node (text for the indentation, <span>s for the coloured parts) to the
  // white-space: pre container.
  function appendTree(container, nodes, prefix) {
    nodes.forEach((n, i) => {
      const last = i === nodes.length - 1;
      const connector = prefix === '' ? '' : (last ? '└── ' : '├── ');
      const childPfx = prefix === '' ? '' : prefix + (last ? '    ' : '│   ');

      const indent = prefix + connector;
      if (indent) container.append(indent);
      container.append(el('span', { className: TREE_CLASS[n.cls] || 't-dir', text: n.name }));
      if (n.cls === 'sym' && n.target) {
        container.append(' ', el('span', { className: 't-arrow', text: '→' }), ' ', el('span', { className: 't-sym', text: n.target }));
      }
      if (n.note) container.append(' ', el('span', { className: 't-note', text: '← ' + n.note }));

      container.append('\n');
      if (n.children) appendTree(container, n.children, childPfx || '  ');
    });
  }

  // The registry's definition uses Claude Code's vocabulary; every other agent's adapter
  // translates it into that agent's own schema before writing.
  function mcpEntry(tool) {
    if (tool === 'codex') {
      return jsonBox([
        ['jk', '[mcp_servers.my-item]'], '\n',
        ['ja jk', 'command'], ' = ', ['ja js', '"npx"'], '\n',
        ['ja jk', 'args'], ' = ', ['jb', '['], ['ja js', '"-y"'], ', ', ['ja js', '"@scope/my-item-mcp"'], ['jb', ']'],
      ]);
    }
    if (tool === 'opencode') {
      return jsonBox([
        ['jb', '{'], '\n',
        '  ', ['jk', '"mcp"'], ': ', ['jb', '{'], '\n',
        '    ', ['ja jk', '"my-item"'], ': ', ['jb', '{'], '\n',
        '      ', ['ja jk', '"type"'], ': ', ['ja js', '"local"'], ',\n',
        '      ', ['ja jk', '"command"'], ': ', ['jb', '['], ['ja js', '"npx"'], ', ', ['ja js', '"-y"'], ', ', ['ja js', '"@scope/my-item-mcp"'], ['jb', ']'], ',\n',
        '      ', ['ja jk', '"enabled"'], ': ', ['ja', 'true'], '\n',
        '    ', ['jb', '}'], '\n',
        '  ', ['jb', '}'], '\n',
        ['jb', '}'],
      ]);
    }
    return jsonBox([
      ['jb', '{'], '\n',
      '  ', ['jk', '"mcpServers"'], ': ', ['jb', '{'], '\n',
      '    ', ['ja jk', '"my-item"'], ': ', ['jb', '{'], '\n',
      '      ', ['ja jk', '"command"'], ': ', ['ja js', '"npx"'], ',\n',
      '      ', ['ja jk', '"args"'], ': ', ['jb', '['], ['ja js', '"-y"'], ', ', ['ja js', '"@scope/my-item-mcp"'], ['jb', ']'], '\n',
      '    ', ['jb', '}'], '\n',
      '  ', ['jb', '}'], '\n',
      ['jb', '}'],
    ]);
  }

  function jsonPreview() {
    if (state.type === 'hook') {
      return ['\n', jsonBox([
        ['jb', '{'], '\n',
        '  ', ['jk', '"hooks"'], ': ', ['jb', '{'], '\n',
        '    ', ['ja jk', '"PreToolUse"'], ': ', ['jb', '[{'], '\n',
        '      ', ['ja jk', '"matcher"'], ': ', ['ja js', '"Bash"'], ',\n',
        '      ', ['ja jk', '"hooks"'], ': ', ['jb', '[{'], '\n',
        '        ', ['ja jk', '"type"'], ': ', ['ja js', '"command"'], ',\n',
        '        ', ['ja jk', '"command"'], ': ', ['ja js', `"${state.scope === 'user' ? '~/' : ''}.claude/hooks/my-item.sh"`], '\n',
        '      ', ['jb', '}]'], '\n',
        '    ', ['jb', '}]'], '\n',
        '  ', ['jb', '}'], '\n',
        ['jb', '}'],
      ])];
    }
    if (state.type === 'mcp') {
      return state.tools.flatMap(tool => [
        '\n', el('div', { className: 'json-label', text: `${mcpConfigPath(tool)} (${TOOLS[tool].short})` }),
        '\n', mcpEntry(tool),
      ]);
    }
    if (state.type === 'settings') {
      return ['\n', jsonBox([
        ['jb', '{'], '\n',
        '  ', ['ja jk', '"preferredNotifyMethod"'], ': ', ['ja js', '"terminal"'], ',\n',
        '  ', ['ja jk', '"taskAutoArchive"'], ': ', ['ja', 'true'], '\n',
        ['jb', '}'],
      ])];
    }
    return [];
  }

  function pluginJsonPreview(pid, scope) {
    const scopeField = scope === 'user' ? [] : [',\n', '      ', ['ja jk', '"projectPath"'], ': ', ['ja js', '"/path/to/project"']];
    return [
      '\n', el('div', { className: 'json-label', text: 'installed_plugins.json (always ~/.claude/plugins/)' }),
      '\n', jsonBox([
        ['jb', '{'], '\n',
        '  ', ['jk', '"version"'], ': ', ['ja', '2'], ',\n',
        '  ', ['jk', '"plugins"'], ': ', ['jb', '{'], '\n',
        '    ', ['ja jk', `"${pid}"`], ': ', ['jb', '[{'], '\n',
        '      ', ['ja jk', '"scope"'], ': ', ['ja js', `"${scope}"`], ...scopeField, ',\n',
        '      ', ['ja jk', '"installPath"'], ': ', ['ja js', '"~/.claude/plugins/cache/.../1.0.0/"'], ',\n',
        '      ', ['ja jk', '"version"'], ': ', ['ja js', '"1.0.0"'], '\n',
        '    ', ['jb', '}]'], '\n',
        '  ', ['jb', '}'], '\n',
        ['jb', '}'],
      ]),
      '\n', el('div', { className: 'json-label', text: `settings.json (${scope} scope)` }),
      '\n', jsonBox([
        ['jb', '{'], '\n',
        '  ', ['jk', '"enabledPlugins"'], ': ', ['jb', '{'], '\n',
        '    ', ['ja jk', `"${pid}"`], ': ', ['ja', 'true'], '\n',
        '  ', ['jb', '}'], '\n',
        ['jb', '}'],
      ]),
    ];
  }

  // ── Prompt ──

  function renderPrompt() {
    const t = TYPES[state.type];
    const parts = [];
    parts.push(`Installing a **${t.label.toLowerCase()}** for ${state.tools.map(k => TOOLS[k].label).join(', ')}`);
    parts.push(`at **${state.scope}** scope`);
    if (state.type === 'skill' && state.method !== 'copy') {
      parts.push(`using **${state.method}** method`);
    }
    parts.push('.');

    const details = [];
    if (t.structure === 'directory' && state.method === 'symlink') {
      details.push('Files are stored centrally in `.agents/` with relative symlinks from each tool directory.');
    } else if (state.type === 'mcp') {
      details.push(`The server entry is written into ${state.tools.map(tool => `\`${mcpConfigPath(tool)}\``).join(', ')}.`);
    } else if (t.structure === 'json-merge') {
      details.push(`Config is deep-merged into \`${t.mergeTarget}\`${state.scope === 'local' ? ' (using settings.local.json for local scope)' : ''}.`);
    } else if (t.structure === 'plugin') {
      details.push('Plugin is always cached in `~/.claude/plugins/cache/`, marketplace is git-cloned to `~/.claude/plugins/marketplaces/`, and `enabledPlugins` is set in scope-dependent `settings.json`.');
    }

    const promptText = document.getElementById('promptText');
    promptText.replaceChildren(parts.join(' '));
    if (details.length) promptText.append(el('br'), details.join(' '));
  }

  // ── Actions ──

  function selectType(type) {
    state.type = type;
    const compat = COMPAT[type];
    state.tools = state.tools.filter(t => compat.includes(t));
    if (!state.tools.length) state.tools = [compat[0]];
    if (type !== 'skill') state.method = 'copy';
    renderAll();
  }

  function setScope(s) { state.scope = s; renderAll(); }
  function setMethod(m) { state.method = m; renderAll(); }

  function applyPreset(i) {
    const p = PRESETS[i];
    state.type = p.type;
    state.tools = [...p.tools];
    state.scope = p.scope;
    state.method = p.method;
    renderAll();
  }

  function copyPrompt() {
    const text = document.getElementById('promptText').innerText;
    const btn = document.getElementById('copyBtn');
    navigator.clipboard.writeText(text).then(
      () => { btn.textContent = 'Copied!'; btn.classList.add('copied'); },
      () => { btn.textContent = 'Copy failed'; }, // clipboard access denied (permission or unfocused document)
    ).then(() => {
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
    });
  }

  function renderAll() {
    renderTypeChips();
    renderToolChecks();
    renderScopeRadio();
    renderMethodSection();
    updateAll();
  }

  function updateAll() {
    renderSummary();
    renderFileTree();
    renderPrompt();
  }

  // ── Init ──
  applyTypeColors();
  document.getElementById('copyBtn').addEventListener('click', copyPrompt);
  renderPresets();
  renderAll();
})();

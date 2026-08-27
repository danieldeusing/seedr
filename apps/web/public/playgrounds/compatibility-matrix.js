/* global document, navigator, setTimeout */
(() => {
"use strict";

const TYPES = {
  skill:    { label:'Skill',    color:'#f472b6', structure:'directory', dir:'skills',   mainFile:'SKILL.md',   desc:'Markdown-based instructions with optional scripts and references' },
  command:  { label:'Command',  color:'#fbbf24', structure:'directory', dir:'commands', mainFile:'command.md', desc:'A slash command: one markdown file installed as <slug>.md, which is the name the agent invokes it by' },
  agent:    { label:'Agent',    color:'#60a5fa', structure:'file',      dir:'agents',   mainFile:'{slug}.md',  desc:'Single markdown file defining an agent persona and capabilities' },
  hook:     { label:'Hook',     color:'#c084fc', structure:'json-merge',dir:'hooks',    mergeTarget:'settings.json', desc:'Shell script + JSON config merged into settings.json hooks field' },
  mcp:      { label:'MCP',      color:'#14b8a6', structure:'json-merge',dir:null,       desc:'Server configuration merged into the MCP config file of each supported agent' },
  plugin:   { label:'Plugin',   color:'#818cf8', structure:'plugin',    dir:'plugins/cache', mainFile:'.claude-plugin/plugin.json', desc:'Bundled package cached in ~/.claude/plugins/cache/, marketplace git-cloned, enabled via enabledPlugins in scope-dependent settings.json' },
  settings: { label:'Settings', color:'#fb923c', structure:'json-merge',dir:null,       mergeTarget:'settings.json', desc:'Key-value pairs deep-merged into settings.json' },
};

const TOOLS = {
  claude:      { label:'Claude Code',        short:'claude',      dir:'.claude' },
  copilot:     { label:'GitHub Copilot',     short:'copilot',     dir:'.github' },
  antigravity: { label:'Google Antigravity', short:'antigravity', dir:'.agents' },
  codex:       { label:'OpenAI Codex',       short:'codex',       dir:'.codex' },
  opencode:    { label:'OpenCode',           short:'opencode',    dir:'.opencode' },
};

const COMPAT = {
  skill:    ['claude','copilot','antigravity','codex','opencode'],
  command:  ['claude'],
  agent:    ['claude'],
  hook:     ['claude'],
  plugin:   ['claude'],
  settings: ['claude'],
  mcp:      ['claude','codex','opencode'],
};

// MCP is the one json-merge type more than Claude Code takes, and each agent keeps
// its servers in its own file under its own key.
const MCP_TARGETS = {
  claude:   { file:'.mcp.json',          entry:'mcpServers' },
  codex:    { file:'.codex/config.toml', entry:'mcp_servers' },
  opencode: { file:'opencode.json',      entry:'mcp' },
};

const VIEWS = ['matrix','structures'];
const PRESETS = [
  { label:'Full Matrix',     view:'matrix',     type:'', tool:'' },
  { label:'Claude Only',     view:'matrix',     type:'', tool:'claude' },
  { label:'Universal Types', view:'matrix',     type:'skill', tool:'' },
  { label:'File Structures', view:'structures', type:'', tool:'' },
  { label:'JSON Merge Types',view:'structures', type:'hook', tool:'' },
];

const state = { view:'matrix', type:'', tool:'' };

// ── DOM helpers ──

// Per-type colours come from the stylesheet: `type-<key>` sets --type-color / --type-tint.
function el(tag, { className, text, attrs, dataset } = {}, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (attrs) for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  if (dataset) Object.assign(node.dataset, dataset);
  node.append(...children);
  return node;
}

function classes(...names) {
  return names.filter(Boolean).join(' ');
}

// The file a json-merge type is merged into: fixed per type, except MCP, which
// has one file per agent.
function mergeTargetFor(typeKey, toolKey) {
  return typeKey === 'mcp' ? MCP_TARGETS[toolKey].file : TYPES[typeKey].mergeTarget;
}

// ── Controls ──

function renderControls() {
  const labels = { matrix:'Matrix', structures:'Structures' };
  document.getElementById('viewTabs').replaceChildren(...VIEWS.map(v =>
    el('div', { className: classes('view-tab', state.view===v && 'active'), text: labels[v], dataset: { action:'set-view', value:v } })
  ));

  document.getElementById('typeChips').replaceChildren(
    el('div', { className: classes('type-chip', 'type-chip-all', !state.type && 'active'), text: 'All', dataset: { action:'set-type', value:'' } }),
    ...Object.entries(TYPES).map(([k,v]) =>
      el('div', { className: classes('type-chip', `type-${k}`, state.type===k && 'active'), text: v.label, dataset: { action:'set-type', value:k } })
    )
  );

  document.getElementById('toolChips').replaceChildren(
    el('div', { className: classes('tool-chip', !state.tool && 'active'), dataset: { action:'set-tool', value:'' } }, el('span', { text: 'All tools' })),
    ...Object.entries(TOOLS).map(([k,v]) =>
      el('div', { className: classes('tool-chip', state.tool===k && 'active'), dataset: { action:'set-tool', value:k } },
        el('span', { className: 'mono', text: v.short }),
        el('span', { className: 'tool-chip-dir', text: `${v.dir}/` }))
    )
  );

  document.getElementById('presets').replaceChildren(...PRESETS.map((p,i) =>
    el('button', { className: 'preset-btn', text: p.label, dataset: { action:'apply-preset', value:String(i) } })
  ));
}

// ── Matrix View ──

function renderMatrix() {
  const toolKeys = Object.keys(TOOLS);
  const typeKeys = Object.keys(TYPES);

  const headRow = el('tr', {}, el('th'));
  toolKeys.forEach(tk => {
    const t = TOOLS[tk];
    const dim = state.tool && state.tool !== tk;
    headRow.append(el('th', { className: classes('tool-header', dim && 'faded') },
      el('div', { text: t.label }),
      el('div', { className: 'tool-header-dir', text: `${t.dir}/` })));
  });

  const tbody = el('tbody');
  typeKeys.forEach(yk => {
    const yt = TYPES[yk];
    const typeDim = state.type && state.type !== yk;
    const row = el('tr', { className: 'type-row' },
      el('td', { className: classes('type-label', `type-${yk}`, typeDim && 'faded') }, el('span', { text: yt.label })));
    toolKeys.forEach(tk => {
      const supported = COMPAT[yk].includes(tk);
      const dim = (state.type && state.type !== yk) || (state.tool && state.tool !== tk);
      const hl = (state.type === yk && state.tool === tk) || (state.type === yk && !state.tool) || (!state.type && state.tool === tk);
      row.append(el('td', {
        className: classes(supported?'supported':'unsupported', dim && 'dimmed', hl&&!dim && 'highlighted'),
        attrs: { title: `${yt.label} + ${TOOLS[tk].label}: ${supported?'Supported':'Not supported'}` },
        dataset: { type:yk, tool:tk },
      }, supported ? el('span', { className: 'mark-yes', text: '✓' }) : el('span', { className: 'mark-no', text: '✗' })));
    });
    tbody.append(row);
  });

  const container = el('div', { className: 'matrix-container' },
    el('table', { className: 'matrix' }, el('thead', {}, headRow), tbody));

  // Detail panel when both type and tool selected
  if (state.type && state.tool) {
    const yt = TYPES[state.type];
    const tt = TOOLS[state.tool];
    const supported = COMPAT[state.type].includes(state.tool);
    const card = el('div', { className: 'detail-card' },
      el('div', { className: classes('detail-title', supported?'supported':'unsupported'), text: `${yt.label} + ${tt.label} ${supported ? '— Supported' : '— Not Supported'}` }));
    if (supported) {
      const detailItem = (label, value) => el('div', { className: 'detail-item' },
        el('div', { className: 'detail-item-label', text: label }),
        el('div', { className: 'detail-item-value', text: value }));
      const mergeTarget = mergeTargetFor(state.type, state.tool);
      card.append(
        el('div', { className: 'detail-desc', text: yt.desc }),
        el('div', { className: 'detail-grid' },
          detailItem('Structure', yt.structure),
          detailItem('Install Path', yt.structure === 'json-merge' ? mergeTarget : tt.dir + '/' + (yt.dir||'') + '/'),
          detailItem('Main File', yt.mainFile || mergeTarget),
          detailItem('Operation', yt.structure === 'json-merge' ? 'Deep merge' : yt.structure === 'plugin' ? 'Cache + enable' : 'Copy or symlink')));
    } else {
      card.append(el('div', { className: 'detail-note', text: `${yt.label} content type is only supported by ${COMPAT[state.type].map(t => TOOLS[t].label).join(', ')}.` }));
    }
    container.append(el('div', { className: 'detail-panel' }, card));
  }

  return container;
}

// ── Structures View ──

// The tree is a white-space:pre block: a flat sequence of coloured spans and literal text (newlines, padding).
function buildTree(k, t) {
  const dim = text => el('span', { className: 't-dim', text });
  const add = text => el('span', { className: 't-new', text });
  const mod = text => el('span', { className: 't-mod', text });
  // A tool that does not take this type has no path for it, so an unsupported
  // selection falls back to the type's first compatible tool.
  const toolKey = COMPAT[k].includes(state.tool) ? state.tool : COMPAT[k][0];
  const toolDir = TOOLS[toolKey].dir;

  if (t.structure === 'directory') {
    const nodes = [
      dim(`${toolDir}/`), '\n',
      dim(`  ${t.dir}/`), '\n',
      add('    {slug}/'), '\n',
      add(`      ${t.mainFile}`), '\n',
      add('      scripts/'),
    ];
    if (k==='skill') nodes.push('\n', add('      references/'));
    return nodes;
  }
  if (t.structure === 'file') {
    return [
      dim(`${toolDir}/`), '\n',
      dim(`  ${t.dir}/`), '\n',
      add('    {slug}.md'),
    ];
  }
  if (t.structure === 'json-merge') {
    if (k === 'hook') {
      return [
        dim('.claude/'), '\n',
        add('  hooks/{slug}.sh'), '       ', dim('← script'), '\n',
        mod('  settings.json'), '          ', dim('← hooks merged'),
      ];
    }
    if (k === 'mcp') {
      const { file, entry } = MCP_TARGETS[toolKey];
      return [mod(file), ' '.repeat(25 - file.length), dim(`← ${entry} merged`)];
    }
    return [
      dim('.claude/'), '\n',
      mod('  settings.json'), '          ', dim('← settings merged'),
    ];
  }
  if (t.structure === 'plugin') {
    return [
      dim('~/.claude/'), '                     ', dim('← always user home'), '\n',
      dim('  plugins/'), '\n',
      dim('    cache/{marketplace}/'), '\n',
      add('      {name}/{version}/'), '\n',
      add('        .claude-plugin/'), '       ', dim('← metadata'), '\n',
      add('        skills/ agents/ ...'), '\n',
      add('    marketplaces/{mp}/'), '       ', dim('← git clone'), '\n',
      mod('    installed_plugins.json'), '   ', dim('← scope + path'), '\n',
      mod('    known_marketplaces.json'), '\n',
      '\n',
      dim('.claude/'), '                       ', dim('← scope-dependent'), '\n',
      mod('  settings.json'), '               ', dim('← enabledPlugins["{name}@{mp}"] = true'),
    ];
  }
  return [];
}

function renderStructures() {
  const typeKeys = Object.keys(TYPES);
  const cards = el('div', { className: 'structure-cards' });

  typeKeys.forEach(k => {
    const t = TYPES[k];
    const dim = state.type && state.type !== k;
    const hl = state.type === k;
    const compatTools = COMPAT[k].map(tk => TOOLS[tk].short).join(', ');

    cards.append(el('div', { className: classes('struct-card', `type-${k}`, hl && 'highlighted', dim && 'dimmed') },
      el('div', { className: 'struct-card-header' },
        el('div', { className: 'struct-card-dot' }),
        el('div', { className: 'struct-card-title', text: t.label }),
        el('div', { className: 'struct-card-type', text: t.structure })),
      el('div', { className: 'struct-card-body' },
        t.desc,
        el('br'),
        el('span', { className: 'struct-card-tools', text: `Tools: ${compatTools}` })),
      el('div', { className: 'struct-card-tree' }, ...buildTree(k, t))));
  });

  return cards;
}

// ── Prompt ──

function renderPrompt() {
  const parts = [];
  if (state.view === 'matrix') {
    parts.push('Viewing the **compatibility matrix**');
    if (state.type && state.tool) {
      const supported = COMPAT[state.type].includes(state.tool);
      parts.push(`— **${TYPES[state.type].label}** ${supported ? 'is supported' : 'is not supported'} by **${TOOLS[state.tool].label}**`);
    } else if (state.type) {
      const tools = COMPAT[state.type].map(t => TOOLS[t].label).join(', ');
      parts.push(`— **${TYPES[state.type].label}** works with: ${tools}`);
    } else if (state.tool) {
      const types = Object.entries(COMPAT).filter(([,v]) => v.includes(state.tool)).map(([k]) => TYPES[k].label).join(', ');
      parts.push(`— **${TOOLS[state.tool].label}** supports: ${types}`);
    }
  } else {
    parts.push('Viewing **file structures** for each content type');
    if (state.type) parts.push(`— highlighting **${TYPES[state.type].label}** (${TYPES[state.type].structure})`);
  }
  parts.push('.');

  document.getElementById('promptText').textContent = parts.join(' ');
}

// ── Actions ──

function setView(v) { state.view = v; renderControls(); updateAll(); }
function setType(t) { state.type = state.type === t ? '' : t; renderControls(); updateAll(); }
function setTool(t) { state.tool = state.tool === t ? '' : t; renderControls(); updateAll(); }
function selectCell(type, tool) { state.type = type; state.tool = tool; renderControls(); updateAll(); }
function applyPreset(i) { const p = PRESETS[i]; Object.assign(state, p); renderControls(); updateAll(); }
function copyPrompt() {
  const btn = document.getElementById('copyBtn');
  const reset = () => { btn.textContent = 'Copy'; btn.classList.remove('copied'); };
  navigator.clipboard.writeText(document.getElementById('promptText').innerText).then(() => {
    btn.textContent = 'Copied!'; btn.classList.add('copied');
    setTimeout(reset, 1500);
  }, () => {
    // The clipboard API rejects without focus or permission — tell the user instead of throwing.
    btn.textContent = 'Copy failed';
    setTimeout(reset, 1500);
  });
}
function updateAll() {
  document.getElementById('mainContent').replaceChildren(state.view === 'matrix' ? renderMatrix() : renderStructures());
  renderPrompt();
}

// ── Events ──

document.querySelector('.controls').addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const { action, value } = control.dataset;
  if (action === 'set-view') setView(value);
  else if (action === 'set-type') setType(value);
  else if (action === 'set-tool') setTool(value);
  else if (action === 'apply-preset') applyPreset(Number(value));
});
document.getElementById('mainContent').addEventListener('click', event => {
  const cell = event.target.closest('td[data-type]');
  if (cell) selectCell(cell.dataset.type, cell.dataset.tool);
});
document.getElementById('copyBtn').addEventListener('click', copyPrompt);

// ── Init ──
renderControls();
updateAll();
})();

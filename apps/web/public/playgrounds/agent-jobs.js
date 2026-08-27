/* global document, navigator, setTimeout, Element */
(() => {
"use strict";

// Mirrors apps/studio/src/features/author/adapters.ts. A job says what it needs
// once, in capabilities; each CLI spells those in its own vocabulary, and the
// spellings do not agree — which is the whole point of this page.

const CAPABILITIES = {
  read:   { label:'read',   desc:'open files in the checkout' },
  edit:   { label:'edit',   desc:'write and change files' },
  search: { label:'search', desc:'find files by name and by content' },
  skills: { label:'skills', desc:"run the repository's own authoring skills" },
  web:    { label:'web',    desc:'fetch a page named in the prompt' },
  shell:  { label:'shell',  desc:'run commands at large — except the denied one' },
};

// What no job may run, whatever else it is allowed. Publishing is the one job
// that gets git, and it gets it by naming it as `shell:git` instead.
const DENIED_SHELL = 'git';

const JOBS = {
  draft:   { label:'Draft descriptions', sub:'no tools, one turn',        caps:[], drafting:true },
  add:     { label:'Add capability',     sub:'from a repo or a prompt',   caps:['read','edit','search','skills','web','shell'] },
  update:  { label:'Update capability',  sub:'edit an existing item',     caps:['read','edit','search','skills','shell'] },
  publish: { label:'Publish',            sub:'commit and push',           caps:['read','edit','search','shell:git'] },
};

const AGENTS = {
  claude:      { label:'Claude Code',        program:'claude' },
  copilot:     { label:'GitHub Copilot',     program:'copilot' },
  antigravity: { label:'Google Antigravity', program:'agy' },
  codex:       { label:'OpenAI Codex',       program:'codex' },
  opencode:    { label:'OpenCode',           program:'opencode' },
};

const CLAUDE_TOOLS = { read:['Read'], edit:['Write','Edit'], search:['Glob','Grep'], skills:['Skill'], web:['WebFetch'] };
const COPILOT_TOOLS = { read:['view'], edit:['create','edit'], search:['grep','glob'], skills:['skill'], web:['web_fetch'] };

// codex and antigravity answer one question only — does this job change files —
// and opencode does not take a tool list at all.
const SANDBOXED = 'sandbox only';

const NOTES = {
  claude: { title:'The only one with a deny-list that holds',
    text:'Tools are named on `--allowedTools`, and `--disallowedTools` takes `git` back out again. A drafting run gets `--tools ""`, which removes every tool, and `--max-turns 1` on top of it.' },
  copilot: { title:'It answers to two different names for the same tool',
    text:'It *lists* `bash` and its permission system calls it `shell`; it lists `create` and refuses it under that name. Verified by running the same command twice — `--allow-tool bash` was denied, `--allow-tool shell` ran it. An open-shell job takes `--allow-all-tools`, which its own help calls required for non-interactive use, and states the one boundary with `--deny-tool`.' },
  antigravity: { title:'No deny-list exists, so the prompt carries it',
    text:'`agy` has no way to refuse a single tool, so for this one agent `git` is held off by the prompt alone rather than by the CLI. Its `-p` is a value flag: left bare it eats the next argument and runs something else entirely. Its `--json-schema` shapes the *tool result*, not the answer, so a draft here takes the plain-text path.' },
  codex: { title:'The sandbox is the tool boundary',
    text:'There is no allowlist. `-s read-only` or `-s workspace-write` is the entire question, decided by whether the job changes files. The prompt arrives on stdin, which is what the trailing `-` means.' },
  opencode: { title:'It does not work in the directory it is spawned in',
    text:'Run from a second clone with no `--dir`, it authored the item correctly and wrote every file into the *first* checkout, leaving the clone it was pointed at untouched. Its session is keyed to a project it resolves for itself, and `--dir` is the only thing that moves it. `--auto` is its headless grant: without it a job dies on its own scratch files.' },
};

const CWD = '/path/to/seedr';
const VIEWS = ['invocation','spelling'];

const state = { view:'invocation', job:'add', agent:'claude', caps:JOBS.add.caps.slice() };

// ── the adapter rules themselves ──

const shellPrefix = (capability) => (capability.startsWith('shell:') ? capability.slice('shell:'.length) : null);
/** Whether a job intends to change anything — the only tool question codex and agy answer. */
const writesFiles = (caps) => caps.some((c) => c === 'edit' || c.startsWith('shell'));
/** True when a job may run commands at large, rather than named ones. */
const hasOpenShell = (caps) => caps.includes('shell');

function spell(caps, table, shellFor, anyShell) {
  return caps.flatMap((capability) => {
    if (capability === 'shell') return [anyShell];
    const prefix = shellPrefix(capability);
    return prefix ? [shellFor(prefix)] : (table[capability] ?? []);
  });
}

/** The argv Studio hands the executor, as {text, kind} pieces so it can be coloured. */
function invocationFor(agent, job, caps) {
  const drafting = JOBS[job].drafting;
  const flag = (text) => ({ text, kind:'flag' });
  const value = (text) => ({ text, kind:'value' });
  const deny = (text) => ({ text, kind:'deny' });
  const prompt = value('<prompt>');

  if (agent === 'claude') {
    if (drafting) return { args:[flag('-p'), flag('--output-format'), value('json'), flag('--json-schema'), value('<schema>'), flag('--tools'), value('""'), flag('--max-turns'), value('1')], stdin:true };
    const allowed = spell(caps, CLAUDE_TOOLS, (p) => `Bash(${p}:*)`, 'Bash');
    return {
      args:[flag('-p'), flag('--output-format'), value('stream-json'), flag('--verbose'), flag('--allowedTools'), value(allowed.join(',')),
        ...(hasOpenShell(caps) ? [deny('--disallowedTools'), deny(`Bash(${DENIED_SHELL}:*)`)] : [])],
      stdin:true,
    };
  }

  if (agent === 'copilot') {
    if (drafting) return { args:[flag('--no-color'), flag('--log-level'), value('none'), flag('-p'), prompt] };
    const grants = hasOpenShell(caps)
      ? [flag('--allow-all-tools'), deny('--deny-tool'), deny(`shell(${DENIED_SHELL}:*)`)]
      : spell(caps, COPILOT_TOOLS, (p) => `shell(${p}:*)`, 'shell').flatMap((tool) => [flag('--allow-tool'), value(tool)]);
    return { args:[flag('--no-color'), flag('--log-level'), value('none'), ...grants, flag('--output-format'), value('json'), flag('-p'), prompt] };
  }

  if (agent === 'antigravity') {
    if (drafting) return { args:[flag('--print=<prompt>'), flag('--output-format'), value('json'), flag('--disable-slash-commands')] };
    return {
      args:[flag('--print=<prompt>'), flag('--output-format'), value('stream-json'),
        ...(writesFiles(caps) ? [flag('--dangerously-skip-permissions')] : [flag('--mode'), value('plan')])],
    };
  }

  if (agent === 'codex') {
    if (drafting) return { args:[value('exec'), flag('--color'), value('never'), flag('-s'), value('read-only'), flag('-')], stdin:true };
    return { args:[value('exec'), flag('--json'), flag('--color'), value('never'), flag('-s'), value(writesFiles(caps) ? 'workspace-write' : 'read-only'), flag('-')], stdin:true };
  }

  if (drafting) return { args:[value('run'), flag('--dir'), value(CWD), prompt] };
  return { args:[value('run'), flag('--auto'), flag('--format'), value('json'), flag('--dir'), value(CWD), prompt] };
}

/** What the agent may and may not use, in its own words. */
function grantsFor(agent, job, caps) {
  if (JOBS[job].drafting) return { allowed:[], denied:[], sandbox:'no tools at all, and one turn', caveat:'nothing was granted, so there is nothing to take away' };
  if (agent === 'claude') {
    return { allowed:spell(caps, CLAUDE_TOOLS, (p) => `Bash(${p}:*)`, 'Bash'), denied:hasOpenShell(caps) ? [`Bash(${DENIED_SHELL}:*)`] : [],
      caveat:`nothing to deny — this job names ${DENIED_SHELL} rather than being handed the shell` };
  }
  if (agent === 'copilot') {
    return hasOpenShell(caps)
      ? { allowed:['(all tools)'], denied:[`shell(${DENIED_SHELL}:*)`] }
      : { allowed:spell(caps, COPILOT_TOOLS, (p) => `shell(${p}:*)`, 'shell'), denied:[],
          caveat:`nothing to deny — this job names ${DENIED_SHELL} rather than being handed the shell` };
  }
  if (agent === 'antigravity') {
    return { allowed:[], denied:[], sandbox:writesFiles(caps) ? 'edits and commands, permission prompts skipped' : 'plan mode — reads, never writes',
      caveat:`no deny-list exists, so ${DENIED_SHELL} is held off by the prompt alone` };
  }
  if (agent === 'codex') return { allowed:[], denied:[], sandbox:writesFiles(caps) ? 'workspace-write' : 'read-only' };
  return { allowed:[], denied:[], sandbox:'--auto: its headless grant, no per-tool list' };
}

// ── DOM helpers ──

function el(tag, { className, text, dataset } = {}, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (dataset) Object.assign(node.dataset, dataset);
  for (const child of children) if (child) node.append(child);
  return node;
}

function clear(node) {
  while (node.firstChild) node.firstChild.remove();
}

/** Markdown-ish `code` spans, built as elements — never as a string of markup. */
function withCode(text) {
  const fragment = document.createDocumentFragment();
  for (const [index, part] of text.split('`').entries()) {
    if (part === '') continue;
    fragment.append(index % 2 === 1 ? el('code', { text:part }) : document.createTextNode(part));
  }
  return fragment;
}

// ── controls ──

function renderControls() {
  const tabs = document.getElementById('viewTabs');
  clear(tabs);
  for (const view of VIEWS) {
    tabs.append(el('button', { className:`view-tab${state.view === view ? ' active' : ''}`, text:view, dataset:{ action:'set-view', value:view } }));
  }

  const jobs = document.getElementById('jobList');
  clear(jobs);
  for (const [key, job] of Object.entries(JOBS)) {
    jobs.append(el('button', { className:`job-btn${state.job === key ? ' active' : ''}`, dataset:{ action:'set-job', value:key } },
      document.createTextNode(job.label), el('span', { className:'job-btn-sub', text:job.sub })));
  }

  const caps = document.getElementById('capChips');
  clear(caps);
  const drafting = JOBS[state.job].drafting;
  for (const key of Object.keys(CAPABILITIES)) {
    const on = state.caps.includes(key) || (key === 'shell' && state.caps.some((c) => c.startsWith('shell:')));
    caps.append(el('button', {
      className:`cap-chip${on ? ' active' : ''}${drafting ? ' locked' : ''}`,
      text:key === 'shell' && state.caps.includes(`shell:${DENIED_SHELL}`) ? `shell:${DENIED_SHELL}` : key,
      dataset:{ action:'toggle-cap', value:key },
    }));
  }
  const hint = document.getElementById('capHint');
  clear(hint);
  if (drafting) hint.append(document.createTextNode('A drafting run is not a job: it gets no tools and one turn, so there is nothing to grant.'));
  // One line per capability. Joined into one string they ran together, because a
  // newline is whitespace to the layout and this is not a <pre>.
  else for (const [key, capability] of Object.entries(CAPABILITIES)) hint.append(el('div', { text:`${key} — ${capability.desc}` }));

  const tools = document.getElementById('toolChips');
  clear(tools);
  for (const [key, agent] of Object.entries(AGENTS)) {
    tools.append(el('button', { className:`tool-chip${state.agent === key ? ' active' : ''}`, dataset:{ action:'set-agent', value:key } },
      document.createTextNode(agent.label), el('span', { className:'tool-chip-program', text:agent.program })));
  }
}

// ── views ──

function renderInvocation(root) {
  const agent = AGENTS[state.agent];
  const { args, stdin } = invocationFor(state.agent, state.job, state.caps);
  const wrap = el('div', { className:'invocation' });

  const argv = el('pre', { className:'argv' }, el('span', { className:'argv-program', text:`$ ${agent.program}` }));
  for (const piece of args) argv.append(document.createTextNode(' '), el('span', { className:`argv-${piece.kind}`, text:piece.text }));
  if (stdin) argv.append(el('span', { className:'argv-stdin', text:'\n  # the prompt arrives on stdin' }));
  wrap.append(argv);

  const grants = grantsFor(state.agent, state.job, state.caps);
  const grid = el('div', { className:'grant-grid' });
  const allowed = el('div', { className:'grant' }, el('div', { className:'grant-label', text:'Allowed' }));
  const allowedList = el('div', { className:'grant-list' });
  if (grants.allowed.length > 0) for (const tool of grants.allowed) allowedList.append(el('span', { className:'grant-tool', text:tool }));
  else allowedList.append(el('span', { className:'grant-none', text:grants.sandbox ?? 'nothing named' }));
  allowed.append(allowedList);

  const denied = el('div', { className:'grant' }, el('div', { className:'grant-label', text:'Denied' }));
  const deniedList = el('div', { className:'grant-list' });
  if (grants.denied.length > 0) for (const tool of grants.denied) deniedList.append(el('span', { className:'grant-tool denied', text:tool }));
  else deniedList.append(el('span', { className:'grant-none', text:grants.caveat ?? 'nothing the CLI can refuse by name' }));
  denied.append(deniedList);
  grid.append(allowed, denied);
  wrap.append(grid);

  const note = NOTES[state.agent];
  wrap.append(el('div', { className:'note' }, el('div', { className:'note-title', text:note.title }), el('div', {}, withCode(note.text))));
  root.append(wrap);
}

function renderSpelling(root) {
  const wrap = el('div', { className:'spelling' });
  const table = el('table', { className:'spell-table' });
  const head = el('tr', {}, el('th', { className:'cap-header', text:'capability' }));
  for (const agent of Object.values(AGENTS)) head.append(el('th', { text:agent.label }));
  table.append(head);

  for (const key of Object.keys(CAPABILITIES)) {
    const row = el('tr', {}, el('td', { className:'cap-label', text:key }));
    for (const agentKey of Object.keys(AGENTS)) {
      const selected = agentKey === state.agent ? ' selected-agent' : '';
      if (agentKey === 'claude') row.append(el('td', { className:selected.trim(), text:spell([key], CLAUDE_TOOLS, (p) => `Bash(${p}:*)`, 'Bash').join(', ') }));
      else if (agentKey === 'copilot') row.append(el('td', { className:selected.trim(), text:spell([key], COPILOT_TOOLS, (p) => `shell(${p}:*)`, 'shell').join(', ') }));
      else row.append(el('td', { className:`sandboxed${selected}`, text:SANDBOXED }));
    }
    table.append(row);
  }
  wrap.append(table);
  wrap.append(el('div', { className:'spell-caption' }, withCode(
    'Two CLIs take a list of tool names and three do not. Where a name is listed it is the one that actually works, not the one the CLI documents — Copilot lists `bash` and permits `shell`. The other three answer a single question instead: does this job change files. That is why a job names capabilities and never tool names.'
  )));
  root.append(wrap);
}

function renderPrompt() {
  const text = document.getElementById('promptText');
  clear(text);
  const job = JOBS[state.job];
  const agent = AGENTS[state.agent];
  const summary = job.drafting
    ? `${job.label} on ${agent.label}: no tools, one turn, answer validated against the schema.`
    : `${job.label} on ${agent.label}: ${state.caps.length === 0 ? 'no capabilities named' : state.caps.join(', ')}.`;
  text.append(document.createTextNode(summary));
}

function render() {
  renderControls();
  const main = document.getElementById('mainContent');
  clear(main);
  if (state.view === 'invocation') renderInvocation(main);
  else renderSpelling(main);
  renderPrompt();
}

// ── events ──

document.body.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
  if (!target) return;
  const { action, value } = target.dataset;
  if (action === 'set-view') state.view = value;
  else if (action === 'set-job') {
    state.job = value;
    state.caps = JOBS[value].caps.slice();
  } else if (action === 'set-agent') state.agent = value;
  else if (action === 'toggle-cap') {
    if (JOBS[state.job].drafting) return;
    const held = state.caps.includes(value) || (value === 'shell' && state.caps.some((c) => c.startsWith('shell:')));
    state.caps = held ? state.caps.filter((c) => c !== value && !c.startsWith(`${value}:`)) : [...state.caps, value];
  }
  render();
});

document.getElementById('copyBtn')?.addEventListener('click', () => {
  const agent = AGENTS[state.agent];
  const { args } = invocationFor(state.agent, state.job, state.caps);
  const line = `${agent.program} ${args.map((piece) => piece.text).join(' ')}`;
  const button = document.getElementById('copyBtn');
  navigator.clipboard?.writeText(line).then(() => {
    button.classList.add('copied');
    button.textContent = 'Copied';
    setTimeout(() => {
      button.classList.remove('copied');
      button.textContent = 'Copy';
    }, 1200);
  }, () => undefined);
});

render();
})();

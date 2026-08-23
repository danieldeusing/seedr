# @danieldeusing/seedr

Seed your coding agents with capabilities: install curated skills, agents, hooks, plugins,
MCP servers and settings presets for Claude Code, GitHub Copilot, Gemini, OpenAI Codex and
OpenCode with one command.

```bash
npx @danieldeusing/seedr add            # interactive picker
npx @danieldeusing/seedr add pdf -a all # install a skill for every compatible tool
npx @danieldeusing/seedr list -i        # what is installed here
npx @danieldeusing/seedr remove pdf -t skill
```

Browse the registry at <https://seedr.danieldeusing.de>. Full documentation, the content-type
matrix and the self-hosting guide live in the repository:
<https://github.com/danieldeusing/seedr>.

## What the CLI does with your files

- Every item is fetched from **one pinned upstream commit** and its complete file set is
  verified against a SHA-256 digest recorded in the registry **before** anything is written.
  A mismatch aborts the install and leaves nothing behind.
- Destinations are validated to stay inside the target tool's configuration directory;
  symlinked destinations are never followed, and configuration files are replaced atomically.
- `--dry-run` prints the exact files each tool would create or modify and writes nothing.
- The upstream license text travels with installed content.

## Telemetry

When an install **succeeds**, the CLI sends one anonymous event **per successful target
tool** to `https://seedr.danieldeusing.de/api/installs`, so the website can show install
counts. The payload is exactly `{ slug, type, tool, scope, version }` — no identifiers, no
paths, no IP stored (the server keeps only the country it derives from the request).
Events are deleted after 90 days. Nothing is sent for failed installs or `--dry-run`, and a
failing endpoint never affects an installation.

Opt out by setting the variable to any value:

```bash
SEEDR_NO_TELEMETRY=1 npx @danieldeusing/seedr add pdf
```

## License

MIT — see [LICENSE](./LICENSE).

#!/bin/sh
# Runs the frozen eval set against the skill in registry/skills/apple-design-principles.
# The update-check case needs Bash: add `--allow-tools Bash` where the eval sandbox accepts it.
# SKILL_DIR=<path> tests another copy of the skill (the optimizer's scratch repository).
# Usage: tests/skill-evals/apple-design-principles/run.sh [claude plugin eval options, e.g. --tag train]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../.." && pwd)
# The physical path: on macOS mktemp returns /var/..., a link to /private/var/..., and the read grant uses the real one.
plugin=$(cd "$(mktemp -d)" && pwd -P)/apple-design-principles
mkdir -p "$plugin/.claude-plugin" "$plugin/skills"
printf '{"name":"apple-design-principles","version":"0.0.0"}\n' > "$plugin/.claude-plugin/plugin.json"
cp -R "${SKILL_DIR:-$repo/registry/skills/apple-design-principles}" "$plugin/skills/apple-design-principles"
rm -rf "$plugin/skills/apple-design-principles/.git"
rm -f "$plugin/skills/apple-design-principles/item.json"
cp -R "$here/evals" "$plugin/evals"
# A run starts in an empty workspace; the prompt names the fixture by its absolute path.
for prompt in "$plugin"/evals/*/prompt.md; do
  sed -i '' "s|{{RESOURCES}}|$(dirname "$prompt")/resources|" "$prompt"
done
cd "$plugin"
exec claude plugin eval . --trust-plugin --no-publish --model sonnet --judge-model sonnet \
  --output-dir "$here/results/$(date +%Y%m%d-%H%M%S)" "$@"

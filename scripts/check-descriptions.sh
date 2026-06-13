#!/usr/bin/env bash
# Validate that all registry item.json files have both description and longDescription.
# Used as a git pre-commit hook and can also be run standalone.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || dirname "$(dirname "$0")")"
REGISTRY_DIR="$REPO_ROOT/registry"
errors=0

for item_json in "$REGISTRY_DIR"/*/item.json "$REGISTRY_DIR"/*/*/item.json; do
  [ -f "$item_json" ] || continue

  rel_path="${item_json#"$REPO_ROOT"/}"
  slug=$(python3 -c "import json; print(json.load(open('$item_json')).get('slug','?'))" 2>/dev/null || echo "?")

  # Check description
  has_desc=$(python3 -c "
import json, sys
d = json.load(open('$item_json'))
desc = d.get('description', '')
sys.exit(0 if desc.strip() else 1)
" 2>/dev/null && echo "yes" || echo "no")

  # Check longDescription (must exist, be at least 30 words, and contain markdown backticks)
  long_check=$(python3 -c "
import json, sys, re
d = json.load(open('$item_json'))
long = d.get('longDescription', '')
words = len(long.split())
if not long.strip():
    print('missing')
elif words < 30:
    print(f'short:{words}')
elif '\`' not in long:
    print('no_markdown')
else:
    print('ok')
" 2>/dev/null || echo "missing")

  if [ "$has_desc" = "no" ]; then
    echo "ERROR: $rel_path ($slug) is missing 'description'"
    errors=$((errors + 1))
  fi

  if [ "$long_check" = "missing" ]; then
    echo "ERROR: $rel_path ($slug) is missing 'longDescription'"
    errors=$((errors + 1))
  elif [[ "$long_check" == short:* ]]; then
    word_count="${long_check#short:}"
    echo "ERROR: $rel_path ($slug) longDescription too short ($word_count words, minimum 30)"
    errors=$((errors + 1))
  elif [ "$long_check" = "no_markdown" ]; then
    echo "ERROR: $rel_path ($slug) longDescription has no markdown formatting (use backticks for file names, commands, code identifiers)"
    errors=$((errors + 1))
  fi
done

if [ $errors -gt 0 ]; then
  echo ""
  echo "$errors description error(s) found. Every item.json must have 'description' and 'longDescription' (min 30 words, with markdown backticks)."
  echo "Run '/audit-descriptions' to generate missing descriptions."
  exit 1
fi

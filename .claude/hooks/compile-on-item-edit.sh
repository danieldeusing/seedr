#!/usr/bin/env bash
#
# PostToolUse hook: recompile the registry manifests after an item.json edit.
#
# The manifest.json files are generated from each registry/<type>/<slug>/item.json
# (see .claude/rules/registry-structure.md). Editing an item.json without running
# `pnpm compile` leaves the manifests stale, which the web app and CLI then serve.
# This hook closes that gap automatically whenever an item.json is written.
#
# Reads the PostToolUse payload on stdin, runs only when the edited path is a
# registry item.json, and is a no-op for every other file.

input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

case "$file_path" in
  */registry/*/*/item.json)
    cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
    if pnpm compile >/tmp/seedr-compile.log 2>&1; then
      echo "Recompiled registry manifests (item.json changed)."
    else
      echo "pnpm compile failed after editing $file_path — see /tmp/seedr-compile.log" >&2
      exit 2
    fi
    ;;
esac

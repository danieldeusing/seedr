#!/bin/bash
# Claude Code hook: update agentwatch boards with session status.
# Writes to both the global board (~/.config/agentwatch) and the
# project board (<project-root>/.agents/agentwatch).
# Events: SessionStart, UserPromptSubmit, PreToolUse, PermissionRequest,
#         PostToolUse, Stop, TaskCompleted, SessionEnd

set -uo pipefail

input=$(cat)
event=$(echo "$input" | jq -r '.hook_event_name')
session_id=$(echo "$input" | jq -r '.session_id')
cwd=$(echo "$input" | jq -r '.cwd')

# Detect project root (supports bare repos, sibling worktrees, standard repos)
project_root() {
  local git_common
  git_common=$(cd "$cwd" && git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || return 1

  if [[ "$git_common" != */.git ]]; then
    # Bare repo or similar: parent of git dir is the project root
    echo "${git_common%/*}"
    return
  fi

  # Standard .git dir: parent of .git is the main checkout
  local repo_root repo_parent wt_root
  repo_root="${git_common%/.git}"
  repo_parent=$(dirname "$repo_root")
  wt_root=$(cd "$cwd" && git rev-parse --show-toplevel 2>/dev/null) || { echo "$repo_root"; return; }

  # Detect sibling-worktree layout: main checkout and linked worktrees
  # live side-by-side under a shared project directory.
  # e.g. project/master/.git + project/playground/.git(file)

  # Case: cwd is inside a linked worktree that's a sibling of the main checkout
  if [[ "$(dirname "$wt_root")" == "$repo_parent" && "$wt_root" != "$repo_root" ]]; then
    echo "$repo_parent"
    return
  fi

  # Case: cwd is inside the main checkout — check if any linked worktree is a sibling
  if [[ "$wt_root" == "$repo_root" && -d "$repo_root/.git/worktrees" ]]; then
    local wt_meta
    for wt_meta in "$repo_root/.git/worktrees"/*/; do
      [[ -f "${wt_meta}gitdir" ]] || continue
      local wt_gitfile
      wt_gitfile=$(cat "${wt_meta}gitdir" 2>/dev/null) || continue
      if [[ "$(dirname "$(dirname "$wt_gitfile")")" == "$repo_parent" ]]; then
        echo "$repo_parent"
        return
      fi
    done
  fi

  echo "$repo_root"
}

PROJECT_ROOT=$(project_root) || PROJECT_ROOT=""

# Session tracking
GLOBAL_SESSIONS="$HOME/.config/agentwatch/.sessions"
PROJECT_SESSIONS="${PROJECT_ROOT:+$PROJECT_ROOT/.agents/agentwatch/.sessions}"

# Global board (always)
aw() {
  agentwatch --no-color "$@" 2>/dev/null || true
}

# Project board (silently skips if no project root)
aw_project() {
  if [[ -z "$PROJECT_ROOT" ]]; then return 0; fi
  agentwatch --dir "$PROJECT_ROOT" --no-color "$@" 2>/dev/null || true
}

get_task_id() {
  local file="$1/$session_id"
  if [[ -f "$file" ]]; then cat "$file"; else echo ""; fi
}

save_task_id() {
  local dir="$1" id="$2"
  echo -n "$id" > "$dir/$session_id"
  if [[ -n "${ITERM_SESSION_ID:-}" ]]; then
    echo -n "$ITERM_SESSION_ID" > "$dir/${id}.iterm"
  fi
}

# Derive label from branch name or worktree dir
worktree_label() {
  local branch
  branch=$(cd "$cwd" && git rev-parse --abbrev-ref HEAD 2>/dev/null) || true
  if [[ -n "$branch" && "$branch" != "HEAD" ]]; then
    echo "$branch"
  else
    basename "$cwd"
  fi
}

# Project name from root dir
project_name() {
  if [[ -n "$PROJECT_ROOT" ]]; then
    basename "$PROJECT_ROOT"
  else
    basename "$cwd"
  fi
}

# Map branch name to a consistent priority for color coding in TUI
branch_priority() {
  local priorities=(critical high medium low)
  local hash
  hash=$(printf '%s' "$1" | cksum | awk '{print $1}')
  echo "${priorities[$((hash % 4))]}"
}

case "$event" in
  SessionStart)
    mkdir -p "$GLOBAL_SESSIONS"
    if [[ -n "$PROJECT_SESSIONS" ]]; then mkdir -p "$PROJECT_SESSIONS"; fi

    label=$(worktree_label)
    project=$(project_name)
    priority=$(branch_priority "$label")
    title="${project}/${label}"

    # Global board
    task_id=$(get_task_id "$GLOBAL_SESSIONS")
    if [[ -n "$task_id" ]]; then
      aw move "$task_id" "In Progress"
    else
      output=$(aw create "$title" --status Idle --tags "$project" --priority "$priority" --json)
      task_id=$(echo "$output" | jq -r '.id // empty' 2>/dev/null)
      if [[ -n "$task_id" ]]; then save_task_id "$GLOBAL_SESSIONS" "$task_id"; fi
    fi

    # Project board
    if [[ -n "$PROJECT_SESSIONS" ]]; then
      ptask_id=$(get_task_id "$PROJECT_SESSIONS")
      if [[ -n "$ptask_id" ]]; then
        aw_project move "$ptask_id" "In Progress"
      else
        poutput=$(aw_project create "$label" --status Idle --tags "$label" --priority "$priority" --json)
        ptask_id=$(echo "$poutput" | jq -r '.id // empty' 2>/dev/null)
        if [[ -n "$ptask_id" ]]; then save_task_id "$PROJECT_SESSIONS" "$ptask_id"; fi
      fi
    fi
    ;;

  UserPromptSubmit)
    prompt=$(echo "$input" | jq -r '.prompt // empty' | head -c 300)

    task_id=$(get_task_id "$GLOBAL_SESSIONS")
    if [[ -n "$task_id" ]]; then
      aw edit "$task_id" --release
      if [[ -n "$prompt" ]]; then aw edit "$task_id" --body "$prompt"; fi
      aw move "$task_id" "In Progress"
    fi

    if [[ -n "$PROJECT_SESSIONS" ]]; then
      ptask_id=$(get_task_id "$PROJECT_SESSIONS")
      if [[ -n "$ptask_id" ]]; then
        aw_project edit "$ptask_id" --release
        if [[ -n "$prompt" ]]; then aw_project edit "$ptask_id" --body "$prompt"; fi
        aw_project move "$ptask_id" "In Progress"
      fi
    fi
    ;;

  PreToolUse)
    task_id=$(get_task_id "$GLOBAL_SESSIONS")
    ptask_id=""
    if [[ -n "$PROJECT_SESSIONS" ]]; then ptask_id=$(get_task_id "$PROJECT_SESSIONS"); fi
    if [[ -z "$task_id" && -z "$ptask_id" ]]; then exit 0; fi

    tool_name=$(echo "$input" | jq -r '.tool_name // empty')
    case "$tool_name" in
      Bash)   detail=$(echo "$input" | jq -r '.tool_input.command // empty' | head -1 | cut -c1-60) ;;
      Write|Read|Edit) detail=$(echo "$input" | jq -r '.tool_input.file_path // empty' | sed "s|$HOME|~|") ;;
      Grep|Glob) detail=$(echo "$input" | jq -r '.tool_input.pattern // empty') ;;
      Task)   detail=$(echo "$input" | jq -r '.tool_input.description // empty') ;;
      *)      detail="" ;;
    esac

    if [[ -n "$tool_name" && -n "$task_id" ]]; then
      aw edit "$task_id" --claim "${tool_name}: ${detail}"
      current=$(agentwatch show "$task_id" --no-color --json 2>/dev/null | jq -r '.status // empty')
      if [[ "$current" != "In Progress" ]]; then aw move "$task_id" "In Progress"; fi
    fi
    if [[ -n "$tool_name" && -n "$ptask_id" ]]; then
      aw_project edit "$ptask_id" --claim "${tool_name}: ${detail}"
      current=$(agentwatch --dir "$PROJECT_ROOT" show "$ptask_id" --no-color --json 2>/dev/null | jq -r '.status // empty')
      if [[ "$current" != "In Progress" ]]; then aw_project move "$ptask_id" "In Progress"; fi
    fi
    ;;

  PermissionRequest)
    task_id=$(get_task_id "$GLOBAL_SESSIONS")
    if [[ -n "$task_id" ]]; then
      aw edit "$task_id" --release
      aw move "$task_id" PermissionRequest
    fi

    if [[ -n "$PROJECT_SESSIONS" ]]; then
      ptask_id=$(get_task_id "$PROJECT_SESSIONS")
      if [[ -n "$ptask_id" ]]; then
        aw_project edit "$ptask_id" --release
        aw_project move "$ptask_id" PermissionRequest
      fi
    fi
    ;;

  PostToolUse)
    exit 0
    ;;

  Stop|TaskCompleted)
    task_id=$(get_task_id "$GLOBAL_SESSIONS")
    if [[ -n "$task_id" ]]; then
      aw edit "$task_id" --release
      aw move "$task_id" Waiting
    fi

    if [[ -n "$PROJECT_SESSIONS" ]]; then
      ptask_id=$(get_task_id "$PROJECT_SESSIONS")
      if [[ -n "$ptask_id" ]]; then
        aw_project edit "$ptask_id" --release
        aw_project move "$ptask_id" Waiting
      fi
    fi
    ;;

  SessionEnd)
    task_id=$(get_task_id "$GLOBAL_SESSIONS")
    if [[ -n "$task_id" ]]; then
      aw delete "$task_id" --yes
      rm -f "$GLOBAL_SESSIONS/$session_id" "$GLOBAL_SESSIONS/${task_id}.iterm"
    fi

    if [[ -n "$PROJECT_SESSIONS" ]]; then
      ptask_id=$(get_task_id "$PROJECT_SESSIONS")
      if [[ -n "$ptask_id" ]]; then
        aw_project delete "$ptask_id" --yes
        rm -f "$PROJECT_SESSIONS/$session_id" "$PROJECT_SESSIONS/${ptask_id}.iterm"
      fi
    fi
    ;;

  *)
    exit 0
    ;;
esac

#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Project PreToolUse Security Guard
# ──────────────────────────────────────────────────────────────
# Project-level security hook. Complements the global hook at
# ~/.claude/hooks/security-guard.sh which runs FIRST and handles
# universal threats (reverse shells, /dev/tcp, privilege escalation
# via sudo/doas, mkfs/fdisk, download-and-execute, encoding bypass,
# LD_PRELOAD injection, git config abuse, credential file reads, etc.)
#
# This hook adds PROJECT-SPECIFIC checks not in the global hook:
#   1. Destructive ops not in global (wipefs, shred broadly, blkdiscard)
#   2. Data exfiltration (curl POST, netcat, DNS exfil, paste services)
#   3. Code injection (eval broadly, hex obfuscation)
#   4. System modification (services, cron, users, firewall, kernel)
#   5. macOS-specific (osascript broadly, keychain extras, system defaults)
#   6. Privilege escalation extras (su, chmod 666)
#   7. Dangerous git ops (force push, checkout --, restore, reset --hard,
#      clean -f, stash drop/clear, branch -D, remote hijack, filter-branch)
#   8. Package publishing (npm/cargo/gem/twine publish)
#   9. Database destructive ops (DROP, TRUNCATE, DELETE w/o WHERE, FLUSH)
#  10. Cloud CLI destructive ops (AWS/GCP/Azure delete/destroy)
#  11. Container destructive ops (docker prune, kubectl delete)
#  12. Infrastructure destructive ops (terraform destroy, state rm)
#  13. rm / .env outside project (project-aware)
#  14. Redirect to sensitive paths
#  15. Sensitive file Read/Glob/Write/Edit outside project (SENS regex)
#  16. Auto-approve safe developer workflow commands

set -euo pipefail
trap 'echo "security-guard.sh crashed at line $LINENO (tool: ${tool_name:-unknown}, path: ${fp:-n/a})" >&2' ERR

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name')
project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
project_dir=$(cd "$project_dir" 2>/dev/null && pwd -P)
SETTINGS_FILE="${project_dir}/.claude/settings.local.json"
PROJECT_SETTINGS="${project_dir}/.claude/settings.json"

# ── Helpers ──────────────────────────────────────────────────

deny_with() {
  echo "$1" >&2
  jq -n --arg r "$1" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

allow_with() {
  jq -n --arg r "${1:-Safe}" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",permissionDecisionReason:$r}}'
  exit 0
}

is_inside_project() {
  local p="$1"
  [[ "$p" != /* ]] && p="${project_dir}/${p}"
  local dir base resolved
  dir=$(dirname "$p")
  base=$(basename "$p")
  if [[ -d "$dir" ]]; then
    resolved="$(cd "$dir" && pwd -P)/${base}"
  else
    resolved="$p"
  fi
  [[ "$resolved" == "${project_dir}"/* || "$resolved" == "${project_dir}" ]]
}

add_to_allow_list() {
  local pattern="$1"
  if [[ ! -f "$SETTINGS_FILE" ]]; then
    mkdir -p "$(dirname "$SETTINGS_FILE")"
    printf '{"permissions":{"allow":[]}}\n' > "$SETTINGS_FILE"
  fi
  if jq -e --arg p "$pattern" '(.permissions.allow // []) | any(. == $p)' \
       "$SETTINGS_FILE" >/dev/null 2>&1; then
    return 0
  fi
  jq --arg p "$pattern" \
    '.permissions.allow = ((.permissions.allow // []) + [$p])' \
    "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" \
    && mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
}

# ── Sensitive path regex (shared by Read/Glob/Write/Edit) ────
# Matches credential dirs, key files, shell histories, browser
# stores, crypto wallets, package manager tokens, and system paths.

SENS=''
# Credential directories
SENS+='/(\.ssh|\.gnupg|\.gpg|\.aws|\.azure|\.kube|\.docker'
SENS+='|\.terraform\.d|\.password-store|\.1password|\.op)/'
# Config directories with tokens
SENS+='|/\.config/(gcloud|gh|op|stripe|vercel|netlify|firebase'
SENS+='|solana|age|Bitwarden|keepassxc|lastpass|ngrok|railway|supabase|Postman)/'
# Sensitive file extensions
SENS+='|\.(env|pem|key|p12|pfx|jks|keystore|secret|password|token|ovpn|kdbx|kdb)(\.[^/]*)?$'
# Specific credential files
SENS+='|/(\.pgpass|\.my\.cnf|\.mylogin\.cnf|\.netrc|\.pypirc|\.npmrc|\.yarnrc'
SENS+='|\.boto|\.s3cfg|\.vault-token|\.consul-token|\.gitlab-token'
SENS+='|\.git-credentials|\.gitcredentials|\.terraformrc)$'
# Package manager credential paths
SENS+='|/\.cargo/credentials|/\.gem/credentials|/\.composer/auth\.json'
SENS+='|/\.gradle/gradle\.properties|/\.m2/settings'
SENS+='|/\.nuget/NuGet'
# Shell history files
SENS+='|/\.(bash_history|zsh_history|sh_history|python_history'
SENS+='|node_repl_history|mysql_history|psql_history'
SENS+='|irb_history|pry_history|lesshst|viminfo|dbshell)$'
SENS+='|/\.mongosh/'
# Browser credential stores
SENS+='|(Chrome|Chromium|Brave|Firefox|Safari|microsoft-edge|Arc)'
SENS+='.*(Login Data|Cookies|Web Data|key[34]\.db|logins\.json|cookies\.sqlite)'
# macOS Keychains and cookies
SENS+='|Library/Keychains/|Library/Cookies/'
# Cryptocurrency wallets
SENS+='|/(\.bitcoin|\.ethereum|\.litecoin|\.electrum|\.bitmonero)/'
SENS+='|/\.config/(solana|Exodus|Ledger)/'
# System paths
SENS+='|^/(etc|usr|bin|sbin|var|opt|System|private/(etc|var))/'
# Process environment
SENS+='|^/proc/.*/environ'

# ── Only handle known tools ──────────────────────────────────
case "$tool_name" in
  Bash|Write|Edit|Read|Glob) ;;
  *) exit 0 ;;
esac

# ═══════════════════════════════════════════════════════════════
#  BASH
# ═══════════════════════════════════════════════════════════════
if [[ "$tool_name" == "Bash" ]]; then
  cmd=$(echo "$input" | jq -r '.tool_input.command // empty')
  [[ -z "$cmd" ]] && allow_with "Auto-approved: Bash (empty command)"
  base=$(echo "$cmd" | awk '{print $1}')

  # ── SECURITY CHECKS (always run, in priority order) ────────

  # ─── 1. Destructive disk/file commands ─────────────────────

  # mkfs, dd of=/dev/, fdisk, parted, fork bombs handled by global hook
  if echo "$cmd" | grep -qE '\b(wipefs|shred|blkdiscard)\b'; then
    deny_with "BLOCKED: Destructive disk operation"
  fi

  # ─── 2. Network exfiltration ───────────────────────────────

  # curl sending file content (@ prefix = read from file)
  if echo "$cmd" | grep -qE '\bcurl\b.*(-d\s*@|--data(-binary|-raw|-urlencode)?\s*@|--upload-file\s|-T\s)'; then
    deny_with "BLOCKED: curl sending file content to remote server"
  fi

  # wget --post-file/--post-data handled by global hook

  # Piping data to network tools
  if echo "$cmd" | grep -qE '\|\s*(curl|wget|nc|ncat|netcat|socat|telnet)\b'; then
    deny_with "BLOCKED: Piping data to network tool"
  fi

  # Process substitution to network tools
  if echo "$cmd" | grep -qE '>\(\s*(curl|wget|nc|socat)\b'; then
    deny_with "BLOCKED: Redirecting data to network tool"
  fi

  # Raw network tools (rarely needed in dev workflows)
  if echo "$cmd" | grep -qE '\b(nc|ncat|netcat|socat|telnet)\b'; then
    deny_with "BLOCKED: Raw network tool"
  fi

  # SSH tunnels
  if echo "$cmd" | grep -qE '\bssh\b.*\s-[a-zA-Z]*[RLD]'; then
    deny_with "BLOCKED: SSH tunnel creation"
  fi

  # Known exfiltration / paste services
  if echo "$cmd" | grep -qE '(ngrok\.io|requestbin|webhook\.site|pipedream\.net|burpcollaborator|hookbin\.com|beeceptor\.com|requestcatcher|canarytokens|0x0\.st|sprunge\.us|termbin\.com|transfer\.sh|file\.io|temp\.sh|paste\.rs|ix\.io|dpaste\.)'; then
    deny_with "BLOCKED: Known exfiltration/paste service URL"
  fi

  # DNS exfiltration (dynamic data in DNS queries)
  if echo "$cmd" | grep -qE '\b(dig|nslookup|host)\b.*(\$\(|`)'; then
    deny_with "BLOCKED: DNS query with dynamic data (exfiltration risk)"
  fi

  # curl/wget embedding file/encoded content
  if echo "$cmd" | grep -qE '\b(curl|wget)\b.*\$\((cat|base64|xxd)\b'; then
    deny_with "BLOCKED: Network request embedding file content"
  fi

  # Cloud CLI data uploads
  if echo "$cmd" | grep -qE '\baws\s+s3\s+(cp|sync|mv)\b.*s3://'; then
    deny_with "BLOCKED: AWS S3 data upload"
  fi

  if echo "$cmd" | grep -qE '\b(gsutil|gcloud\s+storage)\s+(cp|rsync)\b.*gs://'; then
    deny_with "BLOCKED: Google Cloud Storage upload"
  fi

  if echo "$cmd" | grep -qE '\baz\s+storage\s+blob\s+upload'; then
    deny_with "BLOCKED: Azure Blob Storage upload"
  fi

  # ─── 3. Code injection / obfuscation ───────────────────────

  # curl|sh handled by global hook (broader: includes python/perl/ruby/node)

  # Encoded command execution (global only matches direct pipe, we match with args in between)
  if echo "$cmd" | grep -qE 'base64\s+(-d|--decode).*\|\s*(ba)?sh\b'; then
    deny_with "BLOCKED: Base64-encoded command execution"
  fi

  if echo "$cmd" | grep -qE 'xxd\s+-r.*\|\s*(ba)?sh\b'; then
    deny_with "BLOCKED: Hex-encoded command execution"
  fi

  # eval is a code injection vector (global only blocks eval+$(), we block all eval)
  if echo "$cmd" | grep -qE '\beval\b\s'; then
    deny_with "BLOCKED: eval command (code injection risk)"
  fi

  # Multiple hex escapes = likely obfuscated command
  if echo "$cmd" | grep -qE '\\x[0-9a-fA-F]{2}.*\\x[0-9a-fA-F]{2}.*\\x[0-9a-fA-F]{2}.*\\x[0-9a-fA-F]{2}'; then
    deny_with "BLOCKED: Obfuscated command (hex escape sequences)"
  fi

  # ─── 4. System modification ────────────────────────────────

  if echo "$cmd" | grep -qE '\b(systemctl|service)\b\s+(start|stop|restart|enable|disable|mask)\b'; then
    deny_with "BLOCKED: System service modification"
  fi

  if echo "$cmd" | grep -qE '\blaunchctl\b\s+(load|unload|submit|bootstrap|bootout|enable|disable)\b'; then
    deny_with "BLOCKED: macOS service management (launchctl)"
  fi

  if echo "$cmd" | grep -qE '\b(crontab|atq?|batch)\b'; then
    deny_with "BLOCKED: Scheduled task modification"
  fi

  if echo "$cmd" | grep -qE '\b(useradd|adduser|usermod|userdel|deluser|groupadd|addgroup|passwd|visudo|chsh|chfn|dscl)\b'; then
    deny_with "BLOCKED: User/group management command"
  fi

  if echo "$cmd" | grep -qE '\b(iptables|ip6tables|nftables|ufw|pfctl)\b'; then
    deny_with "BLOCKED: Firewall rule modification"
  fi

  # fdisk, parted handled by global hook
  if echo "$cmd" | grep -qE '\b(mount|umount|gdisk|mdadm)\b'; then
    deny_with "BLOCKED: Disk/partition manipulation"
  fi

  if echo "$cmd" | grep -qE '\b(modprobe|insmod|rmmod|sysctl)\b'; then
    deny_with "BLOCKED: Kernel module/parameter modification"
  fi

  if echo "$cmd" | grep -qE '\b(shutdown|reboot|halt|poweroff)\b'; then
    deny_with "BLOCKED: System shutdown/reboot"
  fi

  # ─── 5. macOS-specific ─────────────────────────────────────

  if echo "$cmd" | grep -qE '\bosascript\b'; then
    deny_with "BLOCKED: AppleScript (keychain/UI scripting access)"
  fi

  if echo "$cmd" | grep -qE '\bsecurity\b\s+(find-generic-password|find-internet-password|dump-keychain|unlock-keychain|delete-keychain|add-trusted-cert|export|import)\b'; then
    deny_with "BLOCKED: macOS Keychain/security command"
  fi

  if echo "$cmd" | grep -qE '\b(csrutil|spctl|nvram|bless|networksetup)\b'; then
    deny_with "BLOCKED: macOS system security modification"
  fi

  if echo "$cmd" | grep -qE '\bdefaults\b\s+write\s+(com\.apple\.|NSGlobal|/Library/)'; then
    deny_with "BLOCKED: macOS system defaults modification"
  fi

  # ─── 6. Privilege escalation ───────────────────────────────

  # sudo/doas/pkexec, chmod +s, chmod 777 handled by global hook

  if echo "$cmd" | grep -qE '\bsu\b\s+\S'; then
    deny_with "BLOCKED: su (user switching)"
  fi

  if echo "$cmd" | grep -qE '\bchmod\b\s+(-[a-zA-Z]*\s+)*666\b'; then
    deny_with "BLOCKED: World-writable permission (666)"
  fi

  # ─── 7. Git dangerous operations ───────────────────────────

  if echo "$cmd" | grep -qE '\bgit\b\s+push\b.*\s(-f|--force)\b' && \
     ! echo "$cmd" | grep -qE '--force-with-lease'; then
    deny_with "BLOCKED: git force push (use --force-with-lease)"
  fi

  if echo "$cmd" | grep -qE '\bgit\b\s+push\b.*\s(-d|--delete)\s+(main|master)\b'; then
    deny_with "BLOCKED: Deleting remote main/master branch"
  fi

  if echo "$cmd" | grep -qE '\bgit\b\s+push\b.*\s+\S+\s+:(main|master)\b'; then
    deny_with "BLOCKED: Deleting remote main/master branch"
  fi

  if echo "$cmd" | grep -qE '\bgit\b\s+filter-branch\b'; then
    deny_with "BLOCKED: git filter-branch (history rewriting)"
  fi

  if echo "$cmd" | grep -qE '\bgit\b\s+remote\s+(add|set-url)\b'; then
    deny_with "BLOCKED: git remote modification (redirect risk)"
  fi

  # git checkout -- (discards unstaged changes to paths)
  if echo "$cmd" | grep -qE '\bgit\b\s+checkout\s+.*--\s'; then
    deny_with "BLOCKED: git checkout -- (discards unstaged changes)"
  fi

  # git checkout . (discards all unstaged changes)
  if echo "$cmd" | grep -qE '\bgit\b\s+checkout\s+\.(\s|$)'; then
    deny_with "BLOCKED: git checkout . (discards all unstaged changes)"
  fi

  # git checkout -f/--force (force checkout, may overwrite work)
  if echo "$cmd" | grep -qE '\bgit\b\s+checkout\s+(-f|--force)\b'; then
    deny_with "BLOCKED: git checkout --force (may overwrite unstaged work)"
  fi

  # git restore without --staged discards working tree changes
  if echo "$cmd" | grep -qE '\bgit\b\s+restore\b'; then
    if echo "$cmd" | grep -qE '\bgit\b\s+restore\b.*--worktree'; then
      deny_with "BLOCKED: git restore --worktree (discards unstaged changes)"
    elif ! echo "$cmd" | grep -qE '\bgit\b\s+restore\b.*--staged'; then
      deny_with "BLOCKED: git restore (discards unstaged changes; use --staged to unstage only)"
    fi
  fi

  # git reset --hard (destroys all uncommitted work)
  if echo "$cmd" | grep -qE '\bgit\b\s+reset\s+--hard\b'; then
    deny_with "BLOCKED: git reset --hard (destroys all uncommitted work)"
  fi

  # git clean -f (permanently removes untracked files)
  if echo "$cmd" | grep -qE '\bgit\b\s+clean\b.*-[a-zA-Z]*f'; then
    deny_with "BLOCKED: git clean -f (permanently removes untracked files)"
  fi

  # git stash drop/clear (destroys saved changes)
  if echo "$cmd" | grep -qE '\bgit\b\s+stash\s+(drop|clear)\b'; then
    deny_with "BLOCKED: git stash drop/clear (destroys saved changes)"
  fi

  # git branch -D (force delete, even if not merged)
  if echo "$cmd" | grep -qE '\bgit\b\s+branch\s+-D\b'; then
    deny_with "BLOCKED: git branch -D (force-deletes potentially unmerged branch)"
  fi

  # ─── 8. Package publishing ─────────────────────────────────

  if echo "$cmd" | grep -qE '\b(npm|yarn|pnpm)\s+publish\b|\bcargo\s+publish\b|\bgem\s+push\b|\btwine\s+upload\b|\bpoetry\s+publish\b'; then
    deny_with "BLOCKED: Package publishing (data exfiltration risk)"
  fi

  # ─── 9. Database destructive operations ────────────────────

  # SQL destructive commands (via psql, mysql, sqlite3, or inline)
  if echo "$cmd" | grep -qiE '\b(DROP|TRUNCATE)\s+(DATABASE|TABLE|INDEX|SCHEMA|VIEW|TRIGGER|FUNCTION|PROCEDURE)\b'; then
    deny_with "BLOCKED: Destructive SQL operation (DROP/TRUNCATE)"
  fi

  # DELETE FROM without WHERE clause (deletes all rows)
  if echo "$cmd" | grep -qiE '\bDELETE\s+FROM\b' && ! echo "$cmd" | grep -qiE '\bWHERE\b'; then
    deny_with "BLOCKED: DELETE FROM without WHERE clause (deletes all rows)"
  fi

  # Redis destructive commands
  if echo "$cmd" | grep -qiE '\b(redis-cli|redis)\b.*\b(FLUSHALL|FLUSHDB)\b'; then
    deny_with "BLOCKED: Redis FLUSHALL/FLUSHDB (destroys all data)"
  fi

  # MongoDB destructive commands
  if echo "$cmd" | grep -qiE '\b(mongosh?|mongo)\b.*\b(dropDatabase|\.drop\s*\()\b'; then
    deny_with "BLOCKED: MongoDB drop operation"
  fi

  # ─── 10. Cloud CLI destructive operations ──────────────────

  # AWS destructive operations
  if echo "$cmd" | grep -qE '\baws\b.*\b(delete-|terminate-|remove-|deregister-)'; then
    deny_with "BLOCKED: AWS destructive operation"
  fi

  # GCP destructive operations
  if echo "$cmd" | grep -qE '\bgcloud\b.*\bdelete\b'; then
    deny_with "BLOCKED: GCP destructive operation"
  fi

  # Azure destructive operations
  if echo "$cmd" | grep -qE '\baz\s+\S+\s+(delete|purge)\b'; then
    deny_with "BLOCKED: Azure destructive operation"
  fi

  # ─── 11. Container destructive operations ──────────────────

  # Docker prune operations (bulk removal)
  if echo "$cmd" | grep -qE '\bdocker\s+(system|container|image|volume|network)\s+prune\b'; then
    deny_with "BLOCKED: Docker prune operation (bulk removal)"
  fi

  # docker compose down --volumes (destroys persistent data)
  if echo "$cmd" | grep -qE '\bdocker\s+compose\s+down\b.*(-v|--volumes)\b'; then
    deny_with "BLOCKED: docker compose down --volumes (destroys persistent data)"
  fi

  # Kubernetes destructive operations on critical resources
  if echo "$cmd" | grep -qE '\bkubectl\s+delete\s+(namespace|ns|deployment|deploy|statefulset|sts|daemonset|ds|pv|pvc|secret|configmap|cm|service|svc|ingress|node)\b'; then
    deny_with "BLOCKED: kubectl delete (destructive cluster operation)"
  fi

  # kubectl delete --all (bulk deletion)
  if echo "$cmd" | grep -qE '\bkubectl\s+delete\b.*--all\b'; then
    deny_with "BLOCKED: kubectl delete --all (bulk deletion)"
  fi

  # ─── 12. Infrastructure destructive operations ─────────────

  # Terraform destroy
  if echo "$cmd" | grep -qE '\bterraform\s+destroy\b'; then
    deny_with "BLOCKED: terraform destroy (tears down infrastructure)"
  fi

  # Terraform state removal
  if echo "$cmd" | grep -qE '\bterraform\s+state\s+rm\b'; then
    deny_with "BLOCKED: terraform state rm (removes resource from state)"
  fi

  # Pulumi destroy
  if echo "$cmd" | grep -qE '\bpulumi\s+destroy\b'; then
    deny_with "BLOCKED: pulumi destroy (tears down infrastructure)"
  fi

  # ─── 13. rm outside project ────────────────────────────────

  if echo "$cmd" | grep -qE '(^|[;&|]\s*)rm\s'; then
    # Catch dangerous rm targets regardless of project
    if echo "$cmd" | grep -qE '\brm\b\s+.*(\s/\s*$|\s/\*|\s~/|\s~\s*$|\s\.\.\s|--no-preserve-root)'; then
      deny_with "BLOCKED: Destructive rm target (root/home/parent)"
    fi
    for word in $cmd; do
      [[ "$word" == -* || "$word" == "rm" ]] && continue
      [[ "$word" != /* ]] && continue
      [[ "$word" == /tmp/* || "$word" == /var/tmp/* ]] && continue
      if ! is_inside_project "$word"; then
        deny_with "BLOCKED: rm targets path outside project: ${word}"
      fi
    done
  fi

  # ─── 14. .env access outside project ──────────────────────

  if echo "$cmd" | grep -qE '\.env\b'; then
    for word in $cmd; do
      if [[ "$word" == /* && "$word" == */.env* ]]; then
        if ! is_inside_project "$word"; then
          deny_with "BLOCKED: .env access outside project: ${word}"
        fi
      fi
    done
  fi

  # ─── 15. Redirect to sensitive paths ──────────────────────

  if echo "$cmd" | grep -qE '(>|>>)\s*/(etc|boot|usr/(lib|bin)|sbin)/'; then
    deny_with "BLOCKED: Redirect to system path"
  fi

  if echo "$cmd" | grep -qE '(>|>>)\s*~?/\.(ssh|gnupg|aws|kube|docker)/'; then
    deny_with "BLOCKED: Redirect to sensitive directory"
  fi

  if echo "$cmd" | grep -qE '(>|>>)\s*~?/\.ssh/authorized_keys'; then
    deny_with "BLOCKED: SSH authorized_keys modification"
  fi

  # ── FAST PATH: already in allow list → normal flow ─────────

  case "$base" in
    npm|cargo|git|docker|kubectl|pip|pip3|yarn|pnpm|go|make|cmake|helm|terraform|gh|bun|deno|gradle|mvn)
      sub=$(echo "$cmd" | awk '{print $2}')
      check_pattern="Bash(${base} ${sub}"
      ;;
    *)
      check_pattern="Bash(${base} "
      ;;
  esac
  if grep -qF "$check_pattern" "$PROJECT_SETTINGS" 2>/dev/null || \
     grep -qF "$check_pattern" "$SETTINGS_FILE" 2>/dev/null; then
    allow_with "Already in allow list: ${base}"
  fi

  # ── AUTO-APPROVE safe commands + remember ──────────────────

  case "$base" in
    # Package managers / build tools (subcommand granularity)
    npm|yarn|pnpm|bun|cargo|go|make|cmake|gradle|mvn|deno|pip|pip3)
      sub=$(echo "$cmd" | awk '{print $2}')
      [[ -n "$sub" ]] && full_pattern="Bash(${base} ${sub}*)" || full_pattern="Bash(${base}*)"
      ;;

    # Git (dangerous ops already blocked above)
    git)
      sub=$(echo "$cmd" | awk '{print $2}')
      [[ -n "$sub" ]] && full_pattern="Bash(${base} ${sub}*)" || full_pattern="Bash(${base}*)"
      ;;

    # Container / infra tools (subcommand granularity)
    docker|kubectl|helm|terraform)
      sub=$(echo "$cmd" | awk '{print $2}')
      [[ -n "$sub" ]] && full_pattern="Bash(${base} ${sub}*)" || full_pattern="Bash(${base}*)"
      ;;

    # GitHub CLI
    gh)
      sub=$(echo "$cmd" | awk '{print $2}')
      [[ -n "$sub" ]] && full_pattern="Bash(${base} ${sub}*)" || full_pattern="Bash(${base}*)"
      ;;

    # Read-only / analysis tools
    ls|cat|head|tail|wc|file|stat|find|tree|du|df|realpath|dirname|basename)
      full_pattern="Bash(${base} *)"
      ;;

    # Introspection tools
    which|type|man|echo|printf|date|pwd|uname|id|whoami|hostname|uptime)
      full_pattern="Bash(${base} *)"
      ;;

    # Text processing
    grep|rg|fd|sed|awk|sort|uniq|cut|tr|diff|comm|jq|yq|xargs|column)
      full_pattern="Bash(${base} *)"
      ;;

    # Dev tools and compilers
    node|npx|tsc|eslint|prettier|vitest|jest|mocha)
      full_pattern="Bash(${base} *)"
      ;;

    python|python3|ruby|perl|java|javac|rustc|rustfmt|swift|swiftc)
      full_pattern="Bash(${base} *)"
      ;;

    gcc|g++|clang|clang++)
      full_pattern="Bash(${base} *)"
      ;;

    # File operations (rm already checked above)
    mkdir|cp|mv|touch|ln|rm|chmod|chown)
      full_pattern="Bash(${base} *)"
      ;;

    # Archive tools
    tar|zip|unzip|gzip|gunzip|bzip2|xz)
      full_pattern="Bash(${base} *)"
      ;;

    # macOS utilities
    open|pbcopy|pbpaste|say|clear|less|more)
      full_pattern="Bash(${base} *)"
      ;;

    # Unknown command → let normal permission flow decide
    *)
      exit 0
      ;;
  esac

  add_to_allow_list "$full_pattern"
  allow_with "Auto-approved: ${base}"
fi

# ═══════════════════════════════════════════════════════════════
#  READ / GLOB – block sensitive paths, auto-approve the rest
# ═══════════════════════════════════════════════════════════════
if [[ "$tool_name" == "Read" || "$tool_name" == "Glob" ]]; then
  if [[ "$tool_name" == "Read" ]]; then
    fp=$(echo "$input" | jq -r '.tool_input.file_path // empty')
  else
    fp=$(echo "$input" | jq -r '.tool_input.path // empty')
  fi
  [[ -z "$fp" ]] && allow_with "Auto-approved: ${tool_name} (no path)"

  if ! is_inside_project "$fp"; then
    if echo "$fp" | grep -qE "$SENS"; then
      deny_with "BLOCKED: ${tool_name} of sensitive path outside project: ${fp}"
    fi
  fi

  allow_with "Auto-approved: ${tool_name}"
fi

# ═══════════════════════════════════════════════════════════════
#  WRITE / EDIT – block sensitive paths outside project
# ═══════════════════════════════════════════════════════════════
if [[ "$tool_name" == "Write" || "$tool_name" == "Edit" ]]; then
  fp=$(echo "$input" | jq -r '.tool_input.file_path // empty')
  [[ -z "$fp" ]] && allow_with "Auto-approved: ${tool_name} (no path)"

  if ! is_inside_project "$fp"; then
    if echo "$fp" | grep -qE "$SENS"; then
      deny_with "BLOCKED: ${tool_name} to sensitive path outside project: ${fp}"
    fi
  fi

  allow_with "Auto-approved: ${tool_name}"
fi

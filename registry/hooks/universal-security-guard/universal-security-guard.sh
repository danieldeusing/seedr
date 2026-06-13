#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Global PreToolUse hook: universal security guard
# ═══════════════════════════════════════════════════════════════════
# Denies universally dangerous operations. Does NOT auto-approve.
# Safe commands exit silently → normal permission flow (ask user /
# check allow list).
#
# Coverage:
#   BASH       – destructive ops, reverse shells, exfiltration,
#                privilege escalation, persistence, injection,
#                encoding bypass, macOS attacks, git config abuse
#   WRITE/EDIT – system paths, credential dirs, key files,
#                persistence dirs, git hooks, wallets
#   READ       – SSH/GPG keys, cloud creds, crypto wallets,
#                browser data, shell histories, keychains,
#                password managers, AI/service tokens, terraform,
#                database creds, VPN configs, system secrets
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name')

deny_with() {
  jq -n --arg r "$1" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# ── Only check Bash, Write, Edit, Read ─────────────────────────
case "$tool_name" in
  Bash|Write|Edit|Read) ;;
  *) exit 0 ;;
esac

# ═══════════════════════════════════════════════════════════════
#  BASH
# ═══════════════════════════════════════════════════════════════
if [[ "$tool_name" == "Bash" ]]; then
  cmd=$(echo "$input" | jq -r '.tool_input.command // empty')
  [[ -z "$cmd" ]] && exit 0

  # ── Destructive filesystem operations ──────────────────────
  # rm on root / home / wildcard-all
  if grep -qE 'rm\s+(-[a-zA-Z]+\s+)*(/(\s|$|\*)|~(/|/?\*|\s|$)|\$HOME)' <<< "$cmd"; then
    deny_with "BLOCKED: Destructive rm on root or home directory"
  fi
  # dd/shred to device
  if grep -qE 'dd\s.*of=/dev/|shred\s+/dev/' <<< "$cmd"; then
    deny_with "BLOCKED: Disk write/destruction"
  fi
  # mkfs / fdisk / parted
  if grep -qE '(^|[;&|]\s*)(mkfs|fdisk|parted)\b' <<< "$cmd"; then
    deny_with "BLOCKED: Filesystem/partition manipulation"
  fi

  # ── Privilege escalation ───────────────────────────────────
  if grep -qE '(^|[;&|]\s*)(sudo|doas|pkexec)\s' <<< "$cmd"; then
    deny_with "BLOCKED: Privilege escalation (sudo/doas/pkexec)"
  fi
  # chmod: SUID/SGID bits or 777
  if grep -qE 'chmod\s+([ugo]*\+s|(-[a-zA-Z]+\s+)*([2467][0-7]{3}|777))\b' <<< "$cmd"; then
    deny_with "BLOCKED: Dangerous chmod (SUID/SGID/777)"
  fi
  # User/group manipulation
  if grep -qE '(^|[;&|]\s*)(useradd|usermod|adduser|groupadd|gpasswd)\b' <<< "$cmd"; then
    deny_with "BLOCKED: User/group manipulation"
  fi

  # ── Reverse shells & raw network access ────────────────────
  # Bash /dev/tcp and /dev/udp
  if grep -qE '/dev/(tcp|udp)/' <<< "$cmd"; then
    deny_with "BLOCKED: /dev/tcp or /dev/udp (reverse shell / raw network)"
  fi
  # netcat with exec
  if grep -qE '(nc|ncat|netcat)\s+(-e|-c|--exec|--sh-exec)\s' <<< "$cmd"; then
    deny_with "BLOCKED: Netcat with shell execution"
  fi
  # socat shell bridge
  if grep -qE 'socat\s+.*(EXEC.*TCP|TCP.*EXEC)' <<< "$cmd"; then
    deny_with "BLOCKED: Socat shell-to-network bridge"
  fi
  # mkfifo (reverse shell building block)
  if grep -qE 'mkfifo\s' <<< "$cmd"; then
    deny_with "BLOCKED: Named pipe creation (reverse shell component)"
  fi

  # ── Download-and-execute ───────────────────────────────────
  if grep -qE '(curl|wget)\s.*\|\s*(bash|sh|zsh|python[23]?|perl|ruby|node)\b' <<< "$cmd"; then
    deny_with "BLOCKED: Piped remote code execution"
  fi

  # ── Encoding bypass → shell execution ──────────────────────
  # base64/xxd/rev decode piped to shell
  if grep -qE '(base64\s+(-d|-D|--decode)|xxd\s+-r)\s*\|?\s*(bash|sh|zsh|python|perl)\b' <<< "$cmd"; then
    deny_with "BLOCKED: Decoded payload piped to shell"
  fi
  # eval with command substitution (obfuscation vector)
  if grep -qE 'eval\s+.*(\$\(|`)' <<< "$cmd"; then
    deny_with "BLOCKED: eval with command substitution"
  fi

  # ── Process / library injection ────────────────────────────
  if grep -qE '(LD_PRELOAD|LD_LIBRARY_PATH|DYLD_INSERT_LIBRARIES|DYLD_LIBRARY_PATH|DYLD_FRAMEWORK_PATH)\s*=' <<< "$cmd"; then
    deny_with "BLOCKED: Library injection via environment variable"
  fi
  if grep -qE 'gdb\s+(-p|--pid|attach)\s|lldb\s+(-p|--attach-pid)\s' <<< "$cmd"; then
    deny_with "BLOCKED: Debugger process attachment"
  fi

  # ── Persistence mechanisms ─────────────────────────────────
  # Crontab write (crontab -l is allowed)
  if grep -qE '(echo|printf|cat|tee).*\|\s*crontab|\bcrontab\s+(-[^l]|[^-\s])' <<< "$cmd"; then
    deny_with "BLOCKED: Crontab modification"
  fi
  if grep -qE '>>\s*/(etc/cron|var/spool/cron)' <<< "$cmd"; then
    deny_with "BLOCKED: Writing to cron directory"
  fi
  # macOS launchd
  if grep -qE 'launchctl\s+(load|bootstrap|enable|submit)\b' <<< "$cmd"; then
    deny_with "BLOCKED: macOS launchctl service loading"
  fi
  # systemd
  if grep -qE 'systemctl\s+(enable|daemon-reload)\b' <<< "$cmd"; then
    deny_with "BLOCKED: systemd service enable/reload"
  fi
  # at/batch scheduling
  if grep -qE '(^|[;&|]\s*)\bat\s+\S|batch\b' <<< "$cmd"; then
    deny_with "BLOCKED: Job scheduling via at/batch"
  fi

  # ── macOS-specific attacks ─────────────────────────────────
  # AppleScript (social engineering, keystroke injection)
  if grep -qE 'osascript\s+(-e|-)' <<< "$cmd"; then
    deny_with "BLOCKED: AppleScript execution via osascript"
  fi
  # Keychain access
  if grep -qE 'security\s+(find-generic-password|find-internet-password|dump-keychain|delete-keychain|unlock-keychain|export)\b' <<< "$cmd"; then
    deny_with "BLOCKED: macOS Keychain access"
  fi
  # macOS security features (Gatekeeper/SIP/TCC/user creation)
  if grep -qE 'spctl\s+--master-disable|csrutil\s+disable|sqlite3.*TCC\.db|tccutil\s+reset|dscl\s+\.\s+-(create|append|change|delete)\s+/(Users|Groups)/' <<< "$cmd"; then
    deny_with "BLOCKED: macOS security feature manipulation"
  fi
  # defaults write persistence (login hooks, auto-launch)
  if grep -qE 'defaults\s+write.*(LoginHook|loginwindow|AutoLaunchedApplicationDictionary)' <<< "$cmd"; then
    deny_with "BLOCKED: macOS login hook / launch persistence"
  fi
  # Network proxy/DNS hijacking
  if grep -qE 'networksetup\s+-(setdnsservers|setwebproxy|setsecurewebproxy|setautoproxyurl)\b' <<< "$cmd"; then
    deny_with "BLOCKED: Network proxy/DNS configuration change"
  fi

  # ── Git config attacks ─────────────────────────────────────
  if grep -qE 'git\s+config\s+.*(core\.(hooksPath|pager|editor|sshCommand)|credential\.(helper|store)|url\..*\.insteadOf|diff\.textconv|filter\.(clean|smudge))\b' <<< "$cmd"; then
    deny_with "BLOCKED: Dangerous git config modification"
  fi

  # ── Credential file access ─────────────────────────────────
  # SSH
  if grep -qE '\.ssh/(id_|authorized_keys|config)' <<< "$cmd"; then
    deny_with "BLOCKED: SSH credential/config access"
  fi
  # Cloud / container credentials
  if grep -qE '\.(aws/credentials|config/gcloud/(credentials|application_default|access_tokens)|azure/(accessTokens|msal_token)|kube/config|docker/config\.json)' <<< "$cmd"; then
    deny_with "BLOCKED: Cloud/container credential access"
  fi
  # Crypto wallets
  if grep -qE '/(\.bitcoin|\.ethereum|\.electrum|\.monero|\.solana|\.cardano|\.litecoin)/|wallet\.dat\b|\.config/solana/id\.json' <<< "$cmd"; then
    deny_with "BLOCKED: Cryptocurrency wallet access"
  fi
  # Reading other sensitive files via shell commands
  if grep -qE '(cat|less|more|head|tail|strings|xxd|hexdump)\s+.*(\.gnupg/|\.pgpass|\.my\.cnf|\.netrc|\.npmrc|\.pypirc|\.git-credentials|\.keychain|\.kdbx)\b' <<< "$cmd"; then
    deny_with "BLOCKED: Reading sensitive credential file via shell"
  fi
  # GPG secret key export
  if grep -qE 'gpg\s+--export-secret-keys' <<< "$cmd"; then
    deny_with "BLOCKED: GPG secret key export"
  fi

  # ── Data exfiltration via HTTP ─────────────────────────────
  if grep -qE 'curl\s.*(-d|--data|--data-binary|-F|--form|--upload-file|-T)\s.*\.(env|pem|key|secret|kdbx|pgpass|tfstate|keychain)\b' <<< "$cmd"; then
    deny_with "BLOCKED: Potential secret exfiltration via curl"
  fi
  if grep -qE 'wget\s+--post-(data|file)' <<< "$cmd"; then
    deny_with "BLOCKED: Potential data exfiltration via wget POST"
  fi

  # ── System directory writes ────────────────────────────────
  if grep -qE '(>|>>|tee)\s+/(etc|usr|bin|sbin|System)/' <<< "$cmd"; then
    deny_with "BLOCKED: Writing to system directory"
  fi
  if grep -qE '(>|>>|tee|cp|mv)\s+.*/Library/(LaunchAgents|LaunchDaemons)/' <<< "$cmd"; then
    deny_with "BLOCKED: Writing to LaunchAgents/LaunchDaemons"
  fi

  # ── Firewall / network manipulation ────────────────────────
  if grep -qE '(^|[;&|]\s*)(iptables|ip6tables|pfctl|nft)\s' <<< "$cmd"; then
    deny_with "BLOCKED: Firewall rule manipulation"
  fi

  # ── Kernel module manipulation ─────────────────────────────
  if grep -qE '(^|[;&|]\s*)(insmod|modprobe|rmmod)\s' <<< "$cmd"; then
    deny_with "BLOCKED: Kernel module manipulation"
  fi

  # ── History manipulation / covering tracks ──────────────────
  if grep -qE 'history\s+-c|HISTFILE\s*=\s*/dev/null|HISTSIZE\s*=\s*0|unset\s+HISTFILE|>\s*~/\..*history' <<< "$cmd"; then
    deny_with "BLOCKED: Shell history manipulation (covering tracks)"
  fi

  # ── Clipboard exfiltration ─────────────────────────────────
  if grep -qE '(pbpaste|xclip\s.*-o|xsel\s.*--output|wl-paste)\s*\|' <<< "$cmd"; then
    deny_with "BLOCKED: Clipboard content piped to another command"
  fi

  # ── Container escape ───────────────────────────────────────
  if grep -qE 'nsenter\s+-t\s+1\b|chroot\s+/host\b' <<< "$cmd"; then
    deny_with "BLOCKED: Container escape attempt"
  fi

  # ── Security service disable ───────────────────────────────
  if grep -qE 'setenforce\s+0|apparmor_parser\s+-R|systemctl\s+(stop|disable)\s+(apparmor|selinux|firewalld|fail2ban)\b' <<< "$cmd"; then
    deny_with "BLOCKED: Disabling security service"
  fi

  # ── Language runtime path hijacking ────────────────────────
  if grep -qE '(PYTHONPATH|NODE_OPTIONS|RUBYLIB|PERL5LIB|CLASSPATH)\s*=.*\b(python|node|ruby|perl|java)\b' <<< "$cmd"; then
    deny_with "BLOCKED: Language runtime path hijacking"
  fi

  # ── Fork bomb ──────────────────────────────────────────────
  if grep -qE ':\(\)\s*\{' <<< "$cmd"; then
    deny_with "BLOCKED: Possible fork bomb"
  fi

  # ── Redirect to block device ───────────────────────────────
  if grep -qE '>\s*/dev/(sd|hd|nvme|vd|loop|disk|rdisk)' <<< "$cmd"; then
    deny_with "BLOCKED: Redirect to block device"
  fi

  exit 0
fi

# ═══════════════════════════════════════════════════════════════
#  WRITE / EDIT – block system paths, credential dirs, keys
# ═══════════════════════════════════════════════════════════════
if [[ "$tool_name" == "Write" || "$tool_name" == "Edit" ]]; then
  fp=$(echo "$input" | jq -r '.tool_input.file_path // empty')
  [[ -z "$fp" ]] && exit 0

  # System paths
  if grep -qE '^/(etc|usr|bin|sbin|var|opt|System)/' <<< "$fp"; then
    deny_with "BLOCKED: ${tool_name} to system path: ${fp}"
  fi

  # Sensitive credential directories in home
  if grep -qE '/(\.ssh|\.gnupg|\.aws|\.azure|\.gcloud|\.kube|\.docker|\.oci|\.aliyun|\.config/gcloud|\.config/gh)/' <<< "$fp"; then
    deny_with "BLOCKED: ${tool_name} to credential directory: ${fp}"
  fi

  # Private key / keystore / password database files
  if grep -qE '\.(pem|key|p12|pfx|jks|keystore|kdbx|kdb)$' <<< "$fp"; then
    deny_with "BLOCKED: ${tool_name} to sensitive key/keystore file: ${fp}"
  fi

  # macOS Keychains
  if grep -qE '\.keychain(-db)?$|/Library/Keychains/' <<< "$fp"; then
    deny_with "BLOCKED: ${tool_name} to macOS Keychain: ${fp}"
  fi

  # LaunchAgents / LaunchDaemons (persistence)
  if grep -qE '/Library/(LaunchAgents|LaunchDaemons)/' <<< "$fp"; then
    deny_with "BLOCKED: ${tool_name} to LaunchAgents/LaunchDaemons: ${fp}"
  fi

  # Git hooks
  if grep -qE '/\.git/hooks/' <<< "$fp"; then
    deny_with "BLOCKED: ${tool_name} to git hooks directory: ${fp}"
  fi

  # Cron / systemd / init.d
  if grep -qE '/(cron\.|crontab|systemd/system/|init\.d/)' <<< "$fp"; then
    deny_with "BLOCKED: ${tool_name} to scheduled task config: ${fp}"
  fi

  # SSH authorized_keys
  if grep -qE '\.ssh/authorized_keys$' <<< "$fp"; then
    deny_with "BLOCKED: ${tool_name} to SSH authorized_keys: ${fp}"
  fi

  # Cryptocurrency wallets
  if grep -qE '/(\.bitcoin|\.ethereum|\.electrum|\.monero|\.solana|\.cardano|\.litecoin)/' <<< "$fp"; then
    deny_with "BLOCKED: ${tool_name} to cryptocurrency wallet: ${fp}"
  fi

  exit 0
fi

# ═══════════════════════════════════════════════════════════════
#  READ – block sensitive credential and private data files
# ═══════════════════════════════════════════════════════════════
if [[ "$tool_name" == "Read" ]]; then
  fp=$(echo "$input" | jq -r '.tool_input.file_path // empty')
  [[ -z "$fp" ]] && exit 0

  # ── SSH / GPG keys ─────────────────────────────────────────
  if grep -qE '\.ssh/(id_|config$|authorized_keys|known_hosts|.*\.pem$)|\.gnupg/(secring|private-keys-v1\.d|trustdb|pubring)' <<< "$fp"; then
    deny_with "BLOCKED: Reading SSH/GPG credentials: ${fp}"
  fi

  # ── Cloud provider credentials ─────────────────────────────
  if grep -qE '\.aws/(credentials|sso/cache|cli/cache)|\.config/gcloud/(credentials|application_default|access_tokens|legacy_credentials)|\.azure/(accessTokens|msal_token_cache|service_principal)|\.kube/config|\.docker/(config\.json|key\.pem)|\.oci/(config|.*\.pem)|\.aliyun/config|\.config/(doctl/config|hcloud/cli|linode-cli)' <<< "$fp"; then
    deny_with "BLOCKED: Reading cloud/container credentials: ${fp}"
  fi

  # ── Git / CI/CD / package manager credentials ──────────────
  if grep -qE '(\.git-credentials|\.gitcookies|\.netrc)$|\.config/(gh/hosts\.yml|git/credentials|glab-cli/)|\.npmrc$|\.yarnrc$|\.pypirc$|\.gem/credentials|\.cargo/credentials|\.composer/auth\.json|\.m2/settings\.xml|\.gradle/gradle\.properties' <<< "$fp"; then
    deny_with "BLOCKED: Reading developer tool credentials: ${fp}"
  fi

  # ── Browser passwords / cookies ────────────────────────────
  if grep -qE '/(Google/Chrome|Firefox|Microsoft Edge|BraveSoftware|Chromium)/.*(Login Data|Cookies|Web Data|key4\.db|logins\.json|cert9\.db|Local State)|/Library/Cookies/' <<< "$fp"; then
    deny_with "BLOCKED: Reading browser credentials/cookies: ${fp}"
  fi

  # ── Cryptocurrency wallets ─────────────────────────────────
  if grep -qE '/(\.bitcoin|\.ethereum|\.electrum|\.monero|\.solana|\.cardano|\.litecoin)/|wallet\.dat$|\.config/solana/id\.json' <<< "$fp"; then
    deny_with "BLOCKED: Reading cryptocurrency wallet: ${fp}"
  fi

  # ── Password managers ──────────────────────────────────────
  if grep -qE '\.kdbx$|\.kdb$|\.password-store/|/keyrings/.*\.(keyring|db)$|\.config/sops/age/keys\.txt' <<< "$fp"; then
    deny_with "BLOCKED: Reading password manager data: ${fp}"
  fi

  # ── AI tool / service CLI credentials ──────────────────────
  if grep -qE '\.claude/credentials|\.config/github-copilot/(hosts|apps)|\.codex/auth|\.pulumi/credentials|\.config/(configstore/firebase|stripe/config)|\.supabase/access-token|\.vercel/auth|\.netlify/config|\.fly/(config|access-token)|\.twilio-cli/config' <<< "$fp"; then
    deny_with "BLOCKED: Reading AI/service credentials: ${fp}"
  fi

  # ── Terraform state & credentials ──────────────────────────
  if grep -qE '\.tfstate(\.backup)?$|\.terraform\.d/credentials|\.terraformrc$' <<< "$fp"; then
    deny_with "BLOCKED: Reading Terraform state/credentials: ${fp}"
  fi

  # ── Shell / REPL history files ─────────────────────────────
  if grep -qE '/(\.bash_history|\.zsh_history|\.zhistory|\.sh_history|\.fish_history|\.python_history|\.node_repl_history|\.psql_history|\.mysql_history|\.sqlite_history|\.rediscli_history|\.mongosh_history|\.dbshell|\.irb_history|\.pry_history|\.Rhistory|\.scala_history)$' <<< "$fp"; then
    deny_with "BLOCKED: Reading shell/REPL history (may contain secrets): ${fp}"
  fi

  # ── Database credential files ──────────────────────────────
  if grep -qE '/(\.pgpass|\.my\.cnf|\.mylogin\.cnf|\.cassandra/cqlshrc)$' <<< "$fp"; then
    deny_with "BLOCKED: Reading database credentials: ${fp}"
  fi

  # ── macOS Keychain / sensitive app data ────────────────────
  if grep -qE '\.keychain(-db)?$|/Library/Keychains/|/Library/(Messages|Mail|Accounts)/|/com\.apple\.TCC/TCC\.db' <<< "$fp"; then
    deny_with "BLOCKED: Reading macOS Keychain/private data: ${fp}"
  fi

  # ── System secrets / SSL keys / VPN configs ────────────────
  if grep -qE '^/(etc/(shadow|gshadow|master\.passwd|sudoers)|private/var/db/(SystemKey|dslocal))|/ssl/private/|/pki/tls/private/|/letsencrypt/(live|archive)/.*privkey|mkcert.*rootCA-key|/wireguard/.*\.conf$|/openvpn/.*\.(conf|ovpn|key)$' <<< "$fp"; then
    deny_with "BLOCKED: Reading sensitive system/VPN/TLS file: ${fp}"
  fi

  # ── HashiCorp tokens ───────────────────────────────────────
  if grep -qE '(\.vault-token|\.consul-token)$' <<< "$fp"; then
    deny_with "BLOCKED: Reading HashiCorp token: ${fp}"
  fi

  exit 0
fi

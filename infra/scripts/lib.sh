# Shared helpers for Pulsar infrastructure scripts.
# Source this from other scripts: . "$(dirname "$0")/lib.sh"
# Never printed: secrets. Never run standalone.

# Colours only when attached to a TTY.
if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'; C_BLU=$'\033[34m'; C_RST=$'\033[0m'
else
  C_RED=; C_GRN=; C_YEL=; C_BLU=; C_RST=
fi

log()  { printf '%s[*]%s %s\n' "$C_BLU" "$C_RST" "$*"; }
ok()   { printf '%s[ok]%s %s\n' "$C_GRN" "$C_RST" "$*"; }
warn() { printf '%s[!]%s %s\n'  "$C_YEL" "$C_RST" "$*" >&2; }
die()  { printf '%s[x]%s %s\n'  "$C_RED" "$C_RST" "$*" >&2; exit 1; }

require_root() {
  [ "$(id -u)" -eq 0 ] || die "Run as root (sudo)."
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

# backup_file <path> — timestamped copy under /opt/pulsar/backups/configs, once per change.
backup_file() {
  local f="$1" dir="/opt/pulsar/backups/configs"
  [ -f "$f" ] || return 0
  install -d -m 0750 "$dir"
  local dest="$dir/$(basename "$f").$(date -u +%Y%m%dT%H%M%SZ).bak"
  cp -a "$f" "$dest"
  log "Backed up $f -> $dest"
}

# confirm <prompt> — returns 0 to proceed. Honors ASSUME_YES=1 for non-interactive runs.
confirm() {
  local prompt="${1:-Proceed?}"
  if [ "${ASSUME_YES:-0}" = "1" ]; then return 0; fi
  if [ ! -t 0 ]; then die "Refusing dangerous step without a TTY. Re-run with ASSUME_YES=1 to override: $prompt"; fi
  read -r -p "$prompt [y/N] " ans
  case "$ans" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

# require_var VAR — die if env var unset/empty or still a placeholder.
require_var() {
  local name="$1" val="${!1:-}"
  [ -n "$val" ] || die "Missing required variable: $name"
  case "$val" in *CHANGE_ME*|*change-me*|*example.com*) die "Variable $name still has a placeholder value: refuse." ;; esac
}

is_ubuntu_2404() {
  . /etc/os-release 2>/dev/null || return 1
  [ "${ID:-}" = "ubuntu" ] && case "${VERSION_ID:-}" in 24.*) return 0 ;; *) return 1 ;; esac
}

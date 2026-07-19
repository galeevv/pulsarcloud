#!/usr/bin/env bash
# Harden SSH: key-only root login, no passwords.
# SAFETY:
#   * Refuses to disable password auth unless at least one key is already in
#     root's authorized_keys (so you cannot lock yourself out).
#   * Writes a drop-in, validates with `sshd -t`, backs up, then `reload`
#     (never `restart`) so the current session survives.
#   * The actual lockdown requires PULSAR_CONFIRM_SSH_LOCKDOWN=yes.
#
# Usage:
#   # 1) install a key first (from your workstation):
#   #    ssh-copy-id -i ~/.ssh/pulsar_infra_ed25519.pub root@<host>
#   # 2) verify key login works in a NEW terminal, then:
#   sudo PULSAR_CONFIRM_SSH_LOCKDOWN=yes ./harden-ssh.sh
set -Eeuo pipefail
cd "$(dirname "$0")"
. ./lib.sh

require_root

AUTH_KEYS="/root/.ssh/authorized_keys"
DROPIN="/etc/ssh/sshd_config.d/60-pulsar-hardening.conf"

key_count=0
[ -f "$AUTH_KEYS" ] && key_count=$(grep -cE '^(ssh-(ed25519|rsa)|ecdsa-)' "$AUTH_KEYS" || true)
log "authorized_keys entries for root: $key_count"
[ "$key_count" -ge 1 ] || die "No SSH key installed for root yet. Install the infra public key first, then re-run."

if [ "${PULSAR_CONFIRM_SSH_LOCKDOWN:-no}" != "yes" ]; then
  warn "Dry-run: set PULSAR_CONFIRM_SSH_LOCKDOWN=yes to apply the lockdown."
  warn "This will disable password authentication for SSH on this host."
  exit 0
fi

install -d -m 0755 /etc/ssh/sshd_config.d
backup_file "$DROPIN"
cat > "$DROPIN" <<'EOF'
# Managed by Pulsar infra harden-ssh.sh
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
EOF

log "Validating sshd configuration..."
if ! sshd -t; then
  warn "sshd -t failed — reverting drop-in."
  rm -f "$DROPIN"
  die "SSH config invalid; no changes applied."
fi

systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || die "Could not reload SSH service."
ok "SSH hardened: key-only root login. Existing session preserved."
warn "Confirm you can open a NEW key-based session before closing this one."

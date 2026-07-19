#!/usr/bin/env bash
# Base preparation for a fresh Ubuntu 24.04 traffic/origin VPS.
# Idempotent. Does NOT touch SSH auth (see harden-ssh.sh) or firewall
# (see configure-firewall.sh). Safe to re-run.
#
# Usage:  sudo ./bootstrap-server.sh
set -Eeuo pipefail
cd "$(dirname "$0")"
. ./lib.sh

require_root
is_ubuntu_2404 || warn "Not Ubuntu 24.04 — continuing, but this was written for 24.04."

export DEBIAN_FRONTEND=noninteractive

log "Updating package index and upgrading..."
apt-get update -y
apt-get upgrade -y

log "Installing base packages..."
apt-get install -y --no-install-recommends \
  curl wget ca-certificates gnupg jq git unzip \
  chrony ufw fail2ban unattended-upgrades logrotate

log "Setting timezone to UTC and enabling NTP (chrony)..."
timedatectl set-timezone UTC || warn "Could not set timezone (container?)."
systemctl enable --now chrony >/dev/null 2>&1 || warn "chrony not enabled."

log "Enabling BBR + fq if the kernel supports it..."
if modprobe tcp_bbr 2>/dev/null && sysctl net.ipv4.tcp_available_congestion_control 2>/dev/null | grep -qw bbr; then
  cat > /etc/sysctl.d/99-pulsar-bbr.conf <<'EOF'
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
EOF
  sysctl --system >/dev/null
  ok "BBR enabled ($(sysctl -n net.ipv4.tcp_congestion_control))."
else
  warn "BBR unavailable on this kernel — skipped."
fi

log "Raising file-descriptor limits..."
cat > /etc/security/limits.d/99-pulsar.conf <<'EOF'
* soft nofile 1048576
* hard nofile 1048576
root soft nofile 1048576
root hard nofile 1048576
EOF
mkdir -p /etc/systemd/system.conf.d
cat > /etc/systemd/system.conf.d/99-pulsar-limits.conf <<'EOF'
[Manager]
DefaultLimitNOFILE=1048576
EOF

log "Enabling unattended security updates..."
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

log "Enabling fail2ban (sshd jail)..."
cat > /etc/fail2ban/jail.d/pulsar-sshd.local <<'EOF'
[sshd]
enabled = true
mode = aggressive
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban >/dev/null 2>&1 || warn "fail2ban not enabled."

log "Creating infrastructure directories..."
install -d -m 0750 /opt/pulsar /opt/pulsar/backups /opt/pulsar/backups/configs \
  /opt/pulsar/scripts /opt/pulsar/logs

log "Configuring Docker log rotation defaults (applied when Docker is installed)..."
install -d -m 0755 /etc/docker
if [ -f /etc/docker/daemon.json ]; then
  backup_file /etc/docker/daemon.json
else
  cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
fi

echo
ok "Bootstrap complete."
log "Resources:"
printf '  cpu:  %s vCPU\n' "$(nproc)"
printf '  mem:  %s\n' "$(free -h | awk '/Mem:/{print $2" total, "$7" available"}')"
printf '  disk: %s\n' "$(df -h / | awk 'NR==2{print $2" total, "$4" free"}')"
log "Next: install-docker.sh, then harden-ssh.sh, then configure-firewall.sh."

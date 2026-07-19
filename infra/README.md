# Pulsar infrastructure (`infra/`)

Reproducible, idempotent tooling to stand up the Remnawave traffic nodes and the
Yandex CDN LTE origin, and to keep the management panel backed up.

> **Secrets never live in Git.** Real `.env` files, node certificates, Reality
> private keys, and SSH private keys stay on the servers / your workstation only.
> Only `*.example` templates and public keys are committed (`.gitignore` enforces this).

## Topology (verified)

| Role | Domain | IP | Access |
| --- | --- | --- | --- |
| Panel + site + sub (management) | `panel.` / `pulsar-cloud.space` / `sub.` | `31.76.27.41` | `ssh pulsar2` |
| PL node — VLESS RAW TCP Reality | `pl.pulsar-cloud.space` | `185.126.64.64` | `ssh pulsar-pl` * |
| DE node — VLESS RAW TCP Reality | `de.pulsar-cloud.space` | `2.26.230.109` | `ssh pulsar-de` * |
| NL node — Hysteria2 (UDP 443) | `nl.pulsar-cloud.space` | `31.77.157.232` | `ssh pulsar2-node` |
| LTE origin — Yandex CDN xHTTP (draft) | `pulsarnet.top` | `144.31.156.25` ‡ | `ssh pulsar-lte-origin` * |

\* key must be installed first (see below). ‡ DNS resolves `.25`; brief said `.254` — confirm.

The management server must **never** pass user VPN traffic — panel/API/DB only.

## First-time key install (per empty node)

The infra keypair is `~/.ssh/pulsar_infra_ed25519` (public key committed nowhere;
install the `.pub` on each node). From your workstation, using the server password
**once**:

```powershell
type $env:USERPROFILE\.ssh\pulsar_infra_ed25519.pub | ssh root@185.126.64.64 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Repeat for `2.26.230.109` and `144.31.156.25`. Then confirm `ssh pulsar-pl` works
**before** running `harden-ssh.sh`.

## Bring-up order (per node)

```bash
sudo ./scripts/bootstrap-server.sh
sudo ./scripts/install-docker.sh
# verify key login in a NEW terminal, then:
sudo PULSAR_CONFIRM_SSH_LOCKDOWN=yes ./scripts/harden-ssh.sh
sudo ROLE=reality PANEL_IP=31.76.27.41 ./scripts/configure-firewall.sh   # or hysteria / lte-origin
sudo SSL_CERT='<from panel>' ./scripts/install-remnanode.sh
sudo ROLE=reality ./scripts/validate-node.sh
```

## Layout

```
infra/
  scripts/       idempotent bash + one PowerShell checker
  remnanode/     Remnawave node compose + .env template (Reality / Hysteria2 nodes)
  yandex-cdn/    LTE origin: xHTTP inbound profile, nginx template, compose, .env template
```

See `docs/infrastructure/` for the node-provisioning guide, the Yandex CDN LTE
guide, and the deployment report.

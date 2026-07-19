# Deployment report — Remnawave infrastructure

Living report. Updated as steps complete. No secrets are recorded here.

_Last updated: 2026-07-19 (repo-side preparation phase)._

## 1. Findings (audit)

- **Panel already live** on `pulsar2` / `31.76.27.41` (Ubuntu 24.04.4, 4 GB RAM —
  ~320 MB free, 310 MB swap in use; disk 119 GB, 98 GB free). Remnawave 2.8.0
  stack (`remnawave`, `-db`, `-redis`, `-subscription-page`) healthy, 6 days up.
  UFW active, only 22/80/443 public, everything else on loopback.
- **Pulsar site already deployed** as systemd (`pulsar-web`, `pulsar-worker`,
  `pulsar-backup.timer` active+enabled; `/health/ready` OK) — but at release
  `9b9e9a6` (stale) and running **`PULSAR_TEST_MODE=true`, `PAYMENT_PROVIDER=test`,
  `BILLING_ENABLED=false`**.
- **No node/location model in Pulsar's DB.** Nodes/Hosts/Config Profiles live in
  the Remnawave panel. Pulsar only tracks `remnawaveUserId` + two squad UUIDs
  (Standard, LTE). LTE = a squad, not a code entity.
- Provider adapter (`src/server/infrastructure/remnawave/provider.ts`) implements
  create/update/read/URL-rotate against Remnawave 2.8.0; management plane proven,
  usable VPN not yet (no nodes installed).

## 2. Corrected topology (spec had stale copy-paste)

| Role | Domain | IP (DNS-verified) | Notes |
| --- | --- | --- | --- |
| Panel/site/sub | `panel./ /sub.pulsar-cloud.space` | `31.76.27.41` | live |
| PL Reality | `pl.pulsar-cloud.space` | `185.126.64.64` | empty Ubuntu 24.04 |
| DE Reality | `de.pulsar-cloud.space` | `2.26.230.109` | empty Ubuntu 24.04 |
| NL Hysteria2 | `nl.pulsar-cloud.space` | `31.77.157.232` | empty Ubuntu 24.04, key present |
| LTE origin | `pulsarnet.top` | `144.31.156.25` ⚠ | brief said `.254` — confirm |

Spec's `*.pulsarnet.online` domains and the `144.31.156.25` "panel IP" for node
firewalls were **wrong**: node domains are `*.pulsar-cloud.space`; the panel IP is
`31.76.27.41`; `144.31.156.25/pulsarnet.top` is the LTE origin, not the panel.

## 3. Done (repo-side, committed)

- `.gitignore` hardened for keys/tokens/rendered envs.
- Infra SSH keypair generated locally (`~/.ssh/pulsar_infra_ed25519`); `~/.ssh/config`
  entries added (`pulsar-pl`, `pulsar-de`, `pulsar-lte-origin`).
- `infra/scripts/`: `lib.sh`, `bootstrap-server.sh`, `install-docker.sh`,
  `harden-ssh.sh`, `configure-firewall.sh`, `install-remnanode.sh`,
  `validate-node.sh`, `backup-panel.sh`, `render-yandex-origin-config.sh`,
  `check-infrastructure.ps1`.
- `infra/remnanode/` (compose + `.env.example`), `infra/yandex-cdn/` (xHTTP
  profile, nginx template, compose, `.env.example`).
- Docs: `node-provisioning.md`, `yandex-cdn-lte-node.md`, this report.

## 4. Pending / blocked (needs user)

| Item | Blocker |
| --- | --- |
| Install infra pubkey on PL/DE/LTE origin | first login needs the server password (agent cannot use it); one-liner in `infra/README.md` |
| Confirm LTE origin IP | `.25` (DNS) vs `.254` (brief) |
| PL/DE/LTE server bring-up (bootstrap/docker/ssh/fw/node) | key access above; then agent runs per confirmed step |
| Panel-side Config Profiles + Hosts | done in panel UI/API after nodes ONLINE |
| Deploy latest Pulsar code to pulsar2 | Linux build + atomic release (see `docs/DEPLOY_VPS.md`) |
| **Enable real billing** (`BILLING_ENABLED=true`, `TEST_MODE=false`, `PAYMENT_PROVIDER=platega`) | **must wait until nodes online + a real subscription delivers working VPN** |
| Yandex Cloud CDN resource + certs | user's Yandex account (agent prepared everything else) |

## 5. Sequencing rule (money ↔ nodes)

Do **not** enable billing before at least one traffic node is ONLINE and a test
subscription yields working VPN end-to-end. Order: nodes up → client test →
flip billing. Enabling charges earlier risks taking money without delivering VPN.

## 6. Rollback & restore

- SSH hardening writes a drop-in and reloads (keeps the session); revert by
  removing `/etc/ssh/sshd_config.d/60-pulsar-hardening.conf` and reloading.
- Every changed config is backed up under `/opt/pulsar/backups/configs`.
- Panel DB: `infra/scripts/backup-panel.sh`; restore = `gunzip -c dump.sql.gz |
  docker exec -i remnawave-db psql -U <user> -d <db>`.
- Nodes are stateless containers: `docker compose down/up -d` in the node dir.

## 7. Outstanding risks

- Panel VPS is memory-tight (4 GB, swapping). Adding load needs monitoring; a
  traffic node must **not** be co-located here.
- LTE origin IP discrepancy unresolved.
- Real-money go-live gated on end-to-end VPN proof (section 5).

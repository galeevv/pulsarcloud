# Ubuntu 24.04 deployment

Target Pulsar host: `31.76.27.41`, Ubuntu 24.04, 2 vCPU, 4 GB RAM, local NVMe, and 2 GB total swap. Only ports 22, 80, and 443 are public. Host Nginx owns 80/443, Next.js listens on `127.0.0.1:3000`, and SQLite has no network port.

The authorized live topology on this constrained host is:

| Service                     | Host binding     | Public route                       |
| --------------------------- | ---------------- | ---------------------------------- |
| Pulsar web                  | `127.0.0.1:3000` | `https://pulsar-cloud.space`       |
| Remnawave Panel             | `127.0.0.1:3020` | `https://panel.pulsar-cloud.space` |
| Remnawave metrics           | `127.0.0.1:3021` | none                               |
| Remnawave PostgreSQL        | `127.0.0.1:6767` | none                               |
| Remnawave subscription page | `127.0.0.1:3010` | `https://sub.pulsar-cloud.space`   |

Remnawave runs with `API_INSTANCES=1`. No Remnawave Node is installed on this host; VPN inbound traffic terminates only on separate Node servers.

## Capacity constraints

Co-location on 4 GB is an explicit capacity exception, not a general sizing recommendation. The live host mitigates it with 2 GB swap, one Remnawave API instance, bounded Pulsar systemd memory, small Docker log rotation, and no traffic Node. Monitor available memory, swap activity, OOM events, PostgreSQL latency, and disk space. Perform release builds before starting Remnawave or during a controlled window; stop nonessential containers if memory pressure appears. If sustained free memory falls below the operational threshold or swap churn affects requests, move the panel stack to a separate VPS or increase RAM.

Remnawave's published minimum is 2 GB RAM/2 CPU cores and its recommended panel capacity is 4 GB RAM/4 cores, before Pulsar and build headroom. Remnawave also recommends a separate server for a traffic Node. Sources: [Remnawave requirements](https://docs.rw/install/requirements/) and [official quick start](https://docs.rw/overview/quick-start/).

## 1. DNS, OS packages, and Node

Point the A records for `pulsar-cloud.space`, `panel.pulsar-cloud.space`, and `sub.pulsar-cloud.space` at `31.76.27.41` and verify them before requesting TLS. Add AAAA records only if IPv6 is configured end-to-end; Certbot will validate every advertised address.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git rsync build-essential python3 nginx certbot sqlite3 gzip ufw

# Install Node 22 from an approved Node distribution for your organization.
# The following is the common NodeSource Ubuntu path:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install --global npm@11.12.1

node --version
npm --version
node -e 'const [M,m]=process.versions.node.split(".").map(Number); if (!((M===20&&m>=19)||(M===22&&m>=12)||M>=24)) { console.error(`Unsupported Node ${process.versions.node}`); process.exit(1) }'
```

Do not continue if the Node check fails. Never upload Windows `node_modules`, `.next`, or standalone output: `better-sqlite3` and parts of the build are platform-specific.

## 2. Service account and persistent directories

```bash
sudo adduser --system --group --home /var/lib/pulsar --shell /usr/sbin/nologin pulsar
sudo install -d -o root -g pulsar -m 0755 /opt/pulsar /opt/pulsar/releases
sudo install -d -o root -g pulsar -m 0750 /etc/pulsar
sudo install -d -o pulsar -g pulsar -m 0700 /var/lib/pulsar /var/backups/pulsar
sudo -u pulsar touch /var/lib/pulsar/pulsar.db
sudo chmod 0600 /var/lib/pulsar/pulsar.db
```

The database and backups stay outside every release. `/opt/pulsar/current` is an atomic symlink, not a build directory.

## 3. Production environment (before the build)

Create `/etc/pulsar/pulsar.env` from `.env.example`, owned by `root:pulsar` with mode 0640. It is needed before `prisma generate` or `next build`, because configuration is validated during build/startup. Do not export it while installing dependencies.

```bash
sudo install -o root -g pulsar -m 0640 /path/to/repository/.env.example /etc/pulsar/pulsar.env
sudoedit /etc/pulsar/pulsar.env
sudo stat -c '%U:%G %a %n' /etc/pulsar/pulsar.env
```

Production invariants:

- `APP_ENV=production`, `APP_URL=https://pulsar-cloud.space`, and `DATABASE_URL=file:/var/lib/pulsar/pulsar.db`;
- three independent secrets: `SESSION_SECRET` and `AUTH_PEPPER` at least 32 characters, `DATA_ENCRYPTION_KEY` exactly 64 hexadecimal characters (`openssl rand -hex 32` can generate each value independently);
- `PULSAR_TEST_MODE=false` and `PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION=false`;
- real `RESEND_API_KEY`, verified sender, Telegram credentials/webhook secret, Platega merchant credentials, and `PAYMENT_PROVIDER=platega`;
- `REMNAWAVE_PROVIDER=http`, `REMNAWAVE_BASE_URL=https://panel.pulsar-cloud.space`, protected API token, Standard/LTE squad UUIDs, and an 8-second bounded timeout outside test mode;
- `BILLING_ENABLED=false` until the implemented Remnawave 2.8 HTTP provider, Platega callback, worker, and a usable subscription through a separate Node pass one end-to-end acceptance run.

Installing the Panel, implementing its management API, and creating dummy squads still do **not** provide usable VPN connectivity. Do not set `BILLING_ENABLED=true` until the complete Platega sandbox-to-worker flow provisions a subscription that connects through a separate real Node/Host.

The same file is read by systemd and sourced for release commands. Use shell-compatible `KEY=value` lines and quote values containing spaces, for example `RESEND_FROM_EMAIL='Pulsar <auth@pulsar-cloud.space>'`. Do not add `export`, do not keep a production `.env` in the repository, and never print the file in deployment logs.

## 4. TLS bootstrap

The supplied final Nginx config references a certificate, so it cannot be enabled before the first certificate exists. Bootstrap an HTTP-only ACME site first:

```bash
sudo install -d -o www-data -g www-data -m 0755 /var/www/certbot
sudo tee /etc/nginx/sites-available/pulsar-bootstrap >/dev/null <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name pulsar-cloud.space panel.pulsar-cloud.space sub.pulsar-cloud.space;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 503; }
}
NGINX
sudo ln -sfn /etc/nginx/sites-available/pulsar-bootstrap /etc/nginx/sites-enabled/pulsar-bootstrap
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot \
  -d pulsar-cloud.space \
  -d panel.pulsar-cloud.space \
  -d sub.pulsar-cloud.space \
  --cert-name pulsar-cloud.space \
  -m YOUR_EMAIL --agree-tos --no-eff-email
sudo certbot renew --dry-run
```

Replace `YOUR_EMAIL`. This creates one SAN certificate covering all three names at `/etc/letsencrypt/live/pulsar-cloud.space/{fullchain.pem,privkey.pem}`. The final Nginx configuration uses that same certificate for the apex, panel, and subscription virtual hosts. `deploy/nginx/remnawave.conf.example` is retired documentation and must not be enabled alongside `pulsar.conf`.

## 5. Build an immutable release

Use a fresh Linux release directory. The example clones Git; an artifact/`rsync` workflow is also valid if it excludes `.env*`, databases, `node_modules`, and `.next`.

```bash
release="/opt/pulsar/releases/$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -o pulsar -g pulsar -m 0755 "$release"
sudo -u pulsar git clone --depth=1 REPOSITORY_URL "$release"

sudo -u pulsar RELEASE="$release" bash -lc '
  cd "$RELEASE"
  npm ci --include=dev
  set -a
  . /etc/pulsar/pulsar.env
  set +a
  npm run db:generate
  npm run build
  test -f .next/standalone/server.js
  test -d .next/standalone/.next/static
  test -d .next/standalone/public
'
```

Replace `REPOSITORY_URL`. `npm ci --include=dev` is intentional: production worker startup uses the `tsx` loader. The build packaging step removes env files from standalone output and copies static/public assets.

## 6. Backup, migrate, seed, and switch atomically

On an update, record the previous target and create a verified backup before migrations. Migrations must be forward-compatible with the still-running previous web version; otherwise stop both services for a maintenance window.

```bash
previous="$(readlink -f /opt/pulsar/current 2>/dev/null || true)"
if sudo test -s /var/lib/pulsar/pulsar.db; then
  sudo -u pulsar /usr/bin/bash "$release/scripts/backup-sqlite.sh"
fi

sudo -u pulsar RELEASE="$release" bash -lc '
  set -a
  . /etc/pulsar/pulsar.env
  set +a
  cd "$RELEASE"
  npm run db:deploy
  npm run db:seed:pricing
  npm run db:bootstrap-admin
'

sudo ln -sfn "$release" /opt/pulsar/current.next
sudo mv -Tf /opt/pulsar/current.next /opt/pulsar/current
```

The symlink rename is atomic. Never run `npm install` or build in `/opt/pulsar/current`.

## 7. systemd and final Nginx

On a first installation, complete the Remnawave bootstrap in section 8 before starting these units. The production configuration intentionally refuses to start without the Standard/LTE squad UUIDs written by that bootstrap.

```bash
sudo install -o root -g root -m 0644 "$release"/deploy/systemd/pulsar-*.service /etc/systemd/system/
sudo install -o root -g root -m 0644 "$release"/deploy/systemd/pulsar-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable pulsar-web pulsar-worker pulsar-backup.timer
sudo systemctl restart pulsar-web pulsar-worker pulsar-backup.timer

sudo install -o root -g root -m 0644 "$release/deploy/nginx/pulsar.conf" /etc/nginx/sites-available/pulsar.conf
sudo ln -sfn /etc/nginx/sites-available/pulsar.conf /etc/nginx/sites-enabled/pulsar.conf
sudo rm -f /etc/nginx/sites-enabled/pulsar-bootstrap
sudo nginx -t
sudo systemctl reload nginx
```

`restart` is intentional: it starts the units on the first install and forces already-running web/worker processes to load the newly selected release. The service memory caps are web 768 MB heap/1200 MB hard and worker 384 MB heap/650 MB hard. They are safeguards for the authorized constrained topology, not a substitute for memory, swap, and OOM monitoring.

## 8. Remnawave Panel and subscription page

Install Docker Engine and the Compose v2 plugin from Docker's current Ubuntu instructions, then verify the daemon before running the repository scripts:

```bash
docker --version
docker compose version
sudo systemctl enable --now docker

sudo bash "$release/deploy/remnawave/install-panel.sh"
curl -fsS https://panel.pulsar-cloud.space/api/auth/status

sudo bash "$release/deploy/remnawave/bootstrap-panel.sh"
sudo bash "$release/deploy/remnawave/inspect-safe-state.sh"
sudo bash "$release/deploy/remnawave/smoke-test-provider.sh"
sudo systemctl restart pulsar-web pulsar-worker
```

`install-panel.sh` downloads the official production compose definition, changes only the host-side Panel and metrics mappings to loopback ports 3020/3021, keeps PostgreSQL on its loopback port 6767, sets `API_INSTANCES=1`, generates secrets, limits Docker logs, and starts the Panel stack. `bootstrap-panel.sh` performs the one-time administrator/API-token bootstrap, starts the bundled subscription page on loopback port 3010, and idempotently creates the loopback/blackhole TEST Standard/LTE profiles and squads. It writes only their non-secret UUIDs into `/etc/pulsar/pulsar.env`. Protect all generated `.env`, token, and bootstrap-credential files with root-only permissions and rotate the initial administrator credential after handoff.

Do not install or start a Remnawave Node on this VPS. The scripts install management services and the API-side Standard/LTE entitlement fixtures only. The HTTP adapter is implemented, but leave `BILLING_ENABLED=false` until a separate traffic Node and the complete paid acceptance path are verified.

## 9. Firewall, callbacks, and acceptance

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

ss -ltnp
curl -fsS http://127.0.0.1:3000/api/health/live
curl -fsS http://127.0.0.1:3020/api/auth/status
curl -fsS http://127.0.0.1:3010/ -o /dev/null
curl -fsS https://pulsar-cloud.space/api/health/ready
curl -fsS https://panel.pulsar-cloud.space/api/auth/status
curl -fsS https://sub.pulsar-cloud.space/ -o /dev/null
systemctl --no-pager --full status pulsar-web pulsar-worker pulsar-backup.timer
docker compose -f /opt/remnawave/docker-compose.yml ps
docker compose -f /opt/remnawave/subscription/docker-compose.yml ps
```

Do not allow ports 3000, 3010, 3020, 3021, or 6767 through UFW; they must remain loopback-only. SQLite has no listener. Confirm that no Remnawave Node or VPN inbound port is present on this host. Configure Telegram webhook `https://pulsar-cloud.space/api/integrations/telegram/webhook` with its secret header and Platega callback `https://pulsar-cloud.space/api/integrations/payments/webhook`.

Current acceptance covers the website, Panel, and subscription-page availability only. It does not prove Pulsar provisioning: the production HTTP provider remains an integration stub and `BILLING_ENABLED` must remain `false`. Before enabling billing, implement and contract-test that adapter, then verify one provider sandbox payment, provisioning/outbox completion, a usable subscription URL on a separate Node, duplicate callback idempotency, and an on-demand backup.

## 10. Rollback

If health checks fail and the migration is compatible with the old release, point `current` back and restart:

```bash
test -n "$previous" && test -d "$previous"
sudo ln -sfn "$previous" /opt/pulsar/current.next
sudo mv -Tf /opt/pulsar/current.next /opt/pulsar/current
sudo systemctl restart pulsar-web pulsar-worker
curl -fsS https://pulsar-cloud.space/api/health/ready
```

Never blindly reverse a data migration. Restore the pre-migration snapshot only with both services stopped and after accepting loss of post-snapshot writes; use [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md).

## Remnawave port ownership

Pulsar reserves `127.0.0.1:3000`. The installed Remnawave compose mapping moves the Panel host side to `127.0.0.1:3020` and metrics to `127.0.0.1:3021`; PostgreSQL is exposed only on loopback at `127.0.0.1:6767`. The subscription compose publishes only `127.0.0.1:3010`. Valkey remains inside the Docker network. Host Nginx is the sole owner of 80/443 and routes the panel/subscription domains using the shared SAN certificate.

Verify the effective mappings after every Remnawave update with `docker compose config` and `ss -ltnp`; an upstream compose change must never re-publish these ports on all interfaces or reclaim port 3000. Keep `API_INSTANCES=1`, and do not install a Remnawave Node on this VPS. The active virtual hosts are already in `deploy/nginx/pulsar.conf`; the old standalone `remnawave.conf.example` is intentionally retired. See [REMNAWAVE.md](REMNAWAVE.md).

# Remnawave deployment and integration boundary

Remnawave Panel 2.8.0, its subscription page, and the Pulsar HTTP provisioning adapter run the management plane. The adapter contract was checked against the official `remnawave/backend` tag `2.8.0` and exercised against the live Panel.

**Status (2026-08-17): this is live production.** Billing is enabled, real traffic Nodes are attached, and paying users are provisioned through this path. Five Nodes are connected — Poland, Germany and Finland-2 (VLESS Reality), Netherlands (Hysteria2), Germany-2 (VLESS xHTTP behind a CDN) — grouped into the `Pulsar` and `PulsarLTE` internal squads. Node addresses, SNI/dest choices, firewall rules and per-node keys are deliberately **not** kept in this repository; they live in the gitignored `docs/infrastructure/remnawave-operations.md` on the operator's machine, together with the node-provisioning scripts in `/opt/pulsar/` on the panel host.

`ProvisioningProvider` defines `upsertSubscriber`, `updateSubscriber`, `regenerateSubscriptionUrl`, and `getSubscriberState`. `MockProvisioningProvider` remains limited to local test mode. `RemnawaveHttpProvider` implements the live 2.8.0 API with bounded timeouts and response bodies, schema validation, sanitized errors, and deterministic hashed usernames. It uses `GET /api/users/by-username/{username}` plus `POST /api/users` for idempotent creation, `PATCH /api/users` for renewal and entitlement changes, `GET /api/users/{uuid}` for reconciliation, and `POST /api/users/{uuid}/actions/revoke` for subscription URL rotation.

Local subscription state is desired state. Every change increments `syncVersion` and creates `subscription:<id>:sync:<version>`. The worker ignores stale versions, records success or failure, keeps friendly errors separate from technical logs, and never rolls back a confirmed payment because provisioning is temporarily unavailable. Standard access maps to the Standard internal squad; LTE adds the LTE squad while retaining Standard. `deviceLimit` maps to Remnawave `hwidDeviceLimit`, unlimited traffic maps to `trafficLimitBytes=0` and `NO_RESET`, and the remote account is always reconciled to `ACTIVE` for a live local term.

The Telegram worker reads and deletes connected devices only through the existing `getSubscriptionDevices` and `deleteSubscriptionDevice` domain boundary. Device lists are fetched on demand for an active, synchronized subscription; a temporary provider failure is shown as an unavailable list or a limit-only summary and never fabricated as a zero count. Callback data never contains an HWID: the bot derives a short user-bound HMAC tag and resolves it against a fresh owned-device list immediately before confirmation or deletion. Repeated deletion is treated idempotently.

Production runs with `BILLING_ENABLED=true` (flipped after the payment-to-usable-Node acceptance flow passed; the safe procedure is `deploy/pulsar/go-live.sh`, which backs up the env file and rolls back on an unhealthy start).

## Authorized live topology

The management VPS is Ubuntu 24.04 with 2 vCPU, 4 GB RAM, local NVMe, and 2 GB total swap. Co-location is an explicit constrained deployment; it is not a recommendation for a new production environment.

| Component            | Host binding                | Exposure                              |
| -------------------- | --------------------------- | ------------------------------------- |
| Host Nginx           | `0.0.0.0:80`, `0.0.0.0:443` | only public HTTP/HTTPS entry point    |
| Pulsar web           | `127.0.0.1:3000`            | proxied as `pulsar-cloud.space`       |
| Remnawave Panel      | `127.0.0.1:3020`            | proxied as `panel.pulsar-cloud.space` |
| Remnawave metrics    | `127.0.0.1:3021`            | local monitoring only                 |
| Remnawave PostgreSQL | `127.0.0.1:6767`            | local administration only             |
| Subscription page    | `127.0.0.1:3010`            | proxied as `sub.pulsar-cloud.space`   |
| Valkey               | Docker network only         | no host or public binding             |

The Panel is limited to `API_INSTANCES=1`. No Remnawave Node is installed here, and this VPS must not accept VPN inbound traffic — traffic Nodes live on separate servers and are attached through the Panel.

The panel virtual host is additionally gated by source IP: an nginx `geo $panel_access_class` map answers **404** to everyone except loopback, the Docker network, the panel's own public address, and the current node egress addresses. That list must be refreshed whenever a node or the panel is re-IP'd, otherwise the panel becomes unreachable (and site→panel provisioning would break if `/etc/hosts` did not pin the three domains to `127.0.0.1`).

One Let's Encrypt SAN certificate covers `pulsar-cloud.space`, `panel.pulsar-cloud.space`, and `sub.pulsar-cloud.space`. All three Nginx virtual hosts use:

```text
/etc/letsencrypt/live/pulsar-cloud.space/fullchain.pem
/etc/letsencrypt/live/pulsar-cloud.space/privkey.pem
```

The active panel and subscription proxy configuration is part of `deploy/nginx/pulsar.conf`. `deploy/nginx/remnawave.conf.example` is retired and must not be enabled as a second set of virtual hosts.

## Capacity and port policy

The official Panel minimum is 2 GB RAM/2 CPU cores and the recommendation is 4 GB RAM/4 cores before Pulsar and release-build headroom. The live 4 GB exception therefore depends on `API_INSTANCES=1`, 2 GB swap, bounded Pulsar systemd memory, reduced Docker log rotation, and the absence of a traffic Node. See [hardware/software requirements](https://docs.rw/install/requirements/) and [quick start/topology](https://docs.rw/overview/quick-start/).

Host Nginx is the only process allowed to listen publicly on 80/443. UFW must not expose 3000, 3010, 3020, 3021, or 6767. Before and after every Panel update, verify the rendered compose configuration and listeners:

```bash
cd /opt/remnawave
docker compose config
docker compose ps

cd /opt/remnawave/subscription
docker compose config
docker compose ps

ss -ltnp
```

An upstream compose change must never restore the Panel host mapping to port 3000, bind an internal port on `0.0.0.0`, or claim 80/443. Keep the installed host mappings at Panel `3020`, metrics `3021`, PostgreSQL `6767`, and subscription page `3010`, all on `127.0.0.1`.

Monitor memory availability, swap-in/swap-out, OOM events, container restarts, PostgreSQL latency, and disk usage. Build Pulsar before starting Remnawave or in a controlled maintenance window. Move the Panel stack to a larger/separate VPS if sustained swap churn or resource pressure affects requests.

## Entitlement mapping

Standard access maps to the internal squad `Pulsar`, LTE adds `PulsarLTE`; their UUIDs are the values of `REMNAWAVE_STANDARD_SQUAD_UUID` and `REMNAWAVE_LTE_SQUAD_UUID` in `/etc/pulsar/pulsar.env`. Both squads are backed by real Nodes. The earlier `PULSAR_TEST_STANDARD`/`PULSAR_TEST_LTE` blackhole fixtures were replaced during the traffic rollout and no longer exist in the Panel; `deploy/remnawave/bootstrap-test-entitlements.sh` is therefore historical and must not be run against production.

Adding or retiring a Node changes only which inbounds belong to those squads — never the squad UUIDs, because the site provisions users against them. A new Node is first attached to a throwaway squad, verified with real traffic from Russia, and only then added to `Pulsar`/`PulsarLTE`.

Useful inspection commands that remain safe to run:

```bash
sudo /opt/pulsar/current/deploy/remnawave/inspect-safe-state.sh
sudo /opt/pulsar/current/deploy/remnawave/smoke-test-provider.sh
```

## Production API contract

Required environment values are:

```text
REMNAWAVE_PROVIDER=http
REMNAWAVE_USER_NAMESPACE=pulsar
REMNAWAVE_BASE_URL=https://panel.pulsar-cloud.space
REMNAWAVE_API_TOKEN=<root-readable secret>
REMNAWAVE_STANDARD_SQUAD_UUID=<uuid>
REMNAWAVE_LTE_SQUAD_UUID=<uuid>
REMNAWAVE_TIMEOUT_MS=8000
```

`REMNAWAVE_USER_NAMESPACE=pulsar` preserves the production deterministic usernames created by earlier releases. For a local test database connected to this Panel, use `npm run setup:local:remnawave`; it requires a dedicated local-test token and uses a separate namespace so local identities cannot collide with production identities. Never copy the production token out of `/etc/pulsar/pulsar.env`.

The token is stored only in `/etc/pulsar/pulsar.env` (`root:pulsar`, mode `0640`). Rotate it with `deploy/remnawave/rotate-pulsar-api-token.sh`; the script replaces the environment value atomically, verifies the new credential, and then revokes superseded `pulsar-backend*` tokens. Never print, log, or copy the token into Markdown.

Work that is still open now that billing is live:

1. Expand adapter coverage for expired/blocked users and true network timeouts against a disposable compatible Panel. Unit coverage already includes create, update, Standard/LTE assignment, state reads, URL regeneration, ambiguous-create recovery, sanitized 5xx errors, and oversized responses.
2. Reconcile local `PENDING`/`FAILED` subscription syncs and prove through a process-crash acceptance test that retries cannot create duplicate Remnawave users.
3. Alerting on a Node going offline (currently noticed by hand) and on failed provisioning jobs.

Node-level operations — adding, replacing or retiring a traffic Node, choosing its Reality dest, and the client fingerprint rule (`edge`, never `chrome`, which Russian DPI blocks) — are documented in the operator-local `docs/infrastructure/remnawave-operations.md`, not here.

The Pulsar readiness endpoint deliberately does not call Remnawave. Monitor failed provisioning jobs, `syncStatus`, `IntegrationLog`, provider health, and worker heartbeat independently. Panel/subscription HTTP health proves only that those services are reachable; it does not prove that Pulsar provisioning works.

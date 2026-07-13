# Remnawave deployment and integration boundary

Remnawave Panel 2.8.0, its subscription page, and the Pulsar HTTP provisioning adapter are installed for the management plane. The adapter contract was checked against the official `remnawave/backend` tag `2.8.0` and exercised against the live Panel. This proves management-plane create/update/read/URL-rotation behavior; it does **not** prove usable VPN traffic because no Remnawave Node or Host is installed.

`ProvisioningProvider` defines `upsertSubscriber`, `updateSubscriber`, `regenerateSubscriptionUrl`, and `getSubscriberState`. `MockProvisioningProvider` remains limited to local test mode. `RemnawaveHttpProvider` implements the live 2.8.0 API with bounded timeouts and response bodies, schema validation, sanitized errors, and deterministic hashed usernames. It uses `GET /api/users/by-username/{username}` plus `POST /api/users` for idempotent creation, `PATCH /api/users` for renewal and entitlement changes, `GET /api/users/{uuid}` for reconciliation, and `POST /api/users/{uuid}/actions/revoke` for subscription URL rotation.

Local subscription state is desired state. Every change increments `syncVersion` and creates `subscription:<id>:sync:<version>`. The worker ignores stale versions, records success or failure, keeps friendly errors separate from technical logs, and never rolls back a confirmed payment because provisioning is temporarily unavailable. Standard access maps to the Standard internal squad; LTE adds the LTE squad while retaining Standard. `deviceLimit` maps to Remnawave `hwidDeviceLimit`, unlimited traffic maps to `trafficLimitBytes=0` and `NO_RESET`, and the remote account is always reconciled to `ACTIVE` for a live local term.

Production still keeps `BILLING_ENABLED=false`. The management adapter is proven, but the Platega callback-to-worker acceptance suite and a usable subscription through a separate real Node/Host have not been proven together. Enabling charges before that would risk accepting money without delivering working VPN access.

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

The Panel is limited to `API_INSTANCES=1`. No Remnawave Node is installed here, and this VPS must not accept VPN inbound traffic. Traffic Nodes belong on separate servers and will be connected through the Panel later.

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

## Safe entitlement fixtures

The live Panel contains two clearly marked, deliberately unusable entitlement fixtures. They exist only to verify Standard/LTE assignment before real traffic Nodes are available.

| Kind | Profile UUID | Inbound UUID | Internal squad UUID |
| --- | --- | --- | --- |
| Standard | `6c3a8d36-0483-48b2-875f-ce778f0e6bbb` | `e279b4b8-2ec4-4a19-aeaf-fd5bf51ab2b1` | `1d64e64b-b56e-4fa5-a947-f0d071114ddf` |
| LTE | `46bea9a0-6682-436f-beb1-8e5b315a99c8` | `8fafb99a-638b-4aef-a4dd-b8ccff90cdf8` | `1d0c6f11-8049-48c0-8d2b-ed79f00ad128` |

Profiles are named `PULSAR_TEST_STANDARD_PROFILE` and `PULSAR_TEST_LTE_PROFILE`; their inbounds/squads are named `PULSAR_TEST_STANDARD` and `PULSAR_TEST_LTE`. Each dummy inbound listens on `127.0.0.1` in a hypothetical Node config and routes all traffic to Xray `blackhole`. No Node or Host is attached, and no client port is published on this VPS. Do not turn these fixtures into production profiles; replace their squad UUIDs with squads backed by separately hosted Nodes during the real traffic rollout.

The idempotent bootstrap and safe inspection commands are:

```bash
sudo /opt/pulsar/current/deploy/remnawave/bootstrap-test-entitlements.sh
sudo /opt/pulsar/current/deploy/remnawave/inspect-safe-state.sh
sudo /opt/pulsar/current/deploy/remnawave/smoke-test-provider.sh
```

The live provider smoke test created a temporary Standard user, updated the same UUID to two devices plus LTE, fetched it by deterministic identity, rotated its subscription URL, received HTTP 200 from the subscription page, deleted the user, and confirmed HTTP 404 afterward. Temporary user `2fcefcf7-5125-437e-a727-fca1eaed5a83` was deleted.

## Production API contract

Required environment values are:

```text
REMNAWAVE_PROVIDER=http
REMNAWAVE_BASE_URL=https://panel.pulsar-cloud.space
REMNAWAVE_API_TOKEN=<root-readable secret>
REMNAWAVE_STANDARD_SQUAD_UUID=<uuid>
REMNAWAVE_LTE_SQUAD_UUID=<uuid>
REMNAWAVE_TIMEOUT_MS=8000
```

The token is stored only in `/etc/pulsar/pulsar.env` (`root:pulsar`, mode `0640`). Rotate it with `deploy/remnawave/rotate-pulsar-api-token.sh`; the script replaces the environment value atomically, verifies the new credential, and then revokes superseded `pulsar-backend*` tokens. Never print, log, or copy the token into Markdown.

The following work remains before billing can be enabled:

1. Add at least one separate Remnawave Node and Host, then replace the dummy squads with production squads. Do not install the Node on this management VPS.
2. Expand adapter coverage for expired/blocked users and true network timeouts against a disposable compatible Panel. Unit coverage already includes create, update, Standard/LTE assignment, state reads, URL regeneration, ambiguous-create recovery, sanitized 5xx errors, and oversized responses.
3. Reconcile local `PENDING`/`FAILED` subscription syncs and prove through a process-crash acceptance test that retries cannot create duplicate Remnawave users.
4. Run the full Platega sandbox payment -> committed local subscription -> outbox provisioning -> usable connection flow, including duplicate callbacks and transient Panel failures.
5. Keep `BILLING_ENABLED=false` until all acceptance cases pass and rollback/incident procedures are rehearsed; only then enable billing as a separate controlled change.

The Pulsar readiness endpoint deliberately does not call Remnawave. Monitor failed provisioning jobs, `syncStatus`, `IntegrationLog`, provider health, and worker heartbeat independently. Panel/subscription HTTP health proves only that those services are reachable; it does not prove that Pulsar provisioning works.

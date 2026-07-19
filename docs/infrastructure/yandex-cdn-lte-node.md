# Yandex Cloud CDN LTE node (VLESS xHTTP TLS)

The LTE / restricted-access node routes clients through Yandex Cloud CDN (edge IPs
that sit in Russian operator allow-lists), so it works where direct VPS
connections are throttled. **LTE is optional in the product** — Pulsar models it
as the `REMNAWAVE_LTE_SQUAD_UUID` squad; a subscription only gets it when
`lteEnabled` is set. The node ships **disabled** until the CDN is live.

```
Client (edge/firefox fp)
  → VLESS xHTTP TLS (packet-up, GET-uplink, path /poll)
  → Yandex Cloud CDN (edge 188.72.110.x / 188.72.111.x)
  → HTTPS, Host: <origin domain>
  → nginx on origin (TLS terminate, location / → loopback)
  → http://127.0.0.1:11443  (Xray xHTTP inbound)
  → freedom outbound → internet
```

Origin server: `pulsarnet.top` (IP `144.31.156.25` per DNS — **confirm vs the
`.254` in the brief**). This document tracks what is **prepared in the repo** and
what **you** must do in Yandex Cloud + DNS. Full click-path lives in your own
`yandex-cdn-xhttp-guide` — this file is the Pulsar-specific integration wrapper.

## Prepared in the repo (ready to apply)

| Artifact | Path |
| --- | --- |
| xHTTP inbound (Config Profile) | `infra/yandex-cdn/xhttp-inbound-profile.json` |
| nginx origin template | `infra/yandex-cdn/nginx-origin.conf.tmpl` |
| Origin render script (validates, `nginx -t`, reload) | `infra/scripts/render-yandex-origin-config.sh` |
| Remnawave node compose (loopback xHTTP) | `infra/yandex-cdn/docker-compose.yml` |
| Env template | `infra/yandex-cdn/.env.example` |

## Server-side bring-up (origin)

```bash
sudo infra/scripts/bootstrap-server.sh
sudo infra/scripts/install-docker.sh
sudo PULSAR_CONFIRM_SSH_LOCKDOWN=yes infra/scripts/harden-ssh.sh
sudo ROLE=lte-origin PANEL_IP=31.76.27.41 infra/scripts/configure-firewall.sh
# issue the origin cert (DNS-only A record must resolve first):
sudo certbot certonly --nginx -d <origin domain>
# fill infra/yandex-cdn/.env, then render nginx:
sudo infra/scripts/render-yandex-origin-config.sh
# register the node in the panel, then:
sudo SSL_CERT='<node cert>' NODE_DIR=/opt/remnanode-lte infra/scripts/install-remnanode.sh
```

Assign the `YANDEX-CDN-XHTTP` Config Profile to this node so Xray listens on
`127.0.0.1:11443`.

## What YOU must do in Yandex Cloud + DNS (needs your account/access)

1. **DNS (DNS-only, no Cloudflare proxy):** `A` record `origin.<domain>` →
   origin IP; later `CNAME cdn.<domain>` → Yandex GSLB target.
2. **Certificate Manager:** issue a Let's Encrypt cert for the **CDN** domain via
   DNS challenge; add the `_acme-challenge` CNAME; keep it for auto-renewal.
3. **Cloud CDN resource:** single source = origin domain; **HTTPS** to origin;
   Host header + SNI = origin domain; verify-origin-cert **off**; caching **off**;
   keep cookies + query params; gzip **off**; shielding **off**; methods
   **GET** (+ HEAD/OPTIONS); TLS profile "secure (TLSv1.2+)".
4. **CDN CNAME:** point `cdn.<domain>` at the Yandex GSLB target, **DNS-only**.
5. Confirm `dig +short cdn.<domain>` ends on `188.72.x` (Yandex edge), not
   Cloudflare.

Key gotchas from the working guide: **GET-uplink** (not POST — RU CDNs cut POST),
**one-segment path `/poll`**, and **Yandex CDN specifically** (CDNvideo /
Timeweb reselling trbcdn block this at the edge with `403 HIT`).

> The reference guide uses client fingerprint `chrome`; **override to `edge` /
> `firefox`** to comply with Pulsar's node rules. The `extra` block must be
> byte-identical between the server Config Profile and the client Host (Host omits
> `path`).

## Enable the Host (only after CDN verified)

Prepare two **disabled / draft** Hosts now; do not put them in a live subscription:

```
🇫🇮 LTE · Yandex CDN · Edge      (disabled)
🇫🇮 LTE · Yandex CDN · Firefox   (disabled)
```

Host params: Address/SNI/Host = `cdn.<domain>`, Port 443, Path `/poll`, Mode
`packet-up`, ALPN `h2,http/1.1`, Security TLS, fingerprint edge/firefox, `extra` =
the profile block. Enable only after a **real client** test shows edge IPs
`188.72.x` in `/var/log/nginx/xhttp_access.log` with `GET /poll` 200s. `curl`
cannot create a full xHTTP session — it will 400/404, which is expected.

## Verification (before CDN)

```bash
sudo ROLE=lte-origin ORIGIN_DOMAIN=<origin domain> infra/scripts/validate-node.sh
```

Checks: remnanode up, Xray running, loopback 11443 listening, nginx active,
origin cert present, `/health` responds.

## Rollback

Keep the LTE Hosts disabled → no user impact. To remove: `docker compose down`
in the node dir, `rm /etc/nginx/sites-enabled/pulsar-xhttp-origin.conf &&
nginx -t && systemctl reload nginx`. Restore configs from
`/opt/pulsar/backups/configs`.

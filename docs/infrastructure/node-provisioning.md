# Node provisioning — PL/DE Reality & NL Hysteria2

How to register and configure the three live traffic nodes in the Remnawave
panel (`panel.pulsar-cloud.space`). Server prep (packages, Docker, SSH, firewall,
remnanode) is handled by `infra/scripts/*`; this doc covers the **panel-side**
Config Profiles and Hosts.

Project rules: fingerprints **edge** and **firefox** only (never `chrome`); a
**unique Reality keypair and unique shortIds per node**; no shared private keys.

## 0. Register each node

Panel → **Nodes → Create node** for each server:

| Node | Address | Node port | Firewall (admin port) |
| --- | --- | --- | --- |
| PL | `185.126.64.64` | `2222` | only from `31.76.27.41` |
| DE | `2.26.230.109` | `2222` | only from `31.76.27.41` |
| NL | `31.77.157.232` | `2222` | only from `31.76.27.41` |

Copy each node's certificate into that server's `/opt/remnanode/.env` via
`install-remnanode.sh`. Wait for **ONLINE** before adding inbounds.

## 1. PL & DE — VLESS RAW TCP Reality

### 1a. Pick a stable Reality target (run ON the node)

Reality masquerades as a real TLS site. Test candidates from the node itself and
pick the most stable — not by brand:

```bash
for d in www.intel.com www.amd.com www.nvidia.com www.sony.com; do
  echo "== $d =="
  curl -sI --http2 --max-time 5 "https://$d" | head -1
  timeout 5 openssl s_client -connect "$d:443" -servername "$d" -tls1_3 </dev/null 2>/dev/null \
    | grep -E 'Protocol|Verify return code'
done
```

Require: reachable, **TLS 1.3**, valid cert, stable across repeats, low handshake
time. Preferred: PL → `www.intel.com`, DE → `www.amd.com`.

### 1b. Generate a UNIQUE keypair + shortIds per node

```bash
docker exec remnanode xray x25519          # -> Private key / Public key
openssl rand -hex 8                          # shortId #1
openssl rand -hex 8                          # shortId #2
```

The **private key stays on the server / in the panel Config Profile only.** The
public key + shortIds go to the client Host. PL and DE must not share these.

### 1c. Config Profile (per node)

| Field | PL | DE |
| --- | --- | --- |
| Tag | `PL-VLESS-REALITY` | `DE-VLESS-REALITY` |
| Protocol / Transport | VLESS / RAW(TCP) | VLESS / RAW(TCP) |
| Security | Reality | Reality |
| Port | `443` | `443` |
| Flow | `xtls-rprx-vision` | `xtls-rprx-vision` |
| dest / serverNames (SNI) | `www.intel.com:443` | `www.amd.com:443` |
| privateKey / shortIds | node-unique | node-unique |

### 1d. Hosts (two per node — same inbound, different client fingerprint)

```
🇵🇱 Poland · Reality · Edge      (fingerprint: edge)
🇵🇱 Poland · Reality · Firefox   (fingerprint: firefox)
🇩🇪 Germany · Reality · Edge     (fingerprint: edge)
🇩🇪 Germany · Reality · Firefox  (fingerprint: firefox)
```

Address = node IP, SNI/Host = chosen Reality serverName, publicKey + one shortId.
**Do not create a Chrome variant.**

## 2. NL — Hysteria2

Hysteria2 needs a **real TLS certificate** for `nl.pulsar-cloud.space` (unlike
Reality). Firewall opens `443/udp` (traffic) and `80/tcp` (ACME only).

Config Profile:

| Field | Value |
| --- | --- |
| Tag | `NL-HYSTERIA2` |
| Protocol | Hysteria2 |
| Port | `443/udp` |
| TLS domain | `nl.pulsar-cloud.space` |
| Password / obfs | unique credential; **Salamander obfs OFF** initially |
| Bandwidth limit | unset (default) |
| Port hopping | **OFF** initially |

Host: `🇳🇱 Netherlands · Hysteria2` (address `nl.pulsar-cloud.space`, port 443).

Verify: UDP 443 listening, cert valid + auto-renewing, client connects, DNS +
HTTPS + file download work, packet loss acceptable, and the client falls back to
Reality when UDP is blocked.

## 3. Client test subscriptions

Once nodes are ONLINE and Hosts exist, build a test subscription and confirm each
works from a real client before enabling billing:

- Poland Reality Edge / Firefox
- Germany Reality Edge / Firefox
- Netherlands Hysteria2

The Yandex CDN LTE Host stays **disabled** until the CDN is configured (see
[yandex-cdn-lte-node.md](yandex-cdn-lte-node.md)).

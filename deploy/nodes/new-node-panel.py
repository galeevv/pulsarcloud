#!/usr/bin/env python3
"""
Pulsar 2.0 — панельная часть добавления новой ноды. Запускать НА pulsar2 под root.

    set -a; . /etc/pulsar/pulsar.env; set +a
    python3 /opt/pulsar/new-node-panel.py --type cdn --name "Poland-3" ...

Делает: config profile + inbound, ноду, host, кладёт инбаунд в обкаточный сквод
(без сквода панель не публикует инбаунд на ноду и порт не откроется), сохраняет
id и печатает команды для проверки. Боевым скводам инбаунд НЕ выдаёт — это
отдельный шаг после проверки реальным трафиком из РФ.

Два типа, ровно как new-node.sh:

  --type cdn        нода за российским CDN. Инбаунд xhttp + security none на
                    loopback-порту, TLS терминирует nginx/CDN. Транспортные
                    параметры — как у Польши LTE (эталон): uplink GET,
                    noSSEHeader false, паддинг в query, размеры и интервалы
                    диапазонами.

  --type selfsteal  прямая нода. Инбаунд xhttp + reality на 443, target —
                    локальный nginx с настоящим сертификатом (сайт-прикрытие),
                    свои x25519-ключи и shortId для каждой ноды.

Перед созданием печатает конфиг и, если рядом есть docker, проверяет его
через `xray -test` тем же ядром, что стоит на нодах.
"""
import argparse
import datetime
import json
import os
import pathlib
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request

TEST_SQUAD_DEFAULT = "PulsarFI2Test"
NODE_API_PORT = 2222
XRAY_IMAGE = "remnawave/node:latest"
SELFSTEAL_SITE_PORT = 8443


def die(msg):
    print("\nОШИБКА: %s" % msg, file=sys.stderr)
    sys.exit(1)


class Panel:
    def __init__(self):
        base = os.environ.get("REMNAWAVE_BASE_URL")
        token = os.environ.get("REMNAWAVE_API_TOKEN")
        if not base or not token:
            die("нет REMNAWAVE_BASE_URL / REMNAWAVE_API_TOKEN — сделай:\n"
                "  set -a; . /etc/pulsar/pulsar.env; set +a")
        self.base = base.rstrip("/")
        self.headers = {"Authorization": "Bearer " + token,
                        "Content-Type": "application/json"}

    def call(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data,
                                     headers=self.headers, method=method)
        try:
            resp = urllib.request.urlopen(req, timeout=30)
            raw = resp.read()
            return json.loads(raw)["response"] if raw else None
        except urllib.error.HTTPError as e:
            print("HTTP %s %s %s" % (e.code, path, e.read().decode()[:400]))
            raise


def ask(question, default=None):
    """Спрашиваем только если есть терминал: при `ssh host 'python3 ...'` без -t
    stdin отдаёт EOF, и лучше сказать это внятно, чем упасть трейсбеком."""
    suffix = " [%s]" % default if default else ""
    while True:
        try:
            answer = input("%s%s: " % (question, suffix)).strip()
        except EOFError:
            if default:
                return default
            die("нет терминала для вопроса «%s» — передай значение аргументом "
                "или запусти через ssh -t" % question)
        if answer:
            return answer
        if default:
            return default


def gen_reality_keys():
    """x25519 через тот же образ, что стоит на нодах."""
    try:
        out = subprocess.run(["docker", "run", "--rm", "--entrypoint", "xray",
                              XRAY_IMAGE, "x25519"],
                             capture_output=True, text=True, timeout=180, check=True).stdout
    except Exception as exc:
        die("не смог сгенерировать x25519 через docker (%s).\n"
            "Сгенерируй на ноде: docker exec remnanode xray x25519\n"
            "и передай ключи через --private-key / --public-key" % exc)
    priv = pub = None
    for line in out.splitlines():
        if line.startswith("PrivateKey:"):
            priv = line.split(":", 1)[1].strip()
        elif line.startswith("Password") or line.startswith("PublicKey"):
            pub = line.split(":", 1)[1].strip()
    if not priv or not pub:
        die("не разобрал вывод xray x25519:\n" + out)
    return priv, pub


def cdn_xhttp(path):
    """Транспорт как у Польши LTE. Диапазоны вместо фиксированных чисел —
    поток получается с естественным разбросом и хуже отпечатывается."""
    return {
        "path": path,
        "mode": "packet-up",
        "uplinkHTTPMethod": "GET",          # POST режут все российские CDN
        "uplinkDataPlacement": "body",
        "noSSEHeader": False,               # true => edge буферизует, туннель виснет
        "scMaxEachPostBytes": "500000-1000000",
        "scMinPostsIntervalMs": "50-150",
        "scStreamUpServerSecs": "60-180",
        "xPaddingBytes": "16-64",
        "xPaddingMethod": "tokenish",
        "xPaddingObfsMode": True,
        "xPaddingPlacement": "query",
        "xPaddingKey": "_token",
        "xPaddingHeader": "X-Signature",
    }


CDN_XMUX = {"maxConnections": 2, "cMaxReuseTimes": 0, "hKeepAlivePeriod": 0,
            "hMaxRequestTimes": "100-200", "hMaxReusableSecs": "300-600"}


def build_config(args, keys=None):
    tag = args.tag
    if args.type == "cdn":
        stream = {"network": "xhttp", "security": "none",
                  "xhttpSettings": cdn_xhttp(args.path)}
        inbound = {"tag": tag, "listen": "127.0.0.1", "port": args.port,
                   "protocol": "vless",
                   "settings": {"clients": [], "decryption": "none"},
                   "streamSettings": stream}
    else:
        priv, _pub = keys
        stream = {
            "network": "xhttp",
            "security": "reality",
            "xhttpSettings": {"path": args.path, "mode": "auto"},
            "realitySettings": {
                "target": "127.0.0.1:%d" % SELFSTEAL_SITE_PORT,
                "show": False,
                "xver": 0,
                "serverNames": [args.domain],
                "privateKey": priv,
                "shortIds": [secrets.token_hex(8), secrets.token_hex(4)],
            },
        }
        inbound = {"tag": tag, "listen": "0.0.0.0", "port": 443,
                   "protocol": "vless",
                   "settings": {"clients": [], "decryption": "none"},
                   "sniffing": {"enabled": False},
                   "streamSettings": stream}
    return {
        "log": {"loglevel": "warning"},
        "inbounds": [inbound],
        "outbounds": [{"tag": "DIRECT", "protocol": "freedom"},
                      {"tag": "BLOCK", "protocol": "blackhole"}],
        "routing": {"domainStrategy": "IPIfNonMatch", "rules": [
            {"type": "field", "protocol": ["bittorrent"], "outboundTag": "BLOCK"},
            {"type": "field", "ip": ["geoip:private"], "outboundTag": "BLOCK"}]},
    }


def xray_test(config):
    """Проверяем конфиг тем же ядром, что на нодах — чтобы неизвестное поле
    не уронило xray уже на живой ноде."""
    probe = json.loads(json.dumps(config))
    probe["outbounds"].insert(0, {"tag": "proxy", "protocol": "freedom"})
    tmp = pathlib.Path("/tmp/pulsar-node-config-test.json")
    tmp.write_text(json.dumps(probe))
    try:
        res = subprocess.run(["docker", "run", "--rm", "-v", "%s:/c.json" % tmp,
                              "--entrypoint", "xray", XRAY_IMAGE, "-test", "-c", "/c.json"],
                             capture_output=True, text=True, timeout=180)
    except Exception as exc:
        print("  (пропускаю xray -test: %s)" % exc)
        return True
    finally:
        tmp.unlink(missing_ok=True)
    out = (res.stdout + res.stderr).strip().splitlines()
    tail = out[-1] if out else ""
    if "Configuration OK" in (res.stdout + res.stderr):
        print("  xray -test: Configuration OK")
        return True
    print("  xray -test НЕ ПРОШЁЛ:\n    " + "\n    ".join(out[-6:]))
    return False


def main():
    p = argparse.ArgumentParser(description="Добавление ноды в панель Remnawave")
    p.add_argument("--type", choices=["cdn", "selfsteal"], help="тип ноды")
    p.add_argument("--name", help="имя ноды в панели, напр. Poland-3")
    p.add_argument("--ip", help="IP ноды (адрес для панели)")
    p.add_argument("--domain", help="origin-домен (cdn) или домен ноды (selfsteal)")
    p.add_argument("--cdn-domain", help="домен CDN, к нему подключается клиент (только cdn)")
    p.add_argument("--path", help="путь туннеля")
    p.add_argument("--port", type=int, help="loopback-порт xray (только cdn)")
    p.add_argument("--country", help="код страны, напр. PL")
    p.add_argument("--remark", help="подпись хоста в приложении")
    p.add_argument("--tag", help="тег инбаунда/профиля (по умолчанию из имени)")
    p.add_argument("--test-squad", default=TEST_SQUAD_DEFAULT, help="обкаточный сквод")
    p.add_argument("--private-key", help="Reality privateKey (иначе сгенерирую)")
    p.add_argument("--public-key", help="Reality publicKey (для справки)")
    p.add_argument("--dry-run", action="store_true", help="только показать конфиг")
    p.add_argument("--yes", "-y", action="store_true", help="не спрашивать подтверждение")
    args = p.parse_args()

    if not args.type:
        print("\nТип ноды:\n  1) cdn        — за российским CDN\n  2) selfsteal  — прямая Reality со своим сайтом")
        args.type = {"1": "cdn", "2": "selfsteal"}.get(ask("Выбери 1 или 2", "1"), None)
        if not args.type:
            die("непонятный выбор")

    args.name = args.name or ask("Имя ноды в панели (напр. Poland-3)")
    args.ip = args.ip or ask("IP ноды")
    args.domain = args.domain or ask("Домен ноды (origin)")
    args.country = (args.country or ask("Код страны", "PL")).upper()
    args.remark = args.remark or ask("Подпись хоста для клиента", args.name)
    args.tag = args.tag or args.name.upper().replace("-", "_") + (
        "_YCDN_XHTTP" if args.type == "cdn" else "_REALITY_SELFSTEAL")

    if args.type == "cdn":
        args.cdn_domain = args.cdn_domain or ask("CDN-домен (куда подключается клиент)")
        args.path = args.path or ask("Путь туннеля", "/content/gallery/preview/")
        args.port = args.port or int(ask("loopback-порт xray", "4444"))
        client_address = args.cdn_domain
        sni = args.cdn_domain
        security_layer = "TLS"
        alpn = "h2,http/1.1"
    else:
        args.path = args.path or ask("Путь xhttp внутри туннеля", "/assets/media/stream/")
        args.port = 443
        client_address = args.domain
        sni = args.domain
        security_layer = "DEFAULT"
        alpn = "h2"

    keys = None
    if args.type == "selfsteal":
        if args.private_key:
            keys = (args.private_key, args.public_key or "")
        else:
            print("\nГенерирую свои x25519-ключи для этой ноды (переиспользовать чужие нельзя —\n"
                  "общий Reality-конфиг РКН уже однажды помог забанить нам две ноды пачкой)")
            keys = gen_reality_keys()

    config = build_config(args, keys)

    print("\n=== конфиг инбаунда")
    print(json.dumps(config["inbounds"][0], ensure_ascii=False, indent=1))
    print("\n=== проверка ядром")
    config_ok = xray_test(config)

    if args.dry_run:
        print("\n--dry-run: ничего не менял")
        return
    if not config_ok:
        die("конфиг не принят ядром — в панель не заливаю")

    print("\n=== что будет создано")
    print("  профиль/инбаунд : %s" % args.tag)
    print("  нода            : %s (%s:%d), страна %s" % (args.name, args.ip, NODE_API_PORT, args.country))
    print("  host            : %s -> %s:443, path %s, sni %s, fp edge" %
          (args.remark, client_address, args.path, sni))
    print("  обкаточный сквод: %s (в боевые НЕ добавляю)" % args.test_squad)
    if not args.yes:
        try:
            answer = input("Создавать? [y/N]: ").strip().lower()
        except EOFError:
            die("нет терминала для подтверждения — запусти через ssh -t или добавь --yes")
        if answer not in ("y", "yes", "да"):
            die("отменено")

    panel = Panel()
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = pathlib.Path("/opt/pulsar/backups/remnawave-newnode-%s" % ts)
    backup.mkdir(parents=True, exist_ok=True)
    (backup / "state-before.json").write_text(json.dumps({
        "nodes": panel.call("GET", "/api/nodes"),
        "hosts": panel.call("GET", "/api/hosts"),
        "squads": panel.call("GET", "/api/internal-squads"),
    }, ensure_ascii=False, indent=1))
    print("\nбэкап состояния панели: %s" % backup)

    print("1) профиль")
    prof = panel.call("POST", "/api/config-profiles", {"name": args.tag, "config": config})
    inbound = prof["inbounds"][0]
    print("   %s | inbound %s (%s/%s)" % (prof["uuid"], inbound["uuid"],
                                          inbound.get("network"), inbound.get("security")))

    print("2) нода")
    node = panel.call("POST", "/api/nodes", {
        "name": args.name, "address": args.ip, "port": NODE_API_PORT,
        "countryCode": args.country, "isTrafficTrackingActive": False,
        "trafficLimitBytes": 0, "notifyPercent": 0, "trafficResetDay": 1,
        "consumptionMultiplier": 1,
        "configProfile": {"activeConfigProfileUuid": prof["uuid"],
                          "activeInbounds": [inbound["uuid"]]},
    })
    print("   %s | connected=%s" % (node["uuid"], node.get("isConnected")))

    print("3) обкаточный сквод (иначе инбаунд не доедет до ноды)")
    squads = panel.call("GET", "/api/internal-squads")["internalSquads"]
    squad = next((s for s in squads if s["name"] == args.test_squad), None)
    if squad is None:
        squad = panel.call("POST", "/api/internal-squads",
                           {"name": args.test_squad, "inbounds": [inbound["uuid"]]})
        print("   создан сквод %s" % args.test_squad)
    else:
        merged = sorted({i["uuid"] for i in squad.get("inbounds", [])} | {inbound["uuid"]})
        panel.call("PATCH", "/api/internal-squads", {"uuid": squad["uuid"], "inbounds": merged})
        after = next(s for s in panel.call("GET", "/api/internal-squads")["internalSquads"]
                     if s["uuid"] == squad["uuid"])
        print("   %s -> %s" % (args.test_squad, [i["tag"] for i in after["inbounds"]]))

    print("4) host")
    extra = None
    if args.type == "cdn":
        extra = dict(cdn_xhttp(args.path))
        extra["xmux"] = CDN_XMUX
    else:
        extra = {"mode": "auto"}
    host = panel.call("POST", "/api/hosts", {
        "inbound": {"configProfileUuid": prof["uuid"],
                    "configProfileInboundUuid": inbound["uuid"]},
        "remark": args.remark,
        "address": client_address, "port": 443, "path": args.path,
        "sni": sni, "host": client_address,
        "alpn": alpn,
        "fingerprint": "edge",          # chrome не проходит российский DPI
        "securityLayer": security_layer,
        "xhttpExtraParams": extra,
        "isDisabled": False,
    })
    print("   %s | %s" % (host["uuid"], host["remark"]))

    time.sleep(8)
    node2 = next(n for n in panel.call("GET", "/api/nodes") if n["uuid"] == node["uuid"])
    print("\nнода после создания: connected=%s disabled=%s inbounds=%s" % (
        node2["isConnected"], node2["isDisabled"],
        [i["tag"] for i in node2["configProfile"]["activeInbounds"]]))
    if node2["isDisabled"]:
        panel.call("POST", "/api/nodes/%s/actions/enable" % node["uuid"])
        print("  -> включил обратно")

    ids = {"type": args.type, "profile": prof["uuid"], "inbound": inbound["uuid"],
           "node": node["uuid"], "host": host["uuid"], "path": args.path,
           "domain": args.domain, "client_address": client_address,
           "port": args.port, "backup": str(backup)}
    if keys:
        ids["reality_public_key"] = keys[1]
    out = pathlib.Path("/root/node-%s-ids.json" % args.name.lower())
    out.write_text(json.dumps(ids, ensure_ascii=False, indent=1))

    port_hint = args.port if args.type == "cdn" else 443
    print("""
────────────────────────────────────────────────────────────────────────
СОЗДАНО. id: %s

Проверить на ноде (порт должен был открыться сразу после шага 3):
  ss -ltn | grep %s

Проверить снаружи:
  curl -sI https://%s/health          # для cdn: ждём 200 и Cache-Host

Тест реальным трафиком: добавь тестовому пользователю обкаточный сквод «%s»,
обнови подписку в клиенте и проверь ИЗ РФ.

Выдать пользователям (только после проверки):
  bash /opt/pulsar/attach-inbound.sh %s PulsarLTE
────────────────────────────────────────────────────────────────────────
""" % (out, port_hint, client_address, args.test_squad, inbound["uuid"]))


if __name__ == "__main__":
    main()

# Обход белых списков: VLESS + xHTTP через Yandex Cloud CDN

Гайд по настройке с нуля, собранный по реальному опыту отладки. Схема пропускает трафик через CDN, чей IP находится в «белых списках» российских операторов, поэтому работает там, где прямое подключение к VPS душится.

### Плейсхолдеры (заменить на свои значения)

| Плейсхолдер | Что это |
|---|---|
| `<ORIGIN_IP>` | публичный IP вашего origin-сервера |
| `origin.example.com` | домен origin (на нём TLS-сертификат, к нему ходит CDN) |
| `cdn.example.com` | домен CDN, к которому подключается клиент |
| `example.com` | ваш базовый домен |
| `<id>.topology.gslb.yccdn.ru` | CNAME-таргет, который выдаст Yandex после создания ресурса |

## Итоговая архитектура

```
Клиент (Happ/v2rayN) 
   │  VLESS + xHTTP (packet-up, GET-uplink)
   ▼
Yandex Cloud CDN  (edge 188.72.110.x / 188.72.111.x — в белом списке)
   │  HTTPS, Host: origin.example.com
   ▼
nginx на origin  (терминирует TLS, location / → проксирует всё в Xray)
   │  http://127.0.0.1:11443
   ▼
Xray inbound (vless, xhttp, security none) → freedom outbound → интернет
```

Выход получается в РФ (origin в Яндекс Облаке). Это обходит шейпинг белых списков. Для зарубежных ресурсов, банящих российские IP, нужен дополнительный заграничный выход в цепочке (см. раздел в конце).

---

## Ключевые принципы (почему именно так)

Три вещи, без которых ничего не поедет, — они и были главными граблями:

1. **GET-uplink вместо POST.** xHTTP packet-up по умолчанию шлёт исходящие пакеты методом POST. Многие российские CDN режут POST (отдают 403). Решение — увести uplink на GET (`uplinkHTTPMethod: GET`) и спрятать данные в заголовки/cookie/query.

2. **Правильная CDN-сеть.** CDNvideo (домены `*.trbcdn.net`) и Timeweb CDN (`*.cdn.twcstorage.ru`, это реселл той же trbcdn-инфраструктуры) блокируют такой трафик на edge — `403 x-cdn-edge-cache: HIT`, до origin запрос не доходит, из панели не лечится. **Yandex Cloud CDN — другая edge-сеть, она пропускает.**

3. **Короткий путь.** Yandex CDN проксирует на origin односегментные пути (`/poll`), а многосегментные (`/api/v4/media/session/poll`) рубит, отдавая свой 404. Поэтому path должен быть коротким: `/poll`.

---

## Предусловия

- VPS с публичным IP (origin). В этом гайде origin развёрнут в Яндекс Облаке, но подойдёт любой провайдер.
- Свой домен с управляемым DNS (в примерах DNS на Cloudflare).
  - `origin.example.com` → A-запись на `<ORIGIN_IP>`, **DNS only (серая тучка)**.
  - `cdn.example.com` → будет CNAME на Yandex CDN.
- На origin установлены nginx, Xray (через панель Remnawave / remnanode в Docker), выпущен Let's Encrypt сертификат на `origin.example.com`.
- Аккаунт в Yandex Cloud с включённым сервисом Cloud CDN.

---

## Шаг 1. nginx на origin

nginx терминирует TLS на `origin.example.com` и проксирует **весь** трафик в Xray. Отдельный location на путь не нужен — `location /` ловит всё, поэтому смена пути в Xray не требует правки nginx.

Ключевые директивы в server-блоке (`server_name origin.example.com`, listen 443 ssl):

```nginx
upstream xray_xhttp_get {
    server 127.0.0.1:11443;
    keepalive 256;
}

server {
    listen 443 ssl http2;
    server_name origin.example.com;

    ssl_certificate     /etc/letsencrypt/live/origin.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/origin.example.com/privkey.pem;

    client_max_body_size 0;
    client_body_timeout 900s;
    client_header_timeout 900s;

    location = /health {
        default_type application/json;
        return 200 '{"status":"ok"}';
    }

    location / {
        access_log /var/log/nginx/xhttp_access.log xhttp_min;
        proxy_pass http://xray_xhttp_get;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Connection "";
        proxy_buffering off;            # критично для стрима
        proxy_request_buffering off;    # критично для стрима
        proxy_cache off;
        gzip off;
        add_header X-Accel-Buffering "no" always;
        proxy_connect_timeout 30s;
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
    }
}
```

Лог-формат для удобной диагностики (в http-блоке):

```nginx
log_format xhttp_min '$remote_addr $time_local host="$host" '
                     'proto="$server_protocol" "$request" '
                     'st=$status bytes=$body_bytes_sent '
                     'rt=$request_time urt="$upstream_response_time"';
```

Проверить и применить:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## Шаг 2. Xray inbound (Config Profile)

Серверный inbound: vless + xhttp, слушает только localhost (nginx до него проксирует). Главное — `mode: packet-up`, короткий `path: /poll` и блок `extra` с GET-uplink.

```json
{
  "tag": "cdn-get-inbound",
  "port": 11443,
  "listen": "127.0.0.1",
  "protocol": "vless",
  "settings": { "clients": [], "decryption": "none" },
  "sniffing": { "enabled": true, "destOverride": ["http", "tls", "quic"] },
  "streamSettings": {
    "network": "xhttp",
    "security": "none",
    "xhttpSettings": {
      "mode": "packet-up",
      "path": "/poll",
      "extra": {
        "xmux": {
          "cMaxReuseTimes": "0",
          "maxConcurrency": "4-8",
          "hKeepAlivePeriod": 0,
          "hMaxRequestTimes": "0",
          "hMaxReusableSecs": "0"
        },
        "seqKey": "offset",
        "headers": {
          "Accept": "application/vnd.api+json, application/json, text/plain, */*",
          "Pragma": "no-cache",
          "Cache-Control": "no-cache",
          "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
        },
        "sessionKey": "media_sid",
        "xPaddingKey": "q",
        "seqPlacement": "query",
        "uplinkDataKey": "X-Playback-Token",
        "xPaddingBytes": "48-320",
        "xPaddingHeader": "X-Rewrite-URL",
        "xPaddingMethod": "tokenish",
        "sessionPlacement": "cookie",
        "uplinkHTTPMethod": "GET",
        "xPaddingObfsMode": true,
        "xPaddingPlacement": "queryInHeader",
        "scMaxBufferedPosts": 32,
        "scMaxEachPostBytes": "1536-6144",
        "uplinkDataPlacement": "header",
        "scMinPostsIntervalMs": "4-18",
        "serverMaxHeaderBytes": 32768
      }
    }
  }
}
```

**Важно:** этот `extra` должен совпадать в двух местах — в Config Profile (сервер) и в Host (клиентская подписка). В Host поле `path` указывается отдельно, в extra его дублировать не нужно.

Требуется свежее ядро Xray и на сервере, и в клиенте (например, 26.3.27 с обеих сторон), иначе GET-uplink-поля игнорируются и клиент откатывается на POST.

---

## Шаг 3. Сертификат на cdn.example.com

Yandex CDN отдаёт клиенту HTTPS, значит нужен сертификат на CDN-домен.

1. Yandex Cloud → **Certificate Manager** → создать сертификат Let's Encrypt на `cdn.example.com`.
2. Тип проверки — **DNS**.
3. Yandex выдаст CNAME-запись для валидации, например:
   ```
   Имя:     _acme-challenge.cdn.example.com
   Тип:     CNAME
   Значение: <случайное>.cm.yandexcloud.net
   ```
4. На **Cloudflare** добавить эту запись:
   - Type: `CNAME`, Name: `_acme-challenge.cdn`, Target: значение от Yandex (без точки на конце)
   - **Proxy: DNS only (серая тучка)**
5. Проверить, что разошлось:
   ```bash
   dig +short CNAME _acme-challenge.cdn.example.com
   ```
6. Дождаться статуса сертификата **«Выпущен»** (от минут до получаса).

**Не удаляй** запись `_acme-challenge` после выпуска — она нужна для автопродления (сертификат живёт 90 дней).

---

## Шаг 4. CDN-ресурс в Yandex Cloud

Yandex Cloud → **Cloud CDN** → создать ресурс.

**Основные настройки / Контент:**
- Запрос контента: «Из одного источника», тип «Сервер».
- Доменное имя источника: `origin.example.com`
- Протокол для источников: **HTTPS**
- Заголовок Host: «Своё значение» → `origin.example.com`
- Доменное имя (CDN): `cdn.example.com`

**Дополнительно (источник):**
- Проверять сертификат источника: **выключено**
- Указать имя SNI-хоста: **включено** → `origin.example.com`

**Сертификат:**
- Тип сертификата: «Сертификат из Certificate Manager» → выбрать выпущенный на шаге 3.
- Профиль TLS: «Безопасный (TLSv1.2+)».

**Кеширование** (всё выключить — CDN должен прозрачно пробрасывать, а не кэшировать):
- Кеширование в CDN: **выключено**
- Кеширование в браузере: **выключено**
- Игнорировать cookie: **снять** (cookie несёт сессию `media_sid`)
- Игнорировать query-параметры: **снять** (query несёт `offset`)
- gzip-сжатие: **выключено**
- Сегментация больших файлов: **снять**

**HTTP-заголовки и методы:**
- Заголовки запроса/ответа: ничего не добавлять.
- CORS: «Не добавлять».
- Разрешённые методы: **GET** (можно добавить HEAD, OPTIONS).

**Дополнительно:**
- Выгрузка логов: выключено.
- Экранирование (shielding): **выключено** (промежуточный кэш-слой вреден для стрима).

---

## Шаг 5. DNS на CDN-домен

После создания ресурса Yandex покажет CNAME-таргет, например:
```
cdn.example.com  CNAME  <id>.topology.gslb.yccdn.ru
```

На **Cloudflare** создать запись:
- Type: `CNAME`, Name: `cdn`, Target: `<id>.topology.gslb.yccdn.ru`
- **Proxy: DNS only (СЕРАЯ ТУЧКА)** — критично. Оранжевое облако (Proxied) всё сломает.

Проверить резолв:
```bash
dig +short cdn.example.com
# Должно вести на yccdn.ru и в итоге на IP 188.72.x (Yandex edge),
# НЕ на IP Cloudflare (104.x / 172.67.x)
```

---

## Шаг 6. Host в клиентской панели (Remnawave)

- Address: `cdn.example.com`
- SNI: `cdn.example.com`
- Host: `cdn.example.com`
- Port: `443`
- Path: `/poll`
- Mode: `packet-up`, ALPN: `h2, http/1.1`, fingerprint: `chrome`
- xHTTP extra params: тот же блок `extra`, что в Config Profile (без поля `path`).

Сохранить, обновить подписку в клиенте.

---

## Шаг 7. Проверка

Истинный тест — реальный клиент (curl не умеет в полноценную xhttp-сессию и будет давать 400/404, это нормально). Подключись клиентом и смотри лог origin:

```bash
sudo tail -f /var/log/nginx/xhttp_access.log
```

Признаки рабочего тоннеля:
- IP запросов — **`188.72.110.x` / `188.72.111.x`** (edge Yandex → значит трафик идёт через CDN, а не напрямую).
- `GET /poll/?offset=0,1,2...` со `st=200` — uplink (GET-метод обфускации работает).
- `GET /poll/` с `bytes=...` (тысячи/десятки тысяч байт) — downlink, реальные данные.
- `rt=60..180` секунд на downlink-стримах — **норма** для packet-up (долгий GET держит канал).

Статистика в панели Yandex CDN (Edge bytes sent / Origin bytes fetched) подтягивается с задержкой в десятки минут — лог сервера надёжнее и мгновенен.

---

## Диагностика по слоям (если не работает)

Проверка идёт от CDN к origin. Главный инструмент — curl с сервера + лог.

**1. Доходит ли запрос через CDN до origin?**
```bash
curl -k -s -D - -o /dev/null "https://cdn.example.com/poll?offset=0"
sudo tail -n 3 /var/log/nginx/xhttp_access.log
```
- В ответе `cache-host: yccdn...` и **в логе появилась строка с `188.72.x`** → CDN дошёл до origin. Хорошо.
- `403` + `x-cdn-edge-cache: HIT`, в логе пусто → CDN блокирует на edge (это симптом trbcdn/CDNvideo/Timeweb — меняй CDN-сеть).
- `404` от `yccdn`, в логе пусто → путь не проксируется (проверь, что путь односегментный: `/poll`, а не `/api/v4/...`).

**2. Отвечает ли origin напрямую (минуя CDN)?**
```bash
curl -k -s -D - -o /dev/null --resolve origin.example.com:443:<ORIGIN_IP> \
  "https://origin.example.com/poll?offset=0"
```
- `400` + заголовок `x-rewrite-url: ?q=...` → Xray жив и отвечает по схеме (это правильный «голый» ответ на curl). Если так — сервер исправен, проблема в CDN/клиенте.

**3. Совпадает ли path?** Path в Config Profile и в Host должны быть одинаковыми и односегментными. Несовпадение → Xray отдаёт 404.

**4. Версии ядра Xray** на сервере и клиенте должны поддерживать GET-uplink (в примере — 26.3.27). Если в логах ноды `unknown field uplinkHTTPMethod` — ядро старое.

---

## Что НЕ сработало (чтобы не повторять)

- **CDNvideo** (`*.trbcdn.net`) — режет трафик на edge, `403 HIT`, не лечится из панели (ни очистка кэша, ни пересоздание ресурса, ни смена SNI/методов).
- **Timeweb CDN** (`*.cdn.twcstorage.ru`) — реселл той же trbcdn-инфраструктуры, те же заголовки `x-cdn-edge-*`, тот же `403 HIT`.
- Признак «не той» сети: в ответе заголовки `x-cdn-edge-id` / `x-cdn-edge-cache`. У Yandex — `cache-host: yccdn...`.
- **Многосегментный путь** `/api/v4/media/session/poll` — Yandex рубит, отдаёт свой 404. Только односегментный.
- **POST-uplink** (дефолт) — режется CDN. Только GET.

---

## Опционально: заграничный выход (цепочка)

Текущий выход — в РФ, обходит белые списки, но ресурсы, банящие российские IP, не откроет. Чтобы открывались и они, добавляется заграничный сервер как выход:

```
Клиент → Yandex CDN → РФ-сервер (мост) → outbound vless/Reality на заграничную ноду → интернет
```

На РФ-сервере (мосту) в Xray добавляется outbound `vnext` на заграничную ноду (например, Reality), и в routing прописывается: РФ-трафик — напрямую (`freedom`), остальное — в заграничный outbound. Требуется отдельный VPS за рубежом.

Примечание из практики: маршрут через дата-центр Яндекса оказался «чище» магистральных ТСПУ — YouTube и Discord-текст могут открываться и без заграничного моста. Discord-войс блокируется отдельно и жёстче — его стоит проверить отдельно; если не идёт, мост понадобится именно для него.

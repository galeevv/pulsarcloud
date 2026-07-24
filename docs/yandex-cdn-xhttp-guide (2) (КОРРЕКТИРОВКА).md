Как настроен обход блокировок через CDN (WConnect)
1. Идея в двух словах
Российские CDN имеют «белые» IP, которые есть в вайтлистах РКН (их не блокируют). Мы прячем VPN-трафик за таким CDN: для провайдера это выглядит как обычное обращение к российскому CDN (медиа/статика), а на деле — туннель на зарубежный сервер.


Клиент → CDN (российский white-IP) → origin-VPS (за рубежом) → nginx → xray → интернет
2. Протокол
XHTTP, режим packet-up.
Uplink — метод DELETE, downlink — GET.
Почему так: российские CDN режут POST/WebSocket, но пропускают GET/DELETE. Трафик маскируется под медиа-стриминг.
3. Какой CDN брать
CDN Годится? Примечание
VK Cloud CDN ✅ Стабильно, коннект ~1с, проходит у всех операторов
Яндекс Cloud CDN ✅ Рабочий, IP в вайтлистах РКН
CDNvideo ⚠️ Часть edge-нод буферизует, бывают висяки ~18с
Timeweb CDN ❌ Обхода не даёт (нет в вайтлистах)
Cloudflare ❌ Диапазоны CF в бане у РКН — не использовать
Рекомендация: VK Cloud или Яндекс.

4. Критичные настройки (без них не работает)
noSSEHeader: false — и на сервере (inbound), и на клиенте (host). Если true → CDN буферизует downlink, туннель виснет на ~16с.
В nginx на origin: X-Accel-Buffering: no + Cache-Control: no-store, no-transform — особенно критично для VK Cloud.
Gzip/Brotli выключить на CDN — иначе CDN жмёт ответы и ломает бинарный VPN-трафик.
Клиент на xray-core 26.x — старые клиенты игнорируют uplinkHTTPMethod, шлют POST → сервер отвечает 400.
Импорт конфига JSON-файлом, а не vless://-ссылкой — ссылка теряет блок extra с нужными параметрами.
CDN не должен проверять сертификат origin (там self-signed) — либо отключить проверку, либо ходить на origin по HTTP:80.
5. Панель
Используем Remnawave (не 3x-ui): нативно тянет несколько нод, подписки, хосты, VLESS Encryption. Origin-VPS — за рубежом, за ним nginx → xray.

6. ⚠️ Важное предупреждение про аккаунт CDN
Российские CDN/облака (VK, Яндекс) банят аккаунт за VPN/обход, и при бане деньги на балансе сгорают (не возвращают). Поэтому:

не держи большой пополняемый баланс на таком аккаунте;
предпочтительнее ресурсы с разовой/помесячной оплатой без накопления, чтобы риск был ограничен стоимостью месяца, а не всей суммой.
Если хочешь — оформлю это как красивую веб-страницу (артефакт), которую другу удобно открыть по ссылке, или наоборот ужму в короткую шпаргалку. Также могу добавить конкретный пример JSON-конфига (сервер + клиент) с нужными полями noSSEHeader, uplinkHTTPMethod и т.д. — скажи, включать ли реальные значения.
Ниже — рабочий шаблон конфигов (по нашей схеме: VLESS + XHTTP packet-up, DELETE-uplink, за CDN). Схему полей сверил с официальной спецификацией XTLS. Значения-плейсхолдеры замени на свои; ⚠️ помечены поля, чувствительные к версии xray.
1. Сервер (Xray inbound на origin-VPS, за nginx){
  "listen": "127.0.0.1",
  "port": 8080,
  "protocol": "vless",
  "settings": {
    "clients": [
      { "id": "ВСТАВЬ-UUID" }
    ],
    "decryption": "none"
  },
  "streamSettings": {
    "network": "xhttp",
    "security": "none",
    "xhttpSettings": {
      "path": "/ВАШ-СЕКРЕТНЫЙ-ПУТЬ",
      "mode": "packet-up",
      "extra": {
        "noSSEHeader": false,
        "scMaxEachPostBytes": 1000000,
        "scMaxBufferedPosts": 30,
        "xPaddingBytes": "100-1000"
      }
    }
  }
}
TLS не на xray, а на nginx/CDN — поэтому inbound слушает локально с security: none, а наружу его публикует nginx.
2. Клиент (Xray outbound){
  "protocol": "vless",
  "settings": {
    "vnext": [
      {
        "address": "cdn-домен.ru",
        "port": 443,
        "users": [
          { "id": "ВСТАВЬ-UUID", "encryption": "none" }
        ]
      }
    ]
  },
  "streamSettings": {
    "network": "xhttp",
    "security": "tls",
    "tlsSettings": {
      "serverName": "cdn-домен.ru",
      "allowInsecure": false
    },
    "xhttpSettings": {
      "host": "cdn-домен.ru",
      "path": "/ВАШ-СЕКРЕТНЫЙ-ПУТЬ",
      "mode": "packet-up",
      "extra": {
        "uplinkHTTPMethod": "DELETE",
        "noSSEHeader": false,
        "scMaxEachPostBytes": 1000000,
        "scMinPostsIntervalMs": 30,
        "xPaddingBytes": "100-1000"
      }
    }
  }
}
Что критично именно у нас:
⚠️ uplinkHTTPMethod: "DELETE" — задаёт метод uplink (обход POST-фильтра CDN). Требует xray-core 26.x; старые клиенты это поле игнорируют и шлют POST → CDN/сервер отвечает 400. В части сборок поле может лежать иначе — сверься с рабочим экспортом из Remnawave.noSSEHeader: false — по умолчанию и так false, главное не ставить true, иначе CDN буферизует downlink и туннель виснет ~16с. (По офиц. схеме это серверное поле; у нас исторически прописано с обеих сторон — оставь как есть.)host = домен CDN — приоритет host в XHTTP: host > serverName > address.path должен совпадать на клиенте и сервере.3. nginx на origin (обязательно, иначе висяки)location /ВАШ-СЕКРЕТНЫЙ-ПУТЬ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_cache off;
    add_header X-Accel-Buffering no;
    add_header Cache-Control "no-store, no-transform";
    chunked_transfer_encoding off;
}
4. Настройки самого CDN (VK Cloud / Яндекс)Gzip/Brotli — OFF (сжатие ломает бинарный трафик).Кэширование — OFF для этого пути (no-store).Пробрасывать все методы (GET/DELETE), не резать по методу.Не проверять сертификат origin (там self-signed) — или ходить на origin по HTTP:80.Host-заголовок пробрасывать как есть.Важные оговоркиСхема полей менялась между версиями xray (часть параметров переехала в extra), поэтому эталон — не мой шаблон, а рабочий JSON, который отдаёт наша Remnawave-подписка: экспортни его и сравни имена полей. Мой конфиг — чтобы понять структуру и что где стоит.Импортировать другу JSON-файлом, а не vless://-ссылкой — ссылка теряет блок extra.Sources:
XHTTP transport — XTLS docsXHTTP: Beyond REALITY (спецификация полей, discussion #4113)xray-core conf package (Go struct: UplinkHTTPMethod, NoSSEHeader)Обзор XHTTP для VLESS (Habr)






{
  "log": {
    "loglevel": "warning"
  },
  "dns": {
    "servers": [
      "1.1.1.1",
      "8.8.8.8",
      "77.88.8.8",
      "localhost"
    ]
  },
  "inbounds": [
    {
      "tag": "cdn-stream",
      "port": 10085,
      "listen": "127.0.0.1",
      "protocol": "vless",
      "settings": {
        "clients": [],
        "decryption": "none"
      },
      "sniffing": {
        "enabled": true,
        "destOverride": [
          "http",
          "tls"
        ]
      },
      "streamSettings": {
        "network": "xhttp",
        "security": "none",
        "xhttpSettings": {
          "host": "",
          "mode": "packet-up",
          "path": "/content/media/stream/",
          "xmux": {
            "cMaxReuseTimes": "0",
            "maxConnections": "2",
            "hKeepAlivePeriod": 0,
            "hMaxRequestTimes": "100-200",
            "hMaxReusableSecs": "300-600"
          },
          "noSSEHeader": false,
          "xPaddingKey": "_token",
          "xPaddingBytes": "16-64",
          "xPaddingHeader": "X-Signature",
          "xPaddingMethod": "tokenish",
          "uplinkHTTPMethod": "GET",
          "xPaddingObfsMode": true,
          "xPaddingPlacement": "query",
          "scMaxBufferedPosts": 50,
          "scMaxEachPostBytes": "500000-1000000",
          "uplinkDataPlacement": "body",
          "scMinPostsIntervalMs": "50-150",
          "scStreamUpServerSecs": "60-180",
          "serverMaxHeaderBytes": 0
        }
      }
    }
  ],
  "outbounds": [
    {
      "tag": "direct",
      "protocol": "freedom"
    },
    {
      "tag": "block",
      "protocol": "blackhole"
    }
  ],
  "routing": {
    "rules": [
      {
        "ip": [
          "geoip:private"
        ],
        "type": "field",
        "outboundTag": "direct"
      },
      {
        "type": "field",
        "protocol": [
          "bittorrent"
        ],
        "outboundTag": "block"
      }
    ]
  }
}
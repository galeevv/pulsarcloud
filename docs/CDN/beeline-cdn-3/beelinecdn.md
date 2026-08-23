Начнем с установки ноды через скрипт

Заходим по ssh, и вставляем данную команду -

bash <(curl -Ls https://raw.githubusercontent.com/eGamesAPI/remnawave-reverse-proxy/refs/heads/main/install_remnawave.sh)

Выбераем - Русский - Установка компонентов - Установить только Remanode - nginx

После того, как в у вас установка прошла, напишет 
1. Введите домен ( вводите домен который, вы направимли A записью на ноду )
2. Указываете IP адрес панели Remnawave ( то есть, IP адрес VM, где стоит панель )
3. Вставляете secretkey, который вы получите при создание ноды в панели remnawave

Потом когда появится SSL выбираем 2

Все ждем окончания!

Дальше, заходим по FTP на сервер , где вы установили ноду, открываем /opt/remnanode

Там будет лежать nginx, открываем удаляем содержимое , вставляете это, и меняете на свое, где написано - 
тут пишите свой домен.com


server {
    listen 80;
    server_name тут пишите свой домен.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name тут пишите свой домен.com;

    ssl_certificate     /etc/nginx/ssl/тут пишите свой домен.com/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/тут пишите свой домен.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;

location = /static/getFile/video/segment.ts {
    proxy_pass http://127.0.0.1:4443/static/getFile/video/segment.ts/;

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;

    proxy_buffering off;
    proxy_request_buffering off;
}

location /static/getFile/video/segment.ts/ {
    proxy_pass http://127.0.0.1:4443;

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;

    proxy_buffering off;
    proxy_request_buffering off;
}
}


Сохраняем, дальше возвращаем в терминал ssh, и пишем
1 . команда
cd /opt/remnanode
2. комнда
docker exec remnawave-nginx nginx -t && docker restart remnawave-nginx

Скриншот (1,2,3)

Дальше настраиваем CDN

Заполняете свои данные, и важно все делаете как на скринах!!

Дальше выключаем все кэширование.

Ждем минут 15-30

Заходим в Remnawave, создаем кфг, вставляем это

{
  "log": {
    "loglevel": "warning"
  },
  "dns": {},
"inbounds": [
    {
      "tag": "CDN",
      "port": 4443,
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
          "tls",
          "quic"
        ]
      },
      "streamSettings": {
        "network": "xhttp",
        "security": "none",
        "xhttpSettings": {
          "mode": "packet-up",
          "path": "/static/getFile/video/segment.ts",
          "extra": {
            "xmux": {
              "maxConcurrency": "1"
            },
            "seqKey": "chunk_id",
            "sessionKey": "auth",
            "noSSEHeader": true,
            "noGRPCHeader": true,
            "seqPlacement": "query",
            "sessionIDKey": "auth",
            "xPaddingBytes": "50-150",
            "xPaddingMethod": "tokenish",
            "sessionIDLength": "16-32",
            "sessionPlacement": "query",
            "uplinkHTTPMethod": "GET",
            "xPaddingObfsMode": true,
            "xPaddingPlacement": "header",
            "scMaxBufferedPosts": 100,
            "scMaxEachPostBytes": 3000000,
            "sessionIDPlacement": "query",
            "uplinkDataPlacement": "body",
            "scMinPostsIntervalMs": "5-10",
            "serverMaxHeaderBytes": 32768
          }
        }
      }
    }
  ],
  "outbounds": [
    {
      "tag": "DIRECT",
      "protocol": "freedom"
    },
    {
      "tag": "BLOCK",
      "protocol": "blackhole"
    }
  ],
  "routing": {
    "rules": []
  }
}

Подключаем этот кфг к ноде в панели! ( главная ошибка )

(Скриншот 4,5)

Создаем хост в remnawave ( подставляем свой домен, хост и SNI), который мы получили от Билайна!
Отпечаток edge ставим!
Также подключаем кфг к хосту, и проверяем чтобы был адрес и порт 443!!!!
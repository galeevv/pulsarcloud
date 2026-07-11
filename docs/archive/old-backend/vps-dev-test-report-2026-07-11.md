# Pulsar 2.0: отчет по подготовке dev/test VPS

Дата проверки: 2026-07-11

Целевой сервер: `31.76.27.41`

Основной URL: `https://app.pulsar-cloud.space`

## Итоговый статус

После восстановления SSH владельцем развертывание выполнено фактически. Pulsar
web, worker, Caddy, Remnawave Panel 2.8.0, PostgreSQL, Valkey и Remnawave
Subscription Page 7.2.6 запущены. TLS работает для apex, `app`, `panel` и `sub`.
UFW включен, внутренние listeners доступны только через loopback, оба backup
таймера включены и протестированы восстановительными проверками формата.

Единственный инфраструктурный blocker: публичные резолверы Cloudflare и Google
возвращают `NXDOMAIN` для `www.pulsar-cloud.space`. Остальные четыре имени
разрешаются в `31.76.27.41`. Кодовые ограничения production-интеграций Pulsar
перечислены ниже и не скрыты инфраструктурой.

## Фактические параметры развертывания

- Ubuntu 26.04 LTS, kernel `7.0.0-27-generic`;
- Node.js 22.22.1, npm 9.2.0, Next.js 16.2.6;
- Docker 29.6.1, Docker Compose 5.3.1;
- Caddy 2.6.2;
- Prisma runtime SQLite 3.53.2;
- SQLite PRAGMA: WAL, foreign keys ON, synchronous FULL, busy timeout 5000,
  temp store MEMORY;
- 2 GiB swap создан и добавлен в `/etc/fstab`;
- UFW: default deny incoming; rate-limit SSH; разрешены 80/tcp и 443/tcp;
- Pulsar commit: `16658c7d1f0481fa78306bf0664798a21e11e989`;
- super-admin Remnawave: credentials находятся только в
  `/root/remnawave-superadmin.env`, mode `0600`;
- Pulsar env: `/etc/pulsar/pulsar.env`, mode `0640`, `root:pulsar`;
- Remnawave env-файлы имеют mode `0600`.

## Что проверено и подготовлено

### Репозиторий

- Ветка `main`, commit `16658c7` (`feat(billing): implement billing state
  machine and immutability constraints`), рабочее дерево до начала подготовки
  было чистым.
- Найден и изучен VPS/integration handoff:
  `docs/integration-handoff.md`.
- Стек соответствует заявленному фундаменту: Next.js App Router 16.2.6,
  TypeScript strict, Prisma 7.8, SQLite и
  `@prisma/adapter-better-sqlite3`.
- Next.js 16.2.6 в этом репозитории требует Node.js `>=20.9.0`.
- База использует единый `pulsar.db`; код включает WAL, foreign keys,
  `synchronous=FULL`, busy timeout и проверку версии SQLite.

### Проверки качества

Выполнены без ошибок:

```text
npm test          13 passed, 0 failed
npm run lint      passed
npm run typecheck passed
npm run build     passed
```

Production build сформировал 23 страницы/маршрута, включая admin UI и
`/api/payments/webhook/[provider]`.

### DNS и внешний периметр

Следующие A-записи разрешаются в `31.76.27.41`:

- `pulsar-cloud.space`;
- `app.pulsar-cloud.space`;
- `panel.pulsar-cloud.space`;
- `sub.pulsar-cloud.space`.

`www.pulsar-cloud.space` возвращает `NXDOMAIN` через `1.1.1.1` и `8.8.8.8`.
Из-за этого Caddy не может получить сертификат для `www` до исправления DNS.

Внешняя приемка:

- `https://app.pulsar-cloud.space/` — 200;
- `https://panel.pulsar-cloud.space/` — 200;
- действительная временная subscription-ссылка через `sub` — 200;
- apex сохраняет URI и перенаправляет на `app`;
- Platega GET — 405, Telegram webhook — 404, что соответствует фактическому
  коду;
- сертификаты apex/app/panel/sub прошли системную TLS verification.

### Подготовленные deploy-файлы

Файлы находятся в `ops/`:

- `Caddyfile` — redirect apex/www и reverse proxy на три loopback upstream;
- `systemd/pulsar-web.service` — один Next.js process на
  `127.0.0.1:3100`;
- `systemd/pulsar-worker.service` — один worker;
- `pulsar-backup` и timer/service — online SQLite backup, integrity check,
  SHA-256 и retention 14 дней;
- `remnawave-backup` и timer/service — PostgreSQL custom dump, проверка через
  `pg_restore --list`, SHA-256 и retention 14 дней;
- `pulsar.env.example` — шаблон без секретов;
- `remnawave-subscription.compose.yml` — subscription page только на
  `127.0.0.1:3010`;
- `remnawave-subscription.env.example` — шаблон без API token.

План портов:

| Компонент | Listener | Публичный вход |
| --- | --- | --- |
| Caddy | `0.0.0.0:80/443` | да |
| Pulsar web | `127.0.0.1:3100` | через Caddy |
| Remnawave Panel | `127.0.0.1:3000` | через Caddy |
| Subscription Page | `127.0.0.1:3010` | через Caddy |
| Pulsar worker | без listener | нет |
| Remnawave Node | не устанавливается | нет |

## Фактическая готовность функций

### Реализовано

- Next.js web UI и защищенные user/admin layouts;
- cookie sessions и email OTP/magic-link foundation;
- Prisma schema, миграции и SQLite runtime safety;
- billing state machine, immutable quotes, idempotent mock webhook;
- subscription, wallet/referral domain operations;
- один durable-job worker с claim/retry mechanics;
- admin pages, включая users, payments, subscriptions, nodes и logs.

### Не реализовано или только mock

#### Email / Resend

Resend adapter отсутствует. `RESEND_API_KEY` кодом не читается, а worker для
`SEND_AUTH_EMAIL` выбрасывает `IntegrationError`. При `DEV_SHOW_OTP=false`
публичный email login не может завершиться.

`DEV_SHOW_OTP=true` нельзя безопасно включать на открытом домене: OTP
возвращается браузеру и показывается в UI. В сочетании с seeded admin-email это
дает возможность войти администратором без доступа к почте.

#### Telegram

Реального Telegram client нет; используется `MockTelegramAuthService`.
Маршрут `POST /api/telegram/webhook` отсутствует. Устанавливать webhook бота
нельзя — Telegram будет получать 404.

#### Platega

Маршрут `POST /api/payments/webhook/platega` синтаксически существует через
динамический `[provider]`, но `getPaymentProvider(PLATEGA)` всегда сообщает, что
provider не настроен. Реальная проверка подписи и обработка Platega отсутствуют;
endpoint будет отвечать 503.

Работает только mock provider при явных
`PAYMENT_PROVIDER=MOCK`, `ALLOW_MOCK_PAYMENT_PROVIDER=true` и защищенном
`MOCK_PAYMENT_WEBHOOK_SECRET`.

#### Remnawave provisioning

Есть интерфейс и `MockRemnawaveClient`, но API token/base URL не используются.
Worker не обрабатывает `PROVISION_SUBSCRIPTION` и `SYNC_SUBSCRIPTION`, а переводит
их в retry/failure. Установка самой Panel не свяжет Pulsar с Remnawave без
доработки adapter и job handlers.

#### Worker

Реально выполняются только очистка просроченных auth challenges и sessions.
Email, receipt, payment webhook processing, provisioning, sync и Telegram jobs
намеренно завершаются ошибкой интеграции.

#### Backup

Подготовлен локальный online backup, но это еще не production backup: копия
остается на том же VPS. Нужны off-site выгрузка, шифрование, мониторинг и
регулярный restore drill.

## Критические блокеры

1. **DNS www:** запись отсутствует у публичных резолверов. Нужно создать A или
   CNAME и дождаться распространения.
2. **Секреты:** Telegram bot token и Resend API key были переданы в сообщении.
   Их следует считать раскрытыми, отозвать и выпустить заново. Переданные
   значения не сохранены ни в одном подготовленном файле.
3. **Auth:** безопасной доставки email OTP нет. Не включать публичный dev OTP.
4. **Telegram webhook:** endpoint отсутствует.
5. **Platega:** endpoint path есть, production adapter отсутствует.
6. **Pulsar ↔ Remnawave:** production client и worker handlers отсутствуют.
7. **Off-site backup:** локальные проверенные backup существуют, но удаленное
   хранилище и его credentials не предоставлены.

## Восстановление SSH через консоль провайдера

Выполнить из VNC/serial/rescue console, не через SSH:

```bash
uptime
free -h
df -h
ss -ltnp 'sport = :22'
systemctl status ssh.service ssh.socket --no-pager
journalctl -u ssh.service -u ssh.socket -b --no-pager -n 200
sshd -t
nft list ruleset
```

Если `sshd -t` успешен, перезапустить listener:

```bash
systemctl restart ssh.socket ssh.service
systemctl --no-pager --full status ssh.socket ssh.service
```

До диагностики не сбрасывать firewall целиком и не менять SSH keys. После
восстановления проверить вход существующим ключом и только затем продолжать.

## Выполненный порядок развертывания

### 1. Базовая подготовка

```bash
apt-get update
apt-get full-upgrade -y
apt-get install -y ca-certificates curl git sqlite3 rsync ufw caddy
adduser --system --group --home /var/lib/pulsar pulsar
install -d -o pulsar -g pulsar -m 0750 /var/lib/pulsar
install -d -o pulsar -g pulsar -m 0700 /var/backups/pulsar
install -d -o root -g pulsar -m 0750 /etc/pulsar
```

Установить поддерживаемый Node.js и проверить `node --version`; версия должна
быть не ниже 20.9.0. Для нового VPS предпочтителен текущий LTS, а не случайный
устаревший пакет.

Для 4 GB RAM создать 2 GB swap, если swap отсутствует:

```bash
swapon --show
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Перед созданием убедиться, что `/swapfile` еще не существует и в `fstab` нет
дубликата.

### 2. Pulsar

```bash
git clone https://github.com/galeevv/pulsar2.git /opt/pulsar/current
cd /opt/pulsar/current
npm ci
install -m 0640 -o root -g pulsar ops/pulsar.env.example /etc/pulsar/pulsar.env
```

Сгенерировать новые `SESSION_SECRET` и `MOCK_PAYMENT_WEBHOOK_SECRET`:

```bash
openssl rand -hex 32
```

Записать разные значения в `/etc/pulsar/pulsar.env`, не в репозиторий. Не
добавлять раскрытые токены. Затем:

```bash
set -a
. /etc/pulsar/pulsar.env
set +a
npm run db:generate
npm run db:deploy
npm run build
chown -R root:pulsar /opt/pulsar/current
chown -R pulsar:pulsar /opt/pulsar/current/.next/cache /var/lib/pulsar
```

Не выполнять `db:seed` на публичном VPS до выбора безопасного способа первого
admin login.

### 3. systemd и backup

```bash
install -m 0644 ops/systemd/pulsar-web.service /etc/systemd/system/
install -m 0644 ops/systemd/pulsar-worker.service /etc/systemd/system/
install -m 0644 ops/systemd/pulsar-backup.service /etc/systemd/system/
install -m 0644 ops/systemd/pulsar-backup.timer /etc/systemd/system/
install -m 0755 ops/pulsar-backup /usr/local/sbin/pulsar-backup
systemd-analyze verify /etc/systemd/system/pulsar-*.service
systemctl daemon-reload
systemctl enable --now pulsar-web pulsar-worker pulsar-backup.timer
```

### 4. Remnawave Panel

Использовать актуальную официальную инструкцию Remnawave. Она устанавливает
Panel в `/opt/remnawave`, загружает официальный production compose и `.env`,
требует уникальные JWT/API/webhook/metrics/Postgres secrets и bind только на
`127.0.0.1`.

Задать:

```text
FRONT_END_DOMAIN=panel.pulsar-cloud.space
SUB_PUBLIC_DOMAIN=sub.pulsar-cloud.space
API_INSTANCES=1
```

На 2 vCPU и 4 GB RAM не увеличивать `API_INSTANCES`. Remnawave PostgreSQL и
Redis допустимы только внутри его compose/network. Remnawave Node на этот VPS
не устанавливать.

После `docker compose pull` записать фактические image digests для
воспроизводимости; `latest` без фиксации нежелателен для последующего production.

### 5. Subscription Page

Первый super-admin создан, два отдельных API token выпущены на 365 дней для
Pulsar и Subscription Page. Compose находится в `/opt/remnawave/subscription`,
env имеет mode `0600`. End-to-end проверка через временного пользователя и его
реальный `shortUuid` вернула HTTP 200; временный пользователь удален.

### 6. Caddy и firewall

```bash
install -m 0644 ops/Caddyfile /etc/caddy/Caddyfile
caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl enable --now caddy
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Перед `ufw enable` обязательно подтвердить рабочую SSH-сессию. Docker published
ports должны оставаться привязанными к `127.0.0.1`; это также снижает риск обхода
UFW через Docker chains.

## Приемочные проверки

```bash
systemctl --failed
systemctl status pulsar-web pulsar-worker caddy --no-pager
journalctl -u pulsar-web -u pulsar-worker -u caddy -n 200 --no-pager
docker compose -f /opt/remnawave/docker-compose.yml ps
ss -lntup
curl -fsS http://127.0.0.1:3100/ -o /dev/null
curl -fsS http://127.0.0.1:3000/ -o /dev/null
curl -fsS http://127.0.0.1:3010/ -o /dev/null
curl -fsSI https://app.pulsar-cloud.space/
curl -fsSI https://panel.pulsar-cloud.space/
curl -fsSI https://sub.pulsar-cloud.space/
```

Ожидаемые специальные проверки:

- apex и `www` возвращают redirect на `https://app.pulsar-cloud.space` с
  сохранением URI;
- `GET /api/payments/webhook/platega` может вернуть 405, но production POST
  тестировать нельзя до реализации Platega adapter;
- `/api/telegram/webhook` будет 404 до появления route handler;
- loopback порты 3000/3010/3100 не доступны извне;
- `pulsar.db`, `-wal` и `-shm` находятся на локальном NVMe в
  `/var/lib/pulsar` и используются ровно одним web и одним worker process.

Проверка backup/restore:

```bash
systemctl start pulsar-backup.service
journalctl -u pulsar-backup.service --no-pager
ls -lah /var/backups/pulsar
gzip -t /var/backups/pulsar/pulsar-*.db.gz
sha256sum -c /var/backups/pulsar/pulsar-*.db.gz.sha256
```

Восстановление следует тестировать в отдельный временный файл/каталог, не поверх
рабочей базы при запущенных службах.

## Ресурсная модель 4 GB RAM

- web ограничен systemd до 900 MB;
- worker ограничен до 512 MB;
- Remnawave API оставить в одном instance;
- subscription page ограничена compose до 384 MB;
- рекомендуется 2 GB swap как аварийный запас, не как рабочая память;
- production build выполнять до запуска Remnawave либо при контролируемой
  остановке его контейнеров, если возникает memory pressure;
- включить наблюдение за `MemAvailable`, swap, OOM events, SQLite WAL size,
  backup duration и Docker container restarts.

Если после запуска Remnawave устойчиво остается менее 500–700 MB
`MemAvailable` или начинается активный swap, Panel следует вынести на отдельный
VPS, а не увеличивать число процессов на этом сервере.

## Источники по Remnawave

- [Официальная установка Remnawave Panel](https://docs.rw/install/remnawave-panel/)
- [Официальная bundled Subscription Page](https://docs.rw/install/subscription-page/bundled/)
- [Официальные environment variables](https://docs.rw/install/environment-variables/)
- [Официальная настройка Caddy](https://docs.rw/install/reverse-proxies/caddy/)

## Заключение

Dev/test стенд развернут и проходит инфраструктурную приемку. Называть его
полнофункциональным production нельзя: безопасная email-доставка, Telegram,
Platega и реальный Remnawave provisioning внутри Pulsar требуют доработки кода.
Публичный dev OTP выключен. Следующие действия владельца: исправить DNS `www`,
ротировать ранее раскрытые Telegram/Resend credentials и предоставить off-site
backup target. После реализации интеграционных adapters нужно повторить webhook,
auth и provisioning acceptance без изменения текущей топологии VPS.

## Дополнение: Remnawave VPN policy и подготовка Node

11 июля 2026 года в Panel дополнительно созданы профиль
`PULSAR_VLESS_REALITY`, inbound `VLESS_TCP_REALITY`, squads
`PULSAR_STANDARD`/`PULSAR_LTE` и XRAY_JSON template `PULSAR_XRAY`. Глобально
включен HWID device limit; fallback равен одному устройству. Для истекшей,
отключенной или ограниченной подписки настроены русские remarks со ссылкой на
`https://app.pulsar-cloud.space`.

Полные UUID, tariff mapping, правила безлимитного трафика/`NO_RESET`, алгоритм
продления существующего Remnawave user и приемочный сценарий находятся в
[`remnawave-dev-test-policy-2026-07-11.md`](./remnawave-dev-test-policy-2026-07-11.md).

Реальный Node и Host не создавались: по архитектуре они должны находиться на
отдельном VPN VPS, адрес и SSH-доступ к которому пока не предоставлены. Поэтому
fingerprint `edge` зафиксирован как обязательная Host-настройка, но проверить
REALITY handshake до появления VPN VPS невозможно. Сайт по-прежнему использует
`MockRemnawaveClient`, поэтому список/удаление HWID и renewal через личный кабинет
остаются блокерами уровня приложения, а не Panel.

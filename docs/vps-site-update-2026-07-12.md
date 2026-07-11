# Обновление Pulsar 2.0 на dev/test VPS

Дата: 2026-07-12 (Asia/Yekaterinburg).

## Результат

Сайт обновлен с commit `16658c7d1f0481fa78306bf0664798a21e11e989` до
`07daf4770944e646b44842fcb8663d3a20b9e6eb` из `origin/main`.

Перед переключением были успешно выполнены:

- `npm ci --include=dev`;
- TypeScript typecheck;
- полный набор Node tests;
- `next build` для Next.js 16.2.6;
- SQLite backup и `PRAGMA integrity_check`;
- `prisma migrate deploy` — три migration найдены, pending migration нет;
- локальный и публичный HTTP health-check.

Текущая release:

```text
/opt/pulsar/releases/07daf4770944e646b44842fcb8663d3a20b9e6eb
```

`/opt/pulsar/current` теперь является атомарно переключаемым symlink. Предыдущая
версия сохранена в `/opt/pulsar/legacy-20260711T192029Z-16658c7d1f04`, а
pre-deploy SQLite snapshot — в `/var/backups/pulsar/deploy`.

## Одна команда для следующих обновлений

На VPS:

```bash
sudo systemctl start pulsar-update.service
```

С локального компьютера:

```bash
ssh root@31.76.27.41 'systemctl start pulsar-update.service'
```

Команда возвращает ненулевой exit status, если checkout, зависимости, typecheck,
tests, build, migration или health-check завершились ошибкой. При разрыве SSH
systemd продолжает обновление самостоятельно.

Просмотр результата:

```bash
systemctl status pulsar-update.service --no-pager
journalctl -u pulsar-update.service -n 200 --no-pager
cat /opt/pulsar/DEPLOYED
```

## Как работает updater

Скрипт `/usr/local/sbin/pulsar-update`:

1. блокирует параллельный deploy через `flock`;
2. получает точный SHA `origin/main`;
3. создает immutable release-каталог;
4. ставит зависимости и выполняет typecheck/tests/build до остановки сайта;
5. запускает штатный backup и отдельный rollback snapshot SQLite;
6. останавливает worker/web, применяет Prisma migrations;
7. атомарно переключает `/opt/pulsar/current`;
8. запускает сервисы и ожидает HTTP 200;
9. при ошибке возвращает предыдущий symlink и SQLite snapshot;
10. хранит три последние release и удаляет deploy snapshots старше 14 дней.

Повторный запуск на том же commit проверен: updater сообщает, что версия уже
актуальна, проверяет сервисы/HTTP и ничего не переустанавливает.

## Новые env-параметры

Без раскрытия значений добавлены и загружены:

- `JOB_PAYLOAD_SECRET`;
- `TELEGRAM_WEBHOOK_SECRET`;
- `SESSION_TTL_DAYS=180`;
- `REMNAWAVE_PROVIDER=HTTP`;
- `PLATEGA_API_URL`;
- `TELEGRAM_BOT_USERNAME`;
- `EMAIL_FROM` и `EMAIL_REPLY_TO`.

Ранее опубликованные Telegram/Resend credentials не использовались. Для
полноценной отправки Telegram и email нужно выпустить новые ключи и добавить их
в `/etc/pulsar/pulsar.env`. Публичный Telegram webhook route уже доступен и без
правильного secret header возвращает HTTP 401.

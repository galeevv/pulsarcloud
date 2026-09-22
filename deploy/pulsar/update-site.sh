#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Pulsar 2.0 — обновление сайта на VPS из GitHub, без даунтайма и без сюрпризов.
#
# Что делает:
#   1. Консистентный бэкап живой БД (sqlite .backup) + pulsar.env.
#   2. Тянет свежий код из GitHub в НОВЫЙ каталог релиза (старый не трогает).
#   3. npm ci (с devDeps — воркер работает через tsx), prisma generate,
#      prisma migrate deploy (применяет миграции к ЖИВОЙ БД), next build.
#   4. Атомарно переключает симлинк current -> новый релиз.
#   5. Перезапускает pulsar-web + pulsar-worker и делает health-check.
#   6. Если health-check упал — АВТОМАТИЧЕСКИ откатывает симлинк на прошлый
#      релиз и перезапускает сервисы. БД остаётся с бэкапом.
#   7. Чистит старые релизы (оставляет последние KEEP_RELEASES).
#
# Запуск (на сервере, под root):
#   bash /opt/pulsar/update-site.sh            # деплой ветки main
#   bash /opt/pulsar/update-site.sh <branch>   # деплой другой ветки/тега
#
# Откат вручную (путь печатается в конце и лежит в бэкапе):
#   ln -sfn <PREV_RELEASE> /opt/pulsar/current
#   systemctl restart pulsar-web pulsar-worker
# ---------------------------------------------------------------------------
set -Eeuo pipefail

### --- конфигурация ------------------------------------------------------ ###
REPO="https://github.com/galeevv/pulsarcloud.git"
REF="${1:-main}"                         # ветка/тег для деплоя (по умолчанию main)
BASE="/opt/pulsar"
RELEASES="$BASE/releases"
CURRENT="$BASE/current"
BACKUPS="$BASE/backups"
ENV_FILE="/etc/pulsar/pulsar.env"
DB_FILE=""
APP_USER="pulsar"
HEALTH_URL="http://127.0.0.1:3000/"
KEEP_RELEASES=5

log()  { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; }
die()  { printf "\n\033[1;31mОШИБКА: %s\033[0m\n" "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "запусти под root (sudo)."
[ -f "$ENV_FILE" ]   || die "нет env-файла $ENV_FILE"
command -v git >/dev/null || die "нет git"
command -v npm >/dev/null || die "нет npm"

# The same updater is used for production and the isolated VPS test mode.
# Read the database path from the protected environment instead of guessing
# it, so a production deploy cannot accidentally back up the test database.
set -a
. "$ENV_FILE"
set +a
case "${DATABASE_URL:-}" in
  file:/*) DB_FILE="${DATABASE_URL#file:}" ;;
  *) die "DATABASE_URL должен быть абсолютным SQLite file:/... URL" ;;
esac

TS="$(date +%Y%m%dT%H%M%SZ)"
REL="$RELEASES/${TS}-$(printf '%s' "$REF" | tr '/' '-')"
PREV="$(readlink -f "$CURRENT" 2>/dev/null || true)"

### --- 1. бэкап --------------------------------------------------------- ###
log "Бэкап БД + env"
BK="$BACKUPS/preupdate-$TS"; mkdir -p "$BK"
if command -v sqlite3 >/dev/null && [ -f "$DB_FILE" ]; then
  sqlite3 "$DB_FILE" ".backup '$BK/$(basename "$DB_FILE")'"
elif [ -f "$DB_FILE" ]; then
  cp -a "$DB_FILE" "$BK/"
fi
cp -a "$ENV_FILE" "$BK/pulsar.env"
printf '%s\n' "$PREV" > "$BK/PREVIOUS_RELEASE.txt"
echo "бэкап -> $BK"

### --- 2. исходники ----------------------------------------------------- ###
log "Клонирую $REF из GitHub"
git clone --branch "$REF" --depth 1 "$REPO" "$REL" || die "git clone не удался"
SHA="$(git -c safe.directory='*' -C "$REL" rev-parse --short HEAD)"
log "Разворачиваю $REF @ $SHA (текущий: $([ -n "$PREV" ] && basename "$PREV" || echo '—'))"

### --- 3. сборка -------------------------------------------------------- ###
# DATABASE_URL и прочие production-параметры уже загружены из pulsar.env.
cd "$REL"
log "npm ci (+devDeps: tsx нужен воркеру)"
npm ci --include=dev --no-audit --no-fund
log "prisma generate"
npm run db:generate
log "next build + упаковка standalone"
npm run build

### --- 4. права --------------------------------------------------------- ###
log "chown -> $APP_USER"
chown -R "$APP_USER:$APP_USER" "$REL"

### --- 5. миграция БД (короткая остановка — снять блокировку SQLite) ----- ###
# SQLite нельзя мигрировать, пока живой app держит запись. Сборка уже готова,
# поэтому останавливаем сервисы лишь на время миграции (секунды), не на сборку.
log "Останавливаю сервисы для миграции БД (короткий даунтайм)"
systemctl stop pulsar-worker pulsar-web
sleep 2
log "prisma migrate deploy (ЖИВАЯ БД, бэкап уже сделан)"
if ! npm run db:deploy; then
  log "МИГРАЦИЯ УПАЛА — возвращаю прошлый релиз"
  systemctl start pulsar-web pulsar-worker
  die "миграция не удалась; сервисы подняты на $([ -n "$PREV" ] && basename "$PREV" || echo current). Бэкап БД: $BK"
fi

### --- 6. переключение симлинка + старт + health-check ------------------- ###
log "Переключаю current -> $(basename "$REL")"
ln -sfn "$REL" "$CURRENT.tmp"
mv -T "$CURRENT.tmp" "$CURRENT"
log "Старт сервисов на новом релизе"
systemctl start pulsar-web pulsar-worker

log "Health-check $HEALTH_URL"
ok=0; code=000
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL" || true)"
  case "$code" in 200|301|302|307|308) ok=1; break;; esac
  sleep 2
done

if [ "$ok" != 1 ]; then
  log "HEALTH-CHECK УПАЛ (код=$code) — ОТКАТ"
  if [ -n "$PREV" ]; then
    ln -sfn "$PREV" "$CURRENT.tmp"; mv -T "$CURRENT.tmp" "$CURRENT"
    systemctl restart pulsar-web pulsar-worker
    die "откатился на $(basename "$PREV"). Бэкап БД: $BK"
  fi
  die "новый релиз не отвечает, прошлого релиза нет. Бэкап БД: $BK"
fi
log "OK — $SHA живой и отвечает ($code)"

### --- 7. чистка старых релизов ----------------------------------------- ###
log "Чистка старых релизов (оставляю $KEEP_RELEASES)"
CUR_REAL="$(readlink -f "$CURRENT")"
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | while read -r d; do
  [ "$(readlink -f "$d")" = "$CUR_REAL" ] && continue
  rm -rf "$d"
done

cat <<EOF

────────────────────────────────────────────────────────────────────────
ГОТОВО. Задеплоен $REF @ $SHA
Бэкап БД:      $BK/$(basename "$DB_FILE")
Прошлый релиз: ${PREV:-—}

Откат при необходимости:
  ln -sfn "${PREV:-<PREV>}" $CURRENT && systemctl restart pulsar-web pulsar-worker
────────────────────────────────────────────────────────────────────────
EOF

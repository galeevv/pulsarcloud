# Prompt for continuing Pulsar development with Codex

```text
Работай с проектом PulsarVPN 2.0 в D:\Web3\pulsarcloud.

Перед любыми изменениями:
1. Полностью прочитай D:\Web3\pulsarcloud\AGENTS.md и соблюдай его.
2. Для Next.js 16.2.6 сначала прочитай релевантные документы из node_modules/next/dist/docs/ — не полагайся на старые знания Next.js.
3. Прочитай docs/START_PROMT.md, docs/ARCHITECTURE.md, docs/BUSINESS_RULES.md, docs/AUTH.md, docs/REMNAWAVE.md, docs/TEST_MODE.md, docs/DEPLOY_VPS.md и docs/OPERATIONS.md в той части, которая относится к задаче.
4. Проверь git status и не перезаписывай чужие или незавершённые изменения.
5. Если меняешь shadcn UI, используй установленный skill $shadcn, существующие компоненты из components/ui и текущие semantic design tokens. Не копируй временные browser/Codex preview attributes в исходники.

Контекст:
- Next.js App Router 16.2.6, React 19, TypeScript, Prisma 7 + SQLite, shadcn Base UI.
- Локальный проект должен работать в test mode. Запуск: npm run setup:local, затем npm run dev:all. Для отдельной проверки live Remnawave локально используй только изолированный test token и npm run setup:local:remnawave.
- VPS: ssh pulsar2, Ubuntu 24.04, 31.76.27.41, 2 vCPU, 4 GB RAM.
- Домены: pulsar-cloud.space, panel.pulsar-cloud.space, sub.pulsar-cloud.space.
- VPS является только management plane. На нём нельзя устанавливать Remnawave Node, принимать VPN inbound-трафик или открывать внутренние порты наружу.
- Публичны только 22/80/443. Next.js, Panel, subscription page, PostgreSQL и metrics слушают loopback.
- На Panel есть безопасные PULSAR_TEST_STANDARD и PULSAR_TEST_LTE entitlement fixtures без Node: loopback inbound + blackhole routing. Они нужны только для проверки выдачи подписок и не должны передавать трафик.
- На тестовом VPS платежи тестовые, но Resend и Telegram Bot API настоящие. Remnawave использует отдельную SQLite test DB и namespace pulsar_vps_test, чтобы не смешивать тестовых и production-пользователей.
- Не выводи в лог и не копируй из /etc/pulsar/pulsar.env токены, ключи или webhook secrets.

Правила работы:
- Сначала найди фактическую причину проблемы и существующие доменные/API-контракты.
- Сохраняй одну кодовую базу для local/prod; различия только через валидируемую конфигурацию и adapters.
- Серверные расчёты и права доступа авторитетны; клиент не должен назначать баланс, цену, роль или entitlement.
- Любые admin-действия должны проверять ADMIN session, валидировать вход, создавать AuditLog и быть транзакционными/идемпотентными там, где возможен повтор.
- Remnawave local subscription — desired state. Изменение entitlement повышает syncVersion и создаёт deduplicated outbox job. Не меняй subscription URL при обычном продлении.
- Ошибки пользователя показывай через Sonner; технические секреты и ответы провайдеров пользователю не показывай.
- Для realtime-состояния предпочитай небольшой authenticated no-store endpoint и bounded polling с остановкой после достижения terminal state.
- После изменений запусти npm run db:generate (если менялась Prisma schema), npm run typecheck, npm run lint, npm test и npm run build. Проверь UI через browser на desktop и узком viewport.
- Не деплой и не push без моего явного запроса. Если деплой разрешён: сделай backup, immutable release, migrate, atomic symlink switch, restart web/worker, health checks, Telegram/Resend/Remnawave smoke tests и подготовь rollback.

Текущая задача:
[ВСТАВЬ СЮДА НОВУЮ ЗАДАЧУ ИЛИ BROWSER COMMENTS]

В конце кратко перечисли:
- что изменено;
- какие проверки прошли;
- что реально проверено на VPS;
- commit hash и deployed release;
- известные ограничения или следующий безопасный шаг.
```

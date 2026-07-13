Ты работаешь внутри существующего репозитория **Pulsar 2.0**. Frontend пользовательской части уже в основном готов. Не ограничивайся анализом, рекомендациями или созданием плана: **полностью реализуй backend, базу данных, бизнес-логику, минимальную админ-панель, Telegram-интеграцию, test mode, тесты, документацию и файлы для production-деплоя**.

Проект находится на этапе разработки. Разрешено рефакторить и изменять любые части проекта, включая текущую Prisma-схему, Server Actions, route handlers и frontend-интеграцию, если это необходимо для надежной архитектуры. Сохрани существующий UX и визуальный стиль пользовательских страниц.

Не жди дополнительных подтверждений. Если каких-либо решений не хватает, принимай наиболее безопасное и практичное решение, документируй его и продолжай реализацию. Не оставляй фиктивные реализации, кроме явно изолированных адаптеров test mode и внешних интеграций, для которых объективно отсутствуют credentials или API-контракт.

# 1. Основная цель

Построй production-ready управляющую панель коммерческого VPN-сервиса Pulsar 2.0 со следующими возможностями:

* passwordless авторизация и регистрация через email;
* авторизация и регистрация через Telegram;
* привязка email и Telegram к одному основному аккаунту;
* пользовательские сессии;
* подписки VPN;
* платежи и подтверждение платежей;
* provisioning и синхронизация с Remnawave;
* реферальная система;
* внутренний кошелек и заявки на вывод;
* чат поддержки;
* минимальная `/admin`;
* Telegram-бот для входа, уведомлений и новостей;
* надежная SQLite-база;
* durable background jobs;
* полноценный отключаемый test mode;
* автоматические тесты;
* документация;
* инструкция и конфигурация для деплоя на VPS.

# 2. Исходные условия

## Локальная разработка

Разработка выполняется локально на Windows 11.

Подготовь команды и скрипты, совместимые с PowerShell. Определи используемый пакетный менеджер по lock-файлу проекта и не смешивай npm, pnpm, yarn или bun.

## Production VPS

* ОС: Ubuntu 24.04
* IPv4: `31.76.27.41`
* CPU: 2 vCPU AMD Ryzen 9 5950X
* RAM: 4 GB DDR4
* Storage: 120 GB NVMe SSD
* Network: до 1 Gbit/s

На VPS не будет VPN inbound-трафика. VPN-серверы находятся на отдельных нодах. Эта VPS выполняет только роли:

* web-приложение;
* auth;
* backend/API;
* webhooks;
* SQLite;
* worker;
* управляющая Remnawave Panel;
* публичные subscription links Remnawave.

Учитывай, что Next.js, worker и Remnawave конкурируют за 4 GB RAM, CPU и диск. Не добавляй тяжелую инфраструктуру без необходимости.

## Домены

Все домены направлены на `31.76.27.41`:

* `pulsar-cloud.space` — Next.js, auth, API и webhooks;
* `panel.pulsar-cloud.space` — Remnawave Panel;
* `sub.pulsar-cloud.space` — публичные subscription links Remnawave.

Основной URL:

```text
https://pulsar-cloud.space
```

# 3. Сначала проведи аудит репозитория

Перед изменениями:

1. Изучи текущую структуру проекта.
2. Найди:

   * `schema.prisma`;
   * текущие migrations;
   * auth actions;
   * session helpers;
   * payment service;
   * provisioning service;
   * referral и wallet logic;
   * Telegram-заглушки;
   * frontend-контракты страниц;
   * существующие test tools;
   * текущие env variables.
3. Определи версии Next.js, React, Prisma, Node и используемые библиотеки.
4. Используй существующий стек, если он адекватен.
5. Удали или замени устаревшие mock/stub реализации, кроме централизованного test mode.
6. Не дублируй одну бизнес-логику между web, admin, webhook и Telegram.

После аудита сразу переходи к реализации.

# 4. Архитектура

Реализуй **модульный монолит**.

Рекомендуемое разделение:

```text
src/server/
  domain/
    auth/
    users/
    billing/
    subscriptions/
    provisioning/
    referrals/
    wallet/
    support/
    telegram/
    admin/

  application/
    use-cases/
    policies/
    errors/
    dto/

  infrastructure/
    db/
    email/
    payments/
    remnawave/
    telegram/
    security/
    logging/

  jobs/
    handlers/
    worker.ts

  transport/
    web/
    webhooks/
    telegram/
```

Не обязательно механически соблюдать этот путь, если текущая архитектура проекта использует другое разумное расположение. Но границы ответственности должны быть четкими.

Обязательные правила:

* React-компоненты не содержат бизнес-логику.
* Server Actions и route handlers только валидируют transport input, вызывают use case и преобразуют результат для UI.
* Telegram handlers используют те же use cases, что и сайт.
* Admin actions используют те же use cases, но с отдельной авторизацией и audit.
* Внешние вызовы Resend, Telegram, платежного провайдера и Remnawave идут через интерфейсы-адаптеры.
* Все критические операции должны быть идемпотентными.
* Сетевые вызовы нельзя выполнять внутри длинных транзакций SQLite.
* Для внешних операций используй transactional outbox и отдельный worker.

# 5. Конфигурация

Создай централизованный typed config с валидацией env при старте приложения.

Добавь актуальный `.env.example`, не содержащий реальных secrets.

Минимальные группы переменных:

```text
APP_ENV
APP_URL
DATABASE_URL

SESSION_SECRET
AUTH_PEPPER

RESEND_API_KEY
RESEND_FROM_EMAIL

TELEGRAM_BOT_TOKEN
TELEGRAM_BOT_USERNAME
TELEGRAM_WEBHOOK_SECRET

ADMIN_EMAIL
ADMIN_TELEGRAM_ID
ADMIN_TELEGRAM_USERNAME

PAYMENT_PROVIDER
PAYMENT_WEBHOOK_SECRET
PAYMENT_PROVIDER_*

REMNAWAVE_BASE_URL
REMNAWAVE_API_TOKEN

PULSAR_TEST_MODE
PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION
```

Значения администратора:

```text
ADMIN_EMAIL=emil444158@gmail.com
ADMIN_TELEGRAM_ID=885112484
ADMIN_TELEGRAM_USERNAME=galeev66
```

`ADMIN_TELEGRAM_USERNAME` является только отображаемой информацией. Для авторизации доверяй исключительно Telegram ID и проверенному Telegram update/login payload.

# 6. База данных

Используй Prisma и SQLite, если они уже применяются проектом.

Создай чистую, согласованную Prisma-схему и migrations.

Проект пока находится в разработке, поэтому локальную dev-базу можно пересоздать. Однако подготовь нормальную последовательность migrations для будущего production-деплоя.

## 6.1 Денежные значения

Внутри backend и базы храни деньги в минимальных единицах валюты:

```text
7500 = 75,00 ₽
15000 = 150,00 ₽
```

Используй поля с суффиксом `Minor`, например:

* `amountMinor`;
* `availableMinor`;
* `reservedMinor`;
* `rewardMinor`.

В UI продолжай показывать рубли.

Не используй float или decimal с плавающей точкой для денег.

## 6.2 Основные модели

Реализуй или приведи к следующей семантике модели.

### User

```text
User
- id
- role: USER | ADMIN
- status: ACTIVE | BLOCKED | DELETED
- createdAt
- updatedAt
- lastLoginAt
```

Email и Telegram не должны быть основными полями идентификации пользователя. Source of truth — `AuthIdentity`.

При необходимости можно оставить денормализованные display-поля для frontend, но они не должны нарушать уникальность или заменять `AuthIdentity`.

### AuthIdentity

```text
AuthIdentity
- id
- userId
- provider: EMAIL | TELEGRAM
- providerSubject
- emailNormalized nullable
- telegramId nullable
- telegramUsername nullable
- verifiedAt
- createdAt
- updatedAt
```

Ограничения:

* уникальность `(provider, providerSubject)`;
* один email не может принадлежать двум пользователям;
* один Telegram ID не может принадлежать двум пользователям;
* первоначально у одного User максимум одна EMAIL identity и одна TELEGRAM identity;
* email хранить в normalized lowercase виде;
* Telegram ID хранить как строку или BigInt-safe значение, не как 32-bit integer.

### LoginChallenge

```text
LoginChallenge
- id
- channel: EMAIL | TELEGRAM
- purpose:
  USER_LOGIN
  LINK_EMAIL
  LINK_TELEGRAM
  ADMIN_LOGIN
- status:
  PENDING
  COMPLETED
  EXPIRED
  LOCKED
  CANCELED
- emailNormalized nullable
- telegramId nullable
- requestedByUserId nullable
- otpHash nullable
- magicLinkTokenHash nullable
- telegramStartTokenHash nullable
- completionTokenHash nullable
- inviteCodeSnapshot nullable
- attempts
- maxAttempts
- expiresAt
- consumedAt nullable
- requestedIpHash nullable
- userAgentHash nullable
- createdAt
```

Challenge должен быть одноразовым.

### Session

```text
Session
- id
- userId
- kind: USER | ADMIN
- tokenHash unique
- createdAt
- lastSeenAt
- idleExpiresAt
- absoluteExpiresAt
- revokedAt nullable
- userAgentHash nullable
- ipPrefixHash nullable
```

Храни в cookie только случайный raw token. В базе — только hash.

Для пользовательской и административной сессии используй отдельные cookie names.

### PricingSettings

Singleton или versioned settings:

```text
PricingSettings
- id
- key unique
- baseMonthlyPriceMinor
- extraDeviceMonthlyPriceMinor
- lteMonthlyPriceMinor
- durationDiscountsJson
- minDeviceLimit
- maxDeviceLimit
- referralRewardMinor
- referralTrialDays
- minimalPayoutMinor
- version
- updatedAt
```

Значения:

* referral reward: 75 ₽;
* referral trial: 3 дня;
* minimal payout: используй текущее значение проекта, а если оно отсутствует — 150 ₽;
* durations: 1, 3, 6 и 12 месяцев;
* device limits: используй текущий диапазон frontend, ожидаемо 1–5.

Не придумывай production-цены подписки, если они уже есть в проекте. Сохрани существующие значения. Если цены отсутствуют, сделай их обязательной настройкой через seed/env/admin и явно опиши это в документации.

### Payment

```text
Payment
- id
- userId
- provider
- externalPaymentId unique nullable
- idempotencyKey unique
- status:
  CREATED
  PENDING
  CONFIRMED
  FAILED
  CANCELED
  EXPIRED
  REFUNDED
  PARTIALLY_REFUNDED
- amountMinor
- currency
- durationDays
- deviceLimit
- lteEnabled
- basePriceMinor
- extraDevicesPriceMinor
- ltePriceMinor
- discountMinor
- priceSnapshotJson
- pricingVersion
- checkoutUrl nullable
- providerCreatedAt nullable
- confirmedAt nullable
- refundedAt nullable
- expiresAt nullable
- isTest
- createdAt
- updatedAt
```

Каждый Payment должен хранить полный снимок цены и параметров заказа. После создания Payment изменение `PricingSettings` не должно менять существующий платеж.

### PaymentWebhookLog

```text
PaymentWebhookLog
- id
- provider
- eventId
- eventType
- externalPaymentId nullable
- signatureValid
- payloadJson
- receivedAt
- processedAt nullable
- processingError nullable
```

Уникальность `(provider, eventId)`.

### Subscription

У пользователя должна быть одна каноническая текущая подписка:

```text
Subscription
- id
- userId unique
- status:
  TRIAL
  ACTIVE
  CANCELED
  SUSPENDED
- startedAt
- expiresAt
- deviceLimit
- lteEnabled
- subscriptionUrl nullable
- remnawaveUserId nullable
- syncStatus:
  NOT_REQUIRED
  PENDING
  SYNCED
  FAILED
- syncVersion
- lastSyncedAt nullable
- lastUserFriendlyError nullable
- lastTechnicalError nullable
- createdAt
- updatedAt
```

Отсутствие строки означает, что подписки никогда не было.

`EXPIRED` вычисляй как effective UI status, если `expiresAt <= now`. Не удаляй истекшую Subscription и не превращай ее в empty state.

### SubscriptionEvent

Immutable history:

```text
SubscriptionEvent
- id
- subscriptionId
- type
- paymentId nullable
- actorUserId nullable
- previousStateJson nullable
- newStateJson nullable
- idempotencyKey unique
- createdAt
```

### TrialGrant

```text
TrialGrant
- id
- userId unique
- reason: REFERRAL
- referralInviteId unique nullable
- days
- grantedAt
```

### ReferralProfile

```text
ReferralProfile
- id
- userId unique
- inviteCode unique
- isEnabled
- enabledAt nullable
- createdAt
```

Создавай профиль при создании пользователя. Разрешай использовать ссылку после выполнения продуктового условия: первая подтвержденная платная подписка владельца профиля.

### ReferralInvite

```text
ReferralInvite
- id
- inviterUserId
- invitedUserId unique
- inviteCodeSnapshot
- status:
  REGISTERED
  TRIAL_GRANTED
  PAID
  REWARD_REVERSED
- firstConfirmedPaymentId unique nullable
- createdAt
- convertedAt nullable
```

### ReferralReward

```text
ReferralReward
- id
- inviteId unique
- inviterUserId
- invitedUserId
- paymentId unique
- amountMinor
- status:
  AVAILABLE
  RESERVED
  PAID_OUT
  REVERSED
  MANUAL_REVIEW
- createdAt
- reversedAt nullable
```

### WalletAccount

```text
WalletAccount
- id
- userId unique
- availableMinor
- reservedMinor
- version
- updatedAt
```

### WalletLedgerEntry

Immutable ledger:

```text
WalletLedgerEntry
- id
- userId
- type:
  REFERRAL_REWARD
  REFERRAL_REWARD_REVERSAL
  PAYOUT_RESERVE
  PAYOUT_RELEASE
  PAYOUT_PAID
  ADMIN_ADJUSTMENT
- deltaAvailableMinor
- deltaReservedMinor
- referenceType
- referenceId
- idempotencyKey unique
- description nullable
- createdAt
```

Проводки:

```text
Referral reward:
available +7500
reserved 0

Create payout:
available -amount
reserved +amount

Reject payout:
available +amount
reserved -amount

Mark payout paid:
available 0
reserved -amount
```

Не списывай сумму повторно при `PAID`, если она уже зарезервирована.

Не смешивай внешний платеж за подписку с внутренним referral wallet, пока оплата подписки с внутреннего баланса не является отдельной продуктовой функцией.

### PayoutRequest

```text
PayoutRequest
- id
- userId
- amountMinor
- payoutDetailsEncrypted
- payoutDetailsMasked
- status:
  PENDING
  APPROVED
  PAID
  REJECTED
  CANCELED
- reviewedByAdminId nullable
- reviewedAt nullable
- rejectionReason nullable
- createdAt
- updatedAt
```

Чувствительные реквизиты не логировать. Хранить безопасно и показывать в админке только в необходимом объеме.

### SupportConversation

```text
SupportConversation
- id
- userId unique
- status: OPEN | CLOSED
- lastMessageAt
- createdAt
- updatedAt
```

### SupportMessage

```text
SupportMessage
- id
- conversationId
- authorRole: USER | ADMIN | SYSTEM
- senderUserId nullable
- source: WEB | ADMIN | SYSTEM
- body
- createdAt
```

Telegram-бот не обязан быть полноценным support-клиентом.

### TelegramProfile

```text
TelegramProfile
- id
- userId unique
- telegramId unique
- chatId nullable
- username nullable
- firstName nullable
- lastName nullable
- canReceiveMessages
- transactionalNotificationsEnabled
- newsNotificationsEnabled
- botStartedAt nullable
- botBlockedAt nullable
- updatedAt
```

### TelegramUpdateLog

```text
TelegramUpdateLog
- id
- updateId unique
- updateType
- payloadJson
- receivedAt
- processedAt nullable
- processingError nullable
```

### TelegramBroadcast

Для новостей:

```text
TelegramBroadcast
- id
- createdByAdminId
- title
- body
- status: DRAFT | QUEUED | SENDING | COMPLETED | CANCELED
- target: NEWS_OPTED_IN | ALL_REACHABLE
- queuedAt nullable
- completedAt nullable
- createdAt
```

### TelegramBroadcastDelivery

```text
TelegramBroadcastDelivery
- id
- broadcastId
- userId
- status: PENDING | SENT | FAILED | SKIPPED
- telegramMessageId nullable
- error nullable
- sentAt nullable
```

Уникальность `(broadcastId, userId)`.

### OutboxJob

```text
OutboxJob
- id
- type
- aggregateType
- aggregateId
- payloadJson
- dedupeKey unique
- status:
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  DEAD
- attempts
- maxAttempts
- runAfter
- lockedAt nullable
- lockedBy nullable
- lastError nullable
- createdAt
- completedAt nullable
```

### AuditLog

```text
AuditLog
- id
- actorType: USER | ADMIN | SYSTEM
- actorId nullable
- action
- entityType
- entityId nullable
- metadataJson nullable
- correlationId
- createdAt
```

### IntegrationLog

```text
IntegrationLog
- id
- integration
- operation
- entityType nullable
- entityId nullable
- success
- attempt
- requestSummary nullable
- responseSummary nullable
- technicalError nullable
- correlationId
- createdAt
```

Не сохраняй secrets, полные токены, OTP, session tokens или чувствительные платежные данные в логах.

# 7. SQLite production requirements

SQLite должна находиться только на локальном NVMe VPS, не на network filesystem.

Настрой:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA wal_autocheckpoint = 1000;
```

Убедись, что pragmas применяются к каждому runtime process или соединению, где это необходимо.

Добавь:

* короткие транзакции;
* retries с bounded exponential backoff для `SQLITE_BUSY`;
* worker concurrency = 1;
* индексы для всех частых запросов;
* уникальные ограничения для идемпотентности;
* отсутствие сетевых вызовов внутри DB-транзакций;
* health check базы;
* backup и restore scripts;
* проверку реальной SQLite runtime version, используемой Node/Prisma;
* документацию по WAL checkpoint;
* backup перед production migration.

Не копируй открытый `.db` как единственный способ backup. Используй безопасный snapshot, SQLite backup API или `VACUUM INTO`.

# 8. Auth и регистрация через email

## Login/register

Flow:

1. Пользователь вводит email.
2. Backend нормализует и валидирует email.
3. Создается `LoginChallenge` с purpose `USER_LOGIN`.
4. Генерируется шестизначный OTP.
5. OTP отправляется через Resend.
6. Пользователь вводит код.
7. Если EMAIL identity существует — авторизовать ее User.
8. Если EMAIL identity отсутствует — создать User, WalletAccount, ReferralProfile и EMAIL identity.
9. Создать пользовательскую Session.
10. Завершить challenge.
11. Применить referral invite, если он был сохранен в challenge.
12. Перенаправить на `/home`.

Требования:

* TTL OTP: 5 минут;
* максимум 5 попыток;
* resend cooldown: 60 секунд;
* challenge одноразовый;
* повторная проверка использованного challenge не создает новую session;
* email normalization;
* rate limits по email и IP;
* никаких raw provider errors в UI.

Не храни OTP обычным SHA-256. Используй HMAC:

```text
HMAC-SHA256(AUTH_PEPPER, challengeId + ":" + otp)
```

Magic link, если он остается в продукте, также должен быть одноразовым, с коротким TTL и hash токена в базе.

# 9. Привязка email

Flow:

1. Пользователь должен иметь действующую USER session.
2. Вводит email.
3. Создается challenge с purpose `LINK_EMAIL` и `requestedByUserId`.
4. Через Resend отправляется OTP.
5. После подтверждения:

   * если email свободен — привязать к текущему User;
   * если email уже привязан к текущему User — вернуть idempotent success;
   * если email принадлежит другому User — отклонить;
   * автоматическое объединение аккаунтов запрещено.

Все race conditions должны закрываться уникальными DB constraints и корректной обработкой конфликтов.

# 10. Telegram auth и привязка

Telegram-бот не должен дублировать весь личный кабинет. Его задачи:

* вход и регистрация;
* привязка Telegram;
* уведомления;
* получение новостей;
* ссылка на личный кабинет;
* базовые команды `/start`, `/account`, `/notifications`, `/help`.

## Login/register через Telegram-бота

Основной рекомендуемый flow:

1. Сайт создает `LoginChallenge` с purpose `USER_LOGIN`.
2. Генерирует длинный криптографически случайный opaque start token.
3. В базе сохраняется только hash.
4. Сайт открывает:

```text
https://t.me/<bot_username>?start=<opaque_token>
```

5. Пользователь нажимает Start.
6. Telegram webhook получает update.
7. Проверяется `X-Telegram-Bot-Api-Secret-Token`.
8. По start token находится challenge.
9. Telegram ID берется только из проверенного update.
10. Если TELEGRAM identity существует — используется ее User.
11. Если identity отсутствует — создается новый User, WalletAccount, ReferralProfile и TELEGRAM identity.
12. Challenge завершается.
13. Создается одноразовый completion token.
14. Бот отправляет пользователю кнопку «Вернуться в Pulsar».
15. Переход по completion URL создает USER session cookie и редиректит на `/home`.
16. Completion token одноразовый и короткоживущий.

Также допускается официальный Telegram Login Widget или Mini App login, если текущий frontend уже его использует. В этом случае обязательно реализуй серверную проверку hash/signature по официальному Telegram-алгоритму. Не доверяй данным frontend без проверки.

## Привязка Telegram

1. Пользователь должен быть авторизован.
2. Создается challenge `LINK_TELEGRAM`, привязанный к текущему User.
3. Пользователь переходит в бота.
4. Bot webhook подтверждает Telegram ID.
5. Если Telegram ID свободен — создать identity для текущего User.
6. Если уже принадлежит текущему User — idempotent success.
7. Если принадлежит другому User — отказ.
8. Не объединять аккаунты автоматически.

## Telegram webhook

Создай route:

```text
POST /api/integrations/telegram/webhook
```

Требования:

* проверка webhook secret header;
* ограничение размера body;
* idempotency по `update_id`;
* запись `TelegramUpdateLog`;
* быстрый ответ `200`;
* тяжелая обработка через OutboxJob;
* отсутствие bot token и других secrets в логах.

## Уведомления

Реализуй отправку Telegram-уведомлений через outbox:

* подписка активирована;
* подписка скоро закончится;
* subscription provisioning завершен;
* ошибка настройки, требующая действий пользователя;
* выплата одобрена;
* выплата выполнена;
* важное системное сообщение;
* новости/рассылки, только при включенной опции.

Добавь настройки:

* transactional notifications;
* news notifications.

Транзакционные критичные сообщения можно отправлять независимо от news opt-in, но пользователь должен иметь возможность полностью остановить сообщения бота через Telegram.

Обрабатывай случаи, когда пользователь заблокировал бота: обновляй `canReceiveMessages` и `botBlockedAt`.

# 11. Admin auth

Создай отдельную страницу:

```text
/admin
```

Неавторизованному администратору показывай auth-интерфейс, визуально согласованный с пользовательским auth.

В системе один администратор:

```text
email: emil444158@gmail.com
Telegram ID: 885112484
Telegram username: galeev66
```

Реализуй bootstrap/seed-команду, которая:

1. Создает одного User с `role=ADMIN`.
2. Привязывает к нему EMAIL identity.
3. Привязывает к нему TELEGRAM identity.
4. Создает WalletAccount и необходимые служебные записи, если они обязательны схемой.
5. Не создает дубли при повторном запуске.
6. Если email или Telegram ID уже принадлежат другому User, останавливается с понятной ошибкой и ничего автоматически не объединяет.

Admin login:

* только через разрешенный email OTP или разрешенный Telegram ID;
* challenge purpose `ADMIN_LOGIN`;
* отдельная ADMIN session;
* отдельная HttpOnly cookie;
* обязательная проверка `role=ADMIN`;
* обычная USER session не дает доступ к `/admin`;
* обычный пользователь не может зарегистрироваться через `/admin`;
* все admin mutations пишутся в `AuditLog`.

# 12. Минимальная `/admin`

Сохрани общий стиль проекта, но не трать время на сложные декоративные интерфейсы.

## Dashboard

Покажи:

* всего пользователей;
* новых пользователей за 24 часа и 7 дней;
* активных и trial подписок;
* истекших подписок;
* подтвержденную выручку за день и месяц;
* pending payments;
* failed provisioning jobs;
* pending payouts;
* открытые support conversations;
* состояние worker/outbox.

## Users

Реализуй:

* список;
* pagination;
* поиск по email, Telegram ID, username и internal ID;
* фильтр по статусу подписки;
* user details.

На странице пользователя покажи:

* identities;
* sessions;
* subscription;
* subscription history;
* payments;
* referral information;
* wallet;
* payouts;
* support conversation;
* Telegram settings;
* audit history.

Минимальные admin actions:

* блокировать/разблокировать пользователя;
* отзывать все его sessions;
* вручную выдать или продлить подписку;
* изменить device limit;
* включить/выключить LTE;
* повторить provisioning;
* регенерировать subscription URL с подтверждением;
* сделать wallet adjustment с обязательным reason;
* открыть support conversation.

Все действия:

* валидируются на backend;
* атомарны;
* идемпотентны, где применимо;
* пишутся в AuditLog;
* не выполняют сетевые вызовы внутри транзакции.

## Payments

Реализуй:

* список и фильтры;
* payment details;
* webhook history;
* price snapshot;
* test-mode confirmation/failure;
* reconciliation action;
* запрет ручного подтверждения реального production payment обычной кнопкой.

## Payouts

Реализуй переходы:

```text
PENDING → APPROVED
PENDING → REJECTED
APPROVED → PAID
APPROVED → REJECTED
```

При reject возвращай reserve на available balance.

При paid уменьши reserved balance, не списывая available повторно.

Все переходы выполняй в транзакции.

## Support

Реализуй:

* список открытых разговоров;
* просмотр thread;
* ответ администратора;
* закрытие и повторное открытие.

## Pricing

Реализуй изменение:

* базовой цены;
* цены дополнительного устройства;
* цены LTE;
* скидок по срокам;
* min/max devices;
* referral reward;
* trial days;
* minimal payout.

Изменение настроек не меняет уже созданные Payment snapshots.

## Telegram broadcasts

Минимальный интерфейс:

* создать draft;
* preview;
* выбрать `NEWS_OPTED_IN` или `ALL_REACHABLE`;
* поставить в очередь;
* видеть статистику sent/failed/skipped;
* отменить еще не начатую рассылку.

Рассылка идет через worker небольшими batches и не блокирует web process.

## Jobs and integrations

Добавь страницу:

* failed/dead OutboxJob;
* last error;
* attempts;
* retry;
* integration logs;
* health Remnawave/Resend/Telegram/payment provider без раскрытия secrets.

# 13. Payment business logic

Создай интерфейс:

```ts
interface PaymentProvider {
  createCheckout(input): Promise<{
    externalPaymentId: string;
    checkoutUrl: string;
    providerCreatedAt?: Date;
  }>;

  verifyWebhook(request): Promise<VerifiedPaymentEvent>;

  getPaymentStatus(externalPaymentId: string): Promise<ProviderPaymentStatus>;
}
```

Используй существующего реального провайдера, если он уже реализован.

Если production-провайдер еще не выбран:

* не придумывай внешнее API;
* реализуй полностью рабочий test provider;
* оставь четкий production adapter contract;
* опиши точку подключения реального провайдера;
* не выдавай test provider за production integration.

## Создание платежа

Backend получает:

* duration;
* deviceLimit;
* lteEnabled.

Backend сам:

1. Загружает PricingSettings.
2. Валидирует параметры.
3. Считает цену.
4. Создает price snapshot.
5. Создает Payment.
6. Вызывает provider вне DB-транзакции.
7. Сохраняет external ID и checkout URL.
8. Возвращает checkout URL.

Client total нельзя считать доверенным входом.

## Webhook confirmation

В короткой транзакции:

1. Записать webhook event с уникальным provider event ID.
2. Если событие уже обработано — вернуть success без повторной бизнес-операции.
3. Найти Payment.
4. Сверить provider, amount, currency и внешний ID.
5. Перевести Payment в `CONFIRMED`, только если переход допустим.
6. Активировать или продлить Subscription.
7. Обработать referral conversion.
8. Включить ReferralProfile оплатившего пользователя.
9. Добавить OutboxJob для provisioning.
10. Добавить AuditLog/IntegrationLog.
11. Commit.

После commit worker синхронизирует Remnawave.

## Продление

Используй фиксированные сроки:

```text
1 месяц = 30 дней
3 месяца = 90 дней
6 месяцев = 180 дней
12 месяцев = 365 дней
```

Храни фактический `durationDays` в Payment snapshot.

Начальная точка продления:

```text
max(now, currentSubscription.expiresAt)
```

Если пользователь находится в referral trial и оплачивает подписку до окончания trial, платный срок добавляется после оставшегося trial.

## Device limit и LTE

Не разрешай бесплатно увеличивать параметры активной подписки.

Для первой production-версии реализуй безопасное правило:

* уменьшение device limit применяется при следующем продлении;
* увеличение device limit требует отдельной доплаты либо выбирается при следующем полном продлении;
* включение LTE требует доплаты либо выбирается при следующем продлении;
* отключение LTE применяется со следующего периода;
* если полноценный prorated upgrade не реализован, UI должен честно блокировать мгновенное платное изменение и предлагать выбрать новые параметры при продлении.

Не создавай скрытую возможность бесплатно получить дорогой тариф.

Admin может изменить параметры вручную с AuditLog.

## Refunds

При refund:

* Payment переходит в соответствующий refund state;
* создается audit event;
* subscription correction не выполняется молча;
* если refund требует уменьшить срок, делай это через отдельную documented policy;
* referral reward по первому платежу должен быть reversed, если он еще доступен;
* если reward уже зарезервирован или выплачен, пометь `MANUAL_REVIEW`, не повреждай ledger.

# 14. Subscription и Remnawave

Создай интерфейс:

```ts
interface ProvisioningProvider {
  upsertSubscriber(input): Promise<{
    remoteUserId: string;
    subscriptionUrl: string;
  }>;

  updateSubscriber(input): Promise<void>;

  regenerateSubscriptionUrl(input): Promise<{
    subscriptionUrl: string;
  }>;

  getSubscriberState(remoteUserId: string): Promise<RemoteSubscriberState>;
}
```

Используй существующую Remnawave-интеграцию, если она есть.

Не выдумывай endpoint names, если API-контракт отсутствует. В таком случае:

* создай адаптер и типы;
* реализуй test adapter;
* оставь один явно обозначенный integration boundary;
* документируй, какие реальные методы Remnawave нужно подключить.

## Desired state model

Subscription хранит желаемые:

* `expiresAt`;
* `deviceLimit`;
* `lteEnabled`.

При каждом изменении:

1. Увеличивается `syncVersion`.
2. Ставится `syncStatus=PENDING`.
3. Создается deduplicated job:

```text
subscription:<subscriptionId>:sync:<syncVersion>
```

Worker:

1. Загружает актуальную Subscription.
2. Проверяет syncVersion.
3. Создает или обновляет пользователя Remnawave.
4. Сохраняет `remnawaveUserId`.
5. Сохраняет `subscriptionUrl`.
6. Ставит `SYNCED`.
7. Пишет IntegrationLog.

При ошибке:

* `syncStatus=FAILED`;
* technical error только в technical log;
* user-friendly message:

```text
Не удалось завершить настройку подписки. Мы повторим попытку автоматически.
```

Добавь retry с exponential backoff и dead-letter state.

Добавь reconciliation job, который периодически ищет:

* активные Subscription с `PENDING`;
* активные Subscription с `FAILED`;
* несоответствия локального и удаленного состояния.

Платеж остается подтвержденным, даже если Remnawave временно недоступен.

# 15. Referral business logic

Условия:

1. При регистрации по действующей referral link друг получает 3 бесплатных дня.
2. Владелец ссылки получает 75 ₽ после первой подтвержденной оплаты друга.

## Capture invite

Referral invite code должен сохраняться в `LoginChallenge`, а не только в browser query.

При завершении регистрации:

* проверить существование enabled ReferralProfile;
* запретить self-referral;
* создать только один ReferralInvite для invited user;
* пользователь не может изменить inviter позже;
* повторный login не создает новый invite.

## Trial

При валидной регистрации по referral:

1. Создать `TrialGrant`, уникальный по user.
2. Создать или обновить Subscription:

   * status `TRIAL`;
   * expiresAt `now + 3 days`;
   * базовый device limit;
   * LTE disabled, если продукт явно не предусматривает другое.
3. Создать SubscriptionEvent.
4. Поставить provisioning job.
5. Обновить ReferralInvite status.

Повторное использование invite не выдает дополнительный trial.

## Reward

При первой подтвержденной оплате invited user:

1. Убедиться, что у него есть ReferralInvite.
2. Убедиться, что reward еще не создавался.
3. Убедиться, что Payment является первой подтвержденной платной покупкой.
4. Создать ReferralReward на 75 ₽.
5. Создать WalletLedgerEntry.
6. Увеличить `WalletAccount.availableMinor`.
7. Обновить ReferralInvite status.
8. Включить ReferralProfile оплатившего пользователя.
9. Выполнить все в одной короткой транзакции.

Гарантируй идемпотентность уникальными ключами.

# 16. Wallet и payouts

## Create payout

Backend:

1. Проверяет USER session.
2. Валидирует amount.
3. Проверяет minimal payout.
4. Проверяет available balance.
5. Нормализует payout details.
6. В транзакции:

   * создает PayoutRequest;
   * уменьшает available;
   * увеличивает reserved;
   * создает ledger entry.
7. Возвращает friendly result.

Защити операцию от двойного нажатия и concurrent requests через idempotency key или одноразовый action token.

## Admin reject

В транзакции:

* status → REJECTED;
* available += amount;
* reserved -= amount;
* ledger `PAYOUT_RELEASE`;
* audit.

## Admin paid

В транзакции:

* status → PAID;
* reserved -= amount;
* ledger `PAYOUT_PAID`;
* audit.

После каждой wallet transaction проверяй invariants:

```text
availableMinor >= 0
reservedMinor >= 0
```

Добавь тест, пересчитывающий WalletAccount по ledger.

# 17. Support

Сохрани один актуальный conversation на пользователя.

Пользователь:

* может отправлять plain text;
* body min 2, max 1000;
* server-side trim и normalization;
* rate limit;
* не видит internal IDs и technical errors.

Администратор:

* видит conversation;
* отвечает;
* закрывает/reopens;
* action audit.

Для обновления пользовательского чата используй простой polling или существующий Next.js refresh/revalidation. Не добавляй тяжелую realtime-инфраструктуру без необходимости.

# 18. Transactional outbox и worker

Создай отдельный worker process.

Примеры job types:

```text
SEND_EMAIL_OTP
SEND_MAGIC_LINK
PROCESS_TELEGRAM_UPDATE
SEND_TELEGRAM_NOTIFICATION
SEND_TELEGRAM_BROADCAST_BATCH
PROVISION_SUBSCRIPTION
RECONCILE_SUBSCRIPTION
RECONCILE_PAYMENT
REGENERATE_SUBSCRIPTION_URL
CLEANUP_AUTH_CHALLENGES
CLEANUP_SESSIONS
CLEANUP_WEBHOOK_LOGS
```

Worker requirements:

* concurrency 1;
* graceful shutdown;
* job lease;
* recovery зависших `PROCESSING` jobs;
* max attempts;
* exponential backoff с jitter;
* dead-letter state;
* structured logs;
* health/heartbeat;
* dedupeKey;
* retry через admin;
* отсутствие tight polling loop;
* низкое потребление памяти.

Критическая бизнес-транзакция должна сохранять доменные изменения и OutboxJob атомарно. Внешний вызов выполняется worker после commit.

# 19. Sessions и security

## Cookies

USER cookie и ADMIN cookie:

* HttpOnly;
* Secure в production;
* SameSite=Lax;
* Path=/;
* разумный Max-Age.

## Session policy

Реализуй:

* idle expiration;
* absolute expiration;
* revoke current session;
* revoke all sessions;
* cleanup expired sessions;
* обновление `lastSeenAt` не чаще одного раза в 10–15 минут.

## Rate limiting

Для одного VPS используй SQLite-backed или memory+SQLite strategy без Redis.

Минимальные лимиты:

Email OTP request:

* 1 запрос в 60 секунд на email;
* 3 запроса за 15 минут на email;
* 10 запросов за час на IP.

OTP verify:

* максимум 5 попыток на challenge;
* после этого `LOCKED`.

Telegram login:

* ограничение стартовых challenge по IP/session;
* одноразовый token;
* TTL около 5 минут.

Support:

* разумный message rate limit.

Admin login:

* более строгий rate limit;
* security audit для failed attempts.

## CSRF и origin

Для mutations:

* используй Server Actions safety текущего Next.js;
* для route handlers проверяй method, content type и Origin/Host, где применимо;
* webhooks защищай provider signature/secret, а не CSRF token.

## Logging

Никогда не логируй:

* OTP;
* session raw token;
* magic link raw token;
* Telegram bot token;
* Resend API key;
* Remnawave token;
* payment secrets;
* полные payout details.

# 20. Test mode

Test mode должен быть полноценным, централизованным и легко отключаемым.

Переменная:

```text
PULSAR_TEST_MODE=true|false
```

Не разбрасывай проверки `if test mode` по всему проекту. Используй dependency injection/configurable adapters:

* `EmailSender`;
* `PaymentProvider`;
* `ProvisioningProvider`;
* `TelegramGateway`;
* `Clock`, где полезно.

## В test mode

Реализуй:

* mock Resend/email sender;
* возможность безопасно увидеть dev OTP;
* mock payment provider;
* fake checkout page;
* confirm/fail/cancel payment;
* повторную отправку webhook для проверки idempotency;
* mock Remnawave provider;
* симуляцию provisioning success/failure;
* симуляцию Telegram auth update;
* seed test users;
* test referral flow;
* test payout flow;
* ускоренное истечение challenge/subscription через test-only actions или injectable clock;
* test banner в UI/admin;
* четкую маркировку test payments и test users.

Создай test-only admin section, доступную только ADMIN:

```text
/admin/test
```

Возможности:

* создать test user;
* получить test OTP;
* создать и подтвердить test payment;
* отправить duplicate webhook;
* включить/выключить ошибку provisioning;
* истечь test subscription;
* симулировать referral registration;
* симулировать first payment;
* создать payout;
* удалить только test data.

## Отключение test mode

При `PULSAR_TEST_MODE=false`:

* test routes недоступны;
* test UI отсутствует;
* dev OTP никогда не попадает в response;
* mock provider нельзя выбрать;
* test admin section возвращает 404;
* test actions не регистрируются или жестко отклоняются.

В production приложение должно отказываться стартовать при `PULSAR_TEST_MODE=true`, если одновременно не указан отдельный аварийный флаг:

```text
PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION=true
```

В документации явно предупреди, что этот флаг опасен.

# 21. Frontend integration

Сохрани существующие пользовательские страницы и подключи их к реальному backend:

* `/`;
* `/auth/verify`;
* `/auth/verify/link`;
* `/home`;
* `/subscription`;
* `/referrals`;
* `/profile`;
* `/support`;
* `/legal`.

Исправь frontend, если текущие компоненты зависят от устаревшей schema.

Правила UI:

* пользователю показываются только friendly errors;
* technical errors сохраняются в логах;
* pending состояния защищают от double submit;
* price preview на frontend является только UX;
* backend всегда пересчитывает цену;
* expired subscription не становится empty state;
* provisioning error показывает friendly alert;
* test mode явно обозначен;
* admin визуально согласован с существующим проектом.

# 22. Validation и errors

Используй единый слой input validation, предпочтительно существующий Zod, если он уже есть.

Создай типизированные business errors, например:

```text
AUTH_INVALID_OTP
AUTH_CHALLENGE_EXPIRED
AUTH_IDENTITY_IN_USE
AUTH_RATE_LIMITED
PAYMENT_INVALID_PARAMETERS
PAYMENT_ALREADY_PROCESSED
SUBSCRIPTION_NOT_FOUND
SUBSCRIPTION_UPGRADE_REQUIRES_PAYMENT
REFERRAL_INVALID_INVITE
REFERRAL_ALREADY_ASSIGNED
WALLET_INSUFFICIENT_BALANCE
PAYOUT_BELOW_MINIMUM
ADMIN_FORBIDDEN
INTEGRATION_TEMPORARILY_UNAVAILABLE
```

Transport layer должен преобразовывать их в:

* field error;
* inline error;
* toast-friendly message;
* redirect query state;
* корректный HTTP status.

Не возвращай stack trace пользователю.

# 23. Health checks и observability

Добавь:

```text
GET /api/health/live
GET /api/health/ready
```

`live` проверяет, что process работает.

`ready` проверяет:

* SQLite доступна;
* migrations применены;
* worker heartbeat не устарел;
* обязательная конфигурация присутствует.

Не делай каждый readiness request зависимым от синхронного вызова всех внешних providers.

Добавь structured JSON logs в production и readable logs в development.

Каждый request/job/webhook должен иметь `correlationId`.

# 24. Автоматические тесты

Используй существующий test framework. Если его нет, добавь подходящий легкий стек, например Vitest и Playwright.

Обязательные unit/integration tests:

## Auth

* новый email создает User и EMAIL identity;
* существующий email авторизует того же User;
* неправильный OTP;
* истекший OTP;
* превышение attempts;
* повторное использование challenge;
* linking свободного email;
* linking email этого же User;
* отказ при email другого User;
* Telegram login нового User;
* Telegram login существующего User;
* Telegram linking;
* Telegram identity conflict;
* admin login только разрешенными identity;
* USER session не открывает `/admin`.

## Payments

* backend price calculation;
* invalid duration/device limit;
* price snapshot;
* pending payment не активирует subscription;
* confirmed payment активирует subscription;
* duplicate webhook не продлевает повторно;
* продление активной подписки;
* продление expired subscription;
* trial + payment;
* failed provider;
* refund state.

## Referrals

* valid invite;
* invalid/disabled invite;
* self-referral;
* только один invite;
* 3-day trial только один раз;
* reward только после first confirmed payment;
* duplicate webhook не создает duplicate reward;
* reward = 75 ₽;
* referral profile enabled после первой оплаты;
* reward reversal.

## Wallet

* reward increases available;
* payout moves available to reserved;
* reject returns balance;
* paid reduces reserved only;
* insufficient balance;
* concurrent payout attempt;
* ledger projection equals WalletAccount.

## Provisioning

* payment commit не зависит от Remnawave;
* provisioning job success;
* retry;
* failure;
* stale syncVersion не перезаписывает новое состояние;
* reconciliation.

## Admin

* role guard;
* audit for mutations;
* manual subscription extension;
* payout transitions;
* job retry;
* test mode routes unavailable when disabled.

## Test mode

* OTP доступен только в test mode;
* mock confirmation;
* duplicate mock webhook;
* fake Remnawave failure;
* production guard.

Добавь минимум один e2e happy path:

```text
registration by referral
→ 3-day trial
→ payment
→ subscription activation
→ referrer receives 75 ₽
→ provisioning success
```

И один e2e Telegram login flow.

Тесты должны использовать отдельную SQLite test database и не затрагивать dev database.

# 25. Seed и bootstrap

Создай команды:

* dev seed;
* admin bootstrap;
* test data seed;
* pricing seed.

Команды должны быть идемпотентными.

Не помещай реальные secrets в seed.

Admin bootstrap должен использовать env values и гарантировать, что email и Telegram ID относятся к одному ADMIN user.

# 26. Документация

Создай и заполни:

```text
docs/ARCHITECTURE.md
docs/DATABASE.md
docs/BUSINESS_RULES.md
docs/AUTH.md
docs/TELEGRAM.md
docs/PAYMENTS.md
docs/REMNAWAVE.md
docs/TEST_MODE.md
docs/ADMIN.md
docs/DEPLOY_VPS.md
docs/OPERATIONS.md
docs/BACKUP_AND_RESTORE.md
docs/SECURITY.md
```

Документация должна соответствовать фактической реализации, а не желаемому будущему состоянию.

Также обнови основной `README.md`.

## README должен содержать

* назначение проекта;
* requirements;
* Windows 10 local setup;
* env setup;
* database migration;
* seed;
* admin bootstrap;
* запуск web;
* запуск worker;
* запуск Telegram webhook локально;
* запуск tests;
* включение и выключение test mode;
* production build.

# 27. Windows 10 local development

Добавь PowerShell-friendly инструкции и, при необходимости:

```text
scripts/dev.ps1
scripts/setup-local.ps1
scripts/reset-test-db.ps1
```

Локальный запуск должен быть понятным:

1. установить dependencies;
2. создать `.env`;
3. применить migrations;
4. seed pricing/admin;
5. запустить web;
6. запустить worker;
7. открыть приложение;
8. включить test mode.

Если для Telegram webhook требуется публичный tunnel, опиши это, но не привязывай проект жестко к конкретному tunnel provider.

# 28. Production deployment на Ubuntu 24.04

Подготовь deployment под один VPS с 4 GB RAM.

Предпочтительная схема:

* Next.js standalone build;
* Node web process через systemd;
* отдельный Node worker через systemd;
* SQLite в постоянной директории вне каталога release;
* reverse proxy через уже используемый на сервере Nginx или Caddy;
* Remnawave остается отдельным сервисом;
* внутренние порты не публикуются наружу.

Рекомендуемые пути:

```text
/opt/pulsar/current
/etc/pulsar/pulsar.env
/var/lib/pulsar/pulsar.db
/var/backups/pulsar
```

Создай templates:

```text
deploy/systemd/pulsar-web.service
deploy/systemd/pulsar-worker.service
deploy/nginx/pulsar.conf
```

Если проект уже использует Caddy, создай Caddy-конфигурацию вместо Nginx и документируй выбор.

## Reverse proxy

Настрой маршрутизацию концептуально:

```text
pulsar-cloud.space
→ Next.js на 127.0.0.1:3000

panel.pulsar-cloud.space
→ локальный порт Remnawave Panel

sub.pulsar-cloud.space
→ локальный порт Remnawave subscription service
```

Не угадывай порты Remnawave, если они отсутствуют в репозитории или env. Используй placeholders и четко укажи, где их заменить.

Добавь:

* HTTPS;
* redirect HTTP → HTTPS;
* proxy headers;
* request body limits;
* webhook route handling;
* security headers;
* compression;
* timeout settings;
* запрет прямого доступа к внутренним портам.

## Resource limits

Учитывай 4 GB RAM:

* Next.js standalone;
* не запускай лишние development processes;
* worker concurrency 1;
* ограниченные batch sizes;
* разумный Node memory limit;
* log rotation;
* отсутствие Redis, Kafka, RabbitMQ и отдельного PostgreSQL;
* отсутствие тяжелой realtime-инфраструктуры;
* cleanup старых logs;
* отсутствие бесконтрольных in-memory queues.

Подготовь systemd restart policy и graceful shutdown.

## Firewall

В инструкции оставь наружу только необходимые порты:

* SSH;
* HTTP;
* HTTPS.

Не открывай Next.js, SQLite или внутренние Remnawave ports напрямую.

## Deployment procedure

Опиши пошагово:

1. DNS verification.
2. Создание system user.
3. Создание директорий.
4. Установка совместимой версии Node.
5. Клонирование/копирование проекта.
6. Создание env.
7. Установка dependencies.
8. Production build.
9. Backup существующей DB.
10. Prisma migrations.
11. Admin bootstrap.
12. Pricing seed.
13. Установка systemd units.
14. Reverse proxy.
15. TLS.
16. Telegram webhook setup.
17. Payment webhook setup.
18. Health verification.
19. Backup cron/systemd timer.
20. Rollback procedure.

# 29. Backup и restore

Создай:

```text
scripts/backup-sqlite.sh
scripts/restore-sqlite.sh
deploy/systemd/pulsar-backup.service
deploy/systemd/pulsar-backup.timer
```

Требования:

* consistent SQLite backup;
* timestamped files;
* retention;
* permissions;
* optional compression;
* проверка успешности;
* инструкция по копированию backup на удаленное хранилище;
* restore rehearsal;
* обязательный backup перед migration.

Предложи разумную политику:

* snapshot каждые 6 часов;
* daily backup;
* 7 daily;
* 4 weekly;
* регулярная проверка восстановления.

Не удаляй рабочую БД автоматически при неудачном restore.

# 30. Критические invariants

Реализация должна гарантировать:

1. Один email принадлежит максимум одному User.
2. Один Telegram ID принадлежит максимум одному User.
3. Автоматического merge аккаунтов нет.
4. Один User имеет максимум одну текущую Subscription.
5. Один payment webhook не применяется дважды.
6. Один Payment не продлевает Subscription дважды.
7. Один invited User имеет максимум одного inviter.
8. Trial выдается пользователю максимум один раз.
9. Reward по invite/payment создается максимум один раз.
10. WalletAccount соответствует ledger.
11. Available и reserved balance не становятся отрицательными.
12. Paid payout не списывает available повторно.
13. Внешний API failure не откатывает подтвержденный Payment.
14. Test mode невозможно случайно использовать в production.
15. Обычная USER session не открывает admin.
16. Admin mutations всегда попадают в AuditLog.
17. Raw auth/session tokens никогда не хранятся в базе.
18. Client не определяет окончательную цену.
19. Technical integration errors не показываются пользователю.
20. Telegram username не используется как доверенный идентификатор.

# 31. Definition of Done

Задача завершена только когда:

* backend реально подключен к frontend;
* Prisma schema согласована;
* migrations применяются с чистой базы;
* dev seed работает;
* admin bootstrap работает;
* USER и ADMIN auth работают;
* email OTP работает через Resend adapter;
* Telegram login/linking flow реализован;
* payment test provider работает;
* webhook confirmation идемпотентна;
* subscription lifecycle работает;
* referral trial и reward работают;
* wallet и payouts работают;
* outbox worker работает;
* Remnawave adapter подключен либо имеет четкий реальный integration boundary;
* `/admin` функциональна;
* test mode включается и полностью отключается;
* тесты проходят;
* production build проходит;
* lint/typecheck проходят;
* документация создана;
* deployment files созданы;
* backup/restore scripts созданы.

# 32. Финальный отчет

После реализации выведи отчет:

1. Что было обнаружено в исходном проекте.
2. Какие архитектурные решения приняты.
3. Какие файлы добавлены и изменены.
4. Итоговая Prisma schema и migrations.
5. Реализованные user flows.
6. Реализованные admin flows.
7. Реализованный Telegram flow.
8. Как включить test mode.
9. Как запустить проект локально на Windows 10.
10. Как запустить tests.
11. Как развернуть на Ubuntu 24.04.
12. Какие env variables обязательны.
13. Какие внешние credentials еще нужно предоставить.
14. Какие реальные интеграции невозможно завершить без неизвестного API или credentials.
15. Результаты:

    * typecheck;
    * lint;
    * unit tests;
    * integration tests;
    * e2e tests;
    * production build.

Не скрывай ошибки и не заявляй, что интеграция готова, если она реализована только mock-адаптером. Не останавливай работу после создания документации или схемы: реализуй код и доведи проект до максимально рабочего состояния.

*Сейчас сервер полностью пустой, настроен только ssh ключ. Поэтому можешь полностью remnawave не делать, можешь просто подготовить чтоб мы смогли ее интегрировать.

Полезные ссылки:
https://github.com/galeevv/pulsarcloud
https://resend.com/docs/send-with-nextjs
https://docs.platega.io/
https://docs.rw/overview/quick-start
https://github.com/remnawave

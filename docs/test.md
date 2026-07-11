Помоги мне разработать сильный backend и бизнес логику моего сервиса/сайта Pulsar 2.0, frontend уже готов. Так же необходимо поменять стек, база данных для сайта будет SQLite а не pg. Еще необходимо сделать полноценный клиентский функционал в тг боте. Вот текущий справочник по моему frontemd от codex: 

"# User Pages: UX, Backend, Business Logic

Документ описывает пользовательскую часть Pulsar 2.0 без `/admin`. Цель - зафиксировать, какие данные нужны каждой странице, какие действия она запускает, какие состояния должен поддерживать backend и где проходят границы бизнес-логики.

## Общие правила продукта

- Pulsar 2.0 - личный кабинет коммерческого VPN-сервиса с одной пользовательской мульти-подпиской.
- Авторизация только passwordless: email magic link / OTP и будущий Telegram flow. Username/password не используются.
- Пользовательские страницы защищены через `requireUser()`, кроме `/`, `/auth/verify` и `/auth/verify/link`.
- Сессия хранится в HTTP-only cookie, в базе лежит только hash токена `Session.tokenHash`.
- Технические ошибки интеграций нельзя показывать пользователю. Для UI нужны короткие human-readable состояния: toast через Sonner, inline error или `Subscription.lastUserFriendlyError`.
- Деньги хранятся целыми числами в RUB.
- `User.balanceRub` - быстрый текущий баланс, история и аудит денег идут через `WalletLedgerEntry`.
- Основная визуальная модель пользовательских экранов: единая карточка, asset сверху, separator, контент ниже.

## Ключевые доменные сущности

### Auth

- `User`: аккаунт пользователя. Может иметь `email`, `telegramId`, `role`, `balanceRub`.
- `AuthIdentity`: подтвержденные способы входа. Типы: `EMAIL`, `TELEGRAM`.
- `Session`: активные сессии пользователя.
- `LoginChallenge`: одноразовый challenge для email/Telegram входа.
- `EmailOtp`: OTP-код для email flow, хранится как hash, имеет лимит попыток и срок жизни.

### Subscription and Billing

- `Subscription`: текущая подписка пользователя, статус, срок, лимит устройств, LTE, ссылка подписки и sync state.
- `SubscriptionFeature`: внутренние фичи подписки, например regular access и LTE.
- `DeviceLimitChange`: история изменения лимита устройств.
- `Payment`: платеж за подписку. В dev сейчас mock provider, в production должен быть реальный провайдер.
- `PaymentWebhookLog`: сырой журнал webhook-событий платежного провайдера.
- `PricingSettings`: цены, скидки, диапазон устройств, LTE add-on, реферальные суммы.

### Referrals and Wallet

- `ReferralProfile`: реферальный профиль пользователя, invite code/url и флаг доступности.
- `ReferralInvite`: связь "кто кого пригласил" и статус конверсии.
- `ReferralReward`: начисленный бонус за приглашенного пользователя.
- `PayoutRequest`: заявка на вывод средств.
- `WalletLedgerEntry`: финансовая история, резервы, начисления, выплаты, возвраты.

### Support and Legal

- `SupportConversation`: один чат пользователя с командой Pulsar.
- `SupportMessage`: сообщения пользователя, администратора или системы.
- `LegalDocument`: модель в схеме есть, но текущая пользовательская `/legal` читает markdown-файлы из `/docs`.

## `/` - вход и регистрация

### Назначение

Единый экран входа и создания аккаунта. Если пользователь уже авторизован, сервер сразу редиректит на `/home`.

### UI

- Карточка с asset `/hero/pulsar.gif`.
- Начальное состояние: заголовок "Добро пожаловать", подпись "Подключиться к pulsar с помощью", email input с кнопкой-стрелкой, separator "или", Telegram button.
- После отправки email: экран OTP с заголовком "Введите код", текстом "Код отправлен на ...", 6-значным OTP input и таймером повторной отправки.
- В dev mode может показываться `Dev OTP`. Это должно оставаться изолированным dev-only условием.

### Данные

- Query params:
  - `authError=expired | used` - показать понятную ошибку устаревшей/использованной ссылки.
  - `invite` - реферальный invite code.
- Текущий пользователь через `getCurrentUser()`.

### Actions

- `requestEmailOtpAction`
  - валидирует email;
  - создает `LoginChallenge` типа `EMAIL_OTP`;
  - создает `EmailOtp`;
  - возвращает `challengeId`, email и dev-подсказки в dev mode;
  - в production должен отправлять письмо с magic link и/или OTP.
- `verifyEmailOtpAction`
  - валидирует email, `challengeId`, OTP;
  - проверяет latest unconsumed OTP;
  - создает или находит пользователя;
  - upsert-ит `AuthIdentity.EMAIL`;
  - создает `Session`;
  - редиректит на `/home`.
- `startTelegramStubAction`
  - сейчас создает Telegram `LoginChallenge` через mock service;
  - будущий production flow должен завершать challenge через Telegram bot/webapp.

### Backend rules

- OTP и magic link должны иметь короткий TTL. Сейчас логика использует 5 минут.
- OTP должен иметь лимит попыток. Сейчас проверяется `attempts >= 5`.
- Токены magic link и session token хранятся только в hash-виде.
- При регистрации по `invite` нужно создать `ReferralInvite`, только если invite принадлежит enabled `ReferralProfile` и пользователь не приглашает сам себя.
- Повторный вход существующего email не должен создавать дубль пользователя.

### Состояния

- Неавторизован.
- Email отправлен, ждем OTP/magic link.
- OTP неверный.
- Challenge истек.
- Magic link уже использована.
- База не готова: показывать понятное setup-сообщение, не raw error.

## `/auth/verify/link` - magic link endpoint

### Назначение

Серверный endpoint для перехода из письма. Это не UI-страница, а route handler.

### Данные

- Query params:
  - `token` - одноразовый magic link token;
  - `invite` - опциональный invite code.

### Flow

1. Проверить готовность базы.
2. Найти `LoginChallenge` по hash токена.
3. Проверить тип `EMAIL_OTP`, статус `PENDING`, срок жизни и email.
4. Если challenge уже `COMPLETED`, редиректить на `/?authError=used`.
5. Если challenge невалиден или истек, редиректить на `/?authError=expired`.
6. Создать или найти пользователя, применить invite capture.
7. Завершить challenge, создать session, редиректить на `/home`.

### Backend rules

- Endpoint должен быть idempotent по ошибочным повторным переходам.
- Успешно использованный token нельзя использовать повторно.
- Raw provider/db ошибки пользователю не показывать.

## `/auth/verify` - fallback для проблем входа

### Назначение

UI fallback для ситуации, когда ссылка недействительна, истекла или уже использована. Страница должна направлять пользователя обратно к запросу новой ссылки на `/`.

### Backend rules

- Не должна создавать новых challenge сама по себе.
- Не должна раскрывать техническую причину отказа.

## Dashboard layout

### Назначение

Общий layout для пользовательских страниц `/home`, `/subscription`, `/referrals`, `/profile`, `/support`, `/legal`.

### Behavior

- На сервере вызывает `requireUser()`.
- Если сессии нет или она истекла, пользователь редиректится на `/`.
- Добавляет bottom navigation.

### Navigation

Bottom nav сейчас ведет на:

- `/home`
- `/subscription`
- `/referrals`
- `/profile`

`/support` и `/legal` остаются внутри dashboard layout, но не являются основными nav tab. UX-решение по удалению bottom nav с этих task-focused экранов пока не применено.

## `/home` - главный экран

### Назначение

Главный статусный экран личного кабинета. Это текущий визуальный эталон для остальных страниц.

### UI

- Карточка с asset `/hero/pulsar.gif`.
- Краткий статус подписки: нет подписки, активна, осталось N дней, закончилась.
- Badge статуса подписки.
- Badge лимита устройств, если подписка существует.
- Badge LTE, если `subscription.lteEnabled = true`.
- CTA оплаты/продления.
- CTA настройки VPN.
- Отдельная реферальная карточка-переход на `/referrals`.

### Данные

- `User` через `requireUser()`.
- Последняя `Subscription` пользователя, сортировка по `createdAt desc`.
- `PricingSettings.default`.

### Actions

- Payment CTA открывает `SubscriptionPaymentAction`, который отправляет `createPaymentAction`.
- Setup CTA открывает `SetupVpnAction`.
- Referral card ведет на `/referrals`.

### Backend rules

- Для отображения используется effective status:
  - если подписки нет, это `NONE`;
  - если `status=ACTIVE`, но `expiresAt <= now`, UI считает это `EXPIRED`;
  - остальные статусы показываются как есть.
- Продление активной подписки должно добавлять срок к текущему `expiresAt`, если он в будущем.
- Setup VPN должен работать только через `subscriptionUrl`; если ссылки нет, flow ведет к оплате/ожиданию provisioning.

### Состояния

- Нет подписки.
- Trial/active.
- Expired/canceled.
- Active без `subscriptionUrl` из-за pending/failed provisioning.
- LTE включен/выключен.

## `/subscription` - подписка

### Назначение

Детальный экран подписки: ключ, период доступа, подключение в Happ, продление, лимит устройств.

### UI

- Карточка с asset `/details/observed.gif`.
- Empty state, если нет subscription record или effective status `NONE`.
- Заголовок "Подписка" для активной/trial или "Подписка закончилась" для expired/canceled.
- Карточка ключа подписки с копированием.
- Progress "Период доступа".
- Alert с `lastUserFriendlyError`, если provisioning/sync упал.
- CTA "Подключить в Happ", если подписка active/trial и есть `subscriptionUrl`.
- Иначе CTA продления.
- Блок подключенных устройств показывается только если subscription record существует.

### Данные

- Последняя `Subscription` пользователя.
- `PricingSettings.default`.
- Последний pending `Payment` пользователя.
- Query params:
  - `payment=pending` - показать Sonner toast о pending оплате;
  - `error=device-limit | payment | ...` - показать понятный toast.

### Actions

- `createPaymentAction`
  - принимает `months`, `deviceLimit`, `lteEnabled`;
  - валидирует duration: 1/3/6/12 месяцев;
  - валидирует deviceLimit в диапазоне 1-5;
  - создает payment через billing service;
  - редиректит на `/subscription?payment=pending`.
- `changeOwnDeviceLimitAction`
  - принимает новый лимит;
  - создает `DeviceLimitChange`;
  - вызывает provisioning update device limit;
  - revalidate `/subscription`.
- `regenerateSubscriptionUrlAction`
  - регенерирует ссылку через provisioning service;
  - revalidate `/subscription`.

### Backend rules

- Цена считается на backend из `PricingSettings`, клиентский расчет нужен только для UX.
- Pending payment не должен активировать подписку до подтверждения provider/webhook/admin mock confirm.
- При confirmed payment:
  - создать или продлить `Subscription`;
  - проставить `durationMonths`, `deviceLimit`, `lteEnabled`;
  - создать ledger topup/debit записи;
  - обработать referral reward, если payment первый для приглашенного;
  - запустить provisioning.
- Provisioning должен записывать:
  - `syncStatus=PENDING/SYNCED/FAILED`;
  - `subscriptionUrl`;
  - `remnawaveUserId`;
  - `lastUserFriendlyError` и `lastTechnicalError` при ошибке.
- Expired state не должен превращаться в empty state: пользователь должен видеть, что подписка была и закончилась.

### Состояния

- Empty/no subscription.
- Pending payment.
- Active/trial with URL.
- Active/trial without URL.
- Expired/canceled.
- Provisioning failed.
- Invalid payment/device limit input.

## Subscription checkout

### Назначение

Не отдельная route, а общий modal/drawer flow оплаты, который используется на `/home`, `/subscription` и `/referrals` empty state.

### UI

- Mobile: Drawer.
- Desktop: Dialog.
- Шаг 1: выбор срока, устройств, LTE add-on.
- Шаг 2: подтверждение суммы и создание платежа.

### Данные

- `PricingSettings`:
  - `baseMonthlyPriceRub`;
  - `extraDeviceMonthlyPriceRub`;
  - `lteMonthlyPriceRub`;
  - `durationDiscounts`;
  - `minDeviceLimit`;
  - `maxDeviceLimit`.

### Backend rules

- Backend не должен доверять hidden inputs и клиентской сумме.
- Provider должен возвращать `externalPaymentId` и `checkoutUrl`.
- В production нужно заменить mock payment provider и добавить webhook confirmation.
- Все provider payloads должны писаться в `PaymentWebhookLog`.

## Setup VPN flow

### Назначение

Общий flow настройки Happ, используется с `/home` и может открывать payment checkout, если подписка не готова.

### UI

- Detect current platform: Android, iOS, Windows, macOS.
- Можно выбрать другое устройство.
- Показывает ссылку на установку Happ.
- Показывает subscription URL, копирование и deep link `happ://add/...`.
- Если `subscriptionUrl` нет, предлагает перейти к оплате.

### Backend rules

- Flow не должен сам создавать подписку.
- Единственный backend dependency - валидная `subscriptionUrl`.
- В будущем можно добавить event tracking, но не смешивать его с billing/provisioning.

## `/referrals` - реферальная программа

### Назначение

Экран реферальной программы: баланс, вывод, ссылка, статистика и объяснение условий.

### UI

- Карточка с asset `/details/physics.gif`.
- Empty state, если `ReferralProfile` не enabled и нет оплаченной подписки.
- Заголовок "Реферальная программа".
- Баланс и CTA "Вывести".
- Карточка реферальной ссылки с копированием.
- Три метрики:
  - приглашено;
  - активных;
  - выплачено.
- Клик по метрике:
  - mobile Drawer;
  - desktop Dialog.
- Carousel "Как это работает":
  - "Пригласите друга и получите 75 ₽";
  - "Бонус начислим после его первой оплаты.";
  - "Бонус новым пользователям";
  - "Ваш друг получит 3 дня подписки бесплатно.";
  - "Накопили 150 ₽ — выводите";
  - "Создайте заявку прямо из личного кабинета."

### Данные

- `User.balanceRub`.
- `ReferralProfile` текущего пользователя.
- `PricingSettings.default`.
- Последняя `Subscription` пользователя.
- `ReferralInvite[]` where `inviterId=user.id`, include invited email/telegramId.
- Последние `PayoutRequest[]` пользователя, сейчас `take: 10`.

### Actions

- `createPayoutRequestAction`
  - принимает `amountRub` и `payoutDetails`;
  - вызывает wallet payout service;
  - revalidate `/referrals`.
- `CopyButton` для invite URL.
- Empty state CTA открывает checkout.

### Backend rules

- Новый пользователь получает `ReferralProfile` при создании аккаунта, но `isEnabled=false`.
- Реферальный invite засчитывается при регистрации по enabled invite code.
- Бонус начисляется только после первой подтвержденной оплаты приглашенного.
- При начислении бонуса:
  - `ReferralInvite.status` -> `PAID`;
  - создается `ReferralReward` со статусом `AVAILABLE`;
  - создается `WalletLedgerEntry` типа `REFERRAL_REWARD`;
  - `User.balanceRub` inviter увеличивается на `referralRewardRub`;
  - приглашенному можно включить `ReferralProfile.isEnabled=true`, если бизнес-правило остается таким.
- Минимальная сумма вывода берется из `PricingSettings.minimalPayoutRub`.
- Disabled payout CTA сейчас не объясняет причину по UX-решению пользователя; backend все равно обязан валидировать сумму.
- При создании payout:
  - статус `PENDING`;
  - баланс пользователя уменьшается;
  - создается ledger `PAYOUT_RESERVE`.
- При reject payout:
  - создается ledger `PAYOUT_REFUND`;
  - баланс возвращается.
- При paid payout:
  - статус `PAID`;
  - создается ledger `PAYOUT_PAID`.

### Состояния

- Referral locked до оплаты.
- Referral enabled без приглашений.
- Есть registered invites, но нет оплат.
- Есть available balance ниже минимального вывода.
- Есть available balance выше минимального вывода.
- Есть pending/approved/paid/rejected payout requests.

## `/profile` - профиль

### Назначение

Экран аккаунта: способы входа, поддержка, юридические документы, выход.

### UI

- Карточка с asset `/details/birth.gif`.
- Заголовок "Профиль".
- Блок "Способы входа":
  - Email;
  - Telegram.
- Row "Написать в поддержку" -> `/support`.
- Row "Юридическая информация" -> `/legal`.
- CTA выхода с confirmation AlertDialog.

### Данные

- `User.email`.
- `User.telegramId`.
- В будущем список `AuthIdentity[]` может стать source of truth для способов входа.

### Actions

- `logoutAction`
  - удаляет текущую session из базы;
  - удаляет cookie;
  - редиректит на `/`.

### Backend rules

- Email может быть привязан через auth flow.
- Telegram сейчас disabled/stub в UI; production needs attach/unlink flow.
- Выход должен удалять только текущую сессию, а не все сессии пользователя, если не появится отдельная кнопка "выйти на всех устройствах".
- Profile не должен показывать внутренние id кроме аккуратного Telegram id, если он нужен пользователю.

### Состояния

- Email привязан.
- Telegram не привязан.
- Telegram привязан.
- Logout confirmation open/cancel/confirm.

## `/support` - чат поддержки

### Назначение

Один чат пользователя с командой Pulsar. Это не тикет-система.

### UI

- Task-focused card высотой как `/legal`.
- Header: иконка Headphones + "Чат поддержки".
- `SupportThread` через shadcn `ScrollArea`.
- При открытии чат скроллится вниз к последнему сообщению.
- После отправки нового сообщения чат снова скроллится вниз.
- Empty state "Напишите нам".
- Composer:
  - textarea max 4 строки/`max-h-28`, дальше native scroll;
  - Enter отправляет;
  - Shift+Enter переносит строку;
  - Sonner success/error;
  - inline validation error под input.

### Данные

- Последняя `SupportConversation` пользователя, сортировка `updatedAt desc`.
- `SupportMessage[]`, сортировка `createdAt asc`.
- Для UI сообщение мапится в:
  - `id`;
  - `authorRole`;
  - `body`;
  - `createdAtLabel`.

### Actions

- `createSupportMessageAction`
  - требует user session;
  - валидирует body: min 2, max 1000;
  - находит последний conversation пользователя или создает новый;
  - создает `SupportMessage` с `authorRole=USER`;
  - обновляет `SupportConversation.lastMessageAt`;
  - revalidate `/support`;
  - возвращает Sonner-friendly state.

### Backend rules

- У пользователя должен быть один актуальный чат. Если business решит поддерживать reopen, нужно явно описать правила выбора `OPEN` conversation.
- Admin replies должны писать `authorRole=ADMIN`, `senderId` admin user или null для системных сообщений.
- В production нужен realtime/polling слой или обновление по revalidate не будет достаточно живым для чата.
- Пользователь не должен видеть internal status/support ids.
- Сообщения должны быть plain text, с серверной нормализацией и лимитом длины.

### Состояния

- Нет conversation/messages.
- Есть история сообщений.
- Pending send.
- Validation error.
- Send failed.
- Conversation closed, если этот статус начнет использоваться в UX.

## `/legal` - юридическая информация

### Назначение

Экран чтения юридических документов.

### UI

- Task-focused card высотой как `/support`.
- Header: иконка FileText + "Юридическая информация".
- Tabs:
  - "Соглашение";
  - "Оферта";
  - "Политика".
- Внутри tab - title документа, separator и scrollable text через shadcn `ScrollArea`.

### Данные

Текущая реализация читает markdown-файлы из `/docs`:

- `docs/agreement.md`
- `docs/offer.md`
- `docs/confidentiality.md`

### Backend rules

- `/legal/[slug]` удален и не используется.
- Сейчас документы статические и читаются с файловой системы на сервере.
- Если backend перейдет на `LegalDocument`, нужно сохранить тот же UI contract:
  - slug;
  - tab label;
  - title;
  - content;
  - `isPublished`;
  - version/effective date, если потребуется юридически.
- Документы должны быть доступны без раскрытия draft/unpublished версий.

### Состояния

- Все три документа доступны.
- Документ отсутствует или не читается: нужен friendly fallback, сейчас отдельный fallback не реализован.
- Очень длинный документ: scroll внутри content, header/tabs остаются на месте.

## Cross-page backend checklist

### Auth and session

- Нет username/password.
- Email OTP и magic link должны быть одноразовыми.
- Telegram auth должен использовать тот же `LoginChallenge` lifecycle.
- Session cleanup для expired sessions нужен cron/background job.
- Login rate limiting нужен по email/IP/device fingerprint.

### Payments

- Client never decides final price.
- `Payment.status=PENDING` до webhook/provider confirmation.
- Повторный webhook должен быть idempotent.
- Confirmation должен атомарно:
  - подтвердить payment;
  - создать/продлить subscription;
  - записать wallet ledger;
  - начислить referral reward;
  - запустить provisioning;
  - записать audit/integration logs.

### Subscription provisioning

- UI читает только user-friendly fields.
- Technical errors идут в `lastTechnicalError` и `IntegrationLog`.
- User-facing error идет в `lastUserFriendlyError`.
- `subscriptionUrl` - главный пользовательский артефакт для Happ.
- Device limit и LTE должны синхронизироваться с Remnawave через service layer.

### Referrals and wallet

- `WalletLedgerEntry` должен быть idempotent по ключам.
- `User.balanceRub` должен совпадать с posted ledger projection.
- Payout reserve уменьшает доступный баланс сразу.
- Reject payout возвращает баланс.
- Paid payout не должен повторно уменьшать доступный баланс, если reserve уже был применен; текущая ledger-модель пишет отдельную debit-запись для истории, поэтому при развитии логики нужно внимательно определить accounting semantics.

### Support

- Нужен admin-side процесс ответа, но пользовательская сторона уже ожидает общий thread.
- Для production стоит добавить realtime/polling.
- Нужны moderation/anti-spam/rate limits.

### Legal

- Сейчас source of truth - markdown files.
- Если нужна юридическая версия документа, добавить version/effective date/published state и мигрировать `/legal` на DB или CMS.

## Route ownership map

- `/`: `app/page.tsx`, `components/auth/auth-card.tsx`, `app/(auth)/actions.ts`.
- `/auth/verify/link`: `app/auth/verify/link/route.ts`.
- `/auth/verify`: `app/auth/verify/page.tsx`.
- dashboard layout: `app/(dashboard)/layout.tsx`, `components/app/bottom-nav.tsx`.
- `/home`: `app/(dashboard)/home/page.tsx`.
- `/subscription`: `app/(dashboard)/subscription/page.tsx`, `components/app/subscription-payment-action.tsx`, `components/app/setup-vpn-action.tsx`.
- `/referrals`: `app/(dashboard)/referrals/page.tsx`, `components/app/referrals-metrics.tsx`, `components/app/payout-dialog.tsx`.
- `/profile`: `app/(dashboard)/profile/page.tsx`.
- `/support`: `app/(dashboard)/support/page.tsx`, `components/app/support-thread.tsx`, `components/app/support-composer.tsx`.
- `/legal`: `app/(dashboard)/legal/page.tsx`, `docs/agreement.md`, `docs/offer.md`, `docs/confidentiality.md`.
- Shared user actions: `app/(dashboard)/actions.ts`.
- Business services: `src/server/services/billing/payment-service.ts`, `src/server/services/provisioning/subscription-provisioning-service.ts`, `src/server/services/wallet/payout-service.ts`.
"
# PULSAR VPN Telegram Bot — Product & UX Specification

## 1. Product status

- Bot: `@pulsarcloud_bot`.
- Format: ordinary Telegram Bot API bot with webhook and inline keyboards.
- Mini App / `web_app`: not used.
- Published commands: only `/start — Запустить бота`.
- Data: shared website database and domain services.
- Navigation: one photo message whose caption and keyboard are edited.
- Current release: `IMPLEMENTED`; live Telegram acceptance is required before
  changing a screen to `VERIFIED`.

The style is premium minimalism: one task per screen, short copy, no provider
terminology, and a clear next action. All user values are HTML-escaped.

## 2. Screen map

| ID  | Screen                        | Status      |
| --- | ----------------------------- | ----------- |
| 01  | Main                          | IMPLEMENTED |
| 02  | Device management             | IMPLEMENTED |
| 03  | Device deletion confirmation  | IMPLEMENTED |
| 04  | Device-limit upgrade          | IMPLEMENTED |
| 05  | Subscription renewal          | IMPLEMENTED |
| 06  | Invite friends                | IMPLEMENTED |
| 07  | Authorized website transition | IMPLEMENTED |
| 08  | Notifications and news        | IMPLEMENTED |

Repeated `/start`, `/help`, and an unknown private message return to screen 01.
Group messages are ignored. Every callback is answered exactly once.

## 3. Screen 01 — Main

Example with email and an active subscription:

```text
🪐 PULSAR VPN

👤 GALEEV · @galeev66
✉️ user@email.com

🟢 Осталось 30 дней
📱 Подключено устройств: 1 / 5
⚡️ Доступ Plus: есть
```

Without an EMAIL identity, the same line reads `✉️ Привяжите почту на сайте`,
so the blocks keep the same compact spacing. Telegram username is metadata only.
`Plus` is the Telegram product name for `lteEnabled`.

Keyboard:

```text
[🔗 Подключиться]
[📱 Устройства] [💎 Продлить]
[🎁 Пригласить] [💬 Поддержка]
[🌐 Сайт]
```

- `Подключиться` creates a fresh login to `/instructions`.
- `Устройства`, `Продлить`, and `Пригласить` stay inside Telegram.
- `Поддержка` creates a fresh login to `/support`.
- `Сайт` creates a fresh login to `/home`.

### Main state table

| State                    | Copy/behavior                                              |
| ------------------------ | ---------------------------------------------------------- |
| No subscription          | `⚪ Подписка не оформлена`; renewal flow remains available |
| Active, over 3 days      | green remaining-days status                                |
| Three days or less       | orange remaining-days status                               |
| Expired                  | `🔴 Подписка истекла`; button is `💎 Возобновить подписку` |
| Sync pending             | `🟡 Настраиваем подписку`; show limit and Plus             |
| Sync failed              | friendly automatic-retry state and support button          |
| Device count unavailable | `📱 Лимит устройств: до N`, never `0 / N`                  |
| Suspended legacy row     | support only; no payment CTA                               |

Actual device usage is loaded by the outbox worker through the existing
Remnawave service only for an active, synced subscription. A provider failure
does not prevent the rest of the main screen from opening.

## 4. Screens 02–04 — Devices

Normal list:

```text
📱 Управление устройствами

🟢 Подключено устройств: 1 / 5

Нажмите на устройство, чтобы удалить его.
```

Buttons use one row per connected device:

```text
[📱 Android (Pixel 10)]
[🍏 iPhone]
[💻 Windows]
[🖥 macOS]
[🐧 Linux]
[🔒 Устройство]
[➕ Дополнительное устройство]
[‹ Вернуться в главное меню]
```

The additional-device button is omitted at the maximum configured limit. At a
full current limit, the screen explains that the limit is reached; upgrade is
still offered when the configured maximum is higher.

Deletion confirmation:

```text
🗑 Удалить устройство?

Android (Pixel 10)

После удаления это устройство потеряет доступ. Его можно будет подключить
заново, если лимит свободен.
```

```text
[🗑 Удалить]
[‹ Назад к устройствам]
```

Device actions resolve a user-bound HMAC tag to the freshly loaded owned list.
The raw HWID is never sent to Telegram. Deletion calls the existing
subscription/Remnawave service and then reloads the list.

Handled states: no active subscription, no devices, provider unavailable, sync
pending, sync failed, reached current limit, and maximum limit.

### Device-limit upgrade

The screen shows current/max limits and one server-priced button per available
target. The amount uses the website rule: each added slot is prorated by the
remaining subscription days. Review fixes amount and pricing version; payment
uses the common external checkout. A stale quote asks the user to refresh.

## 5. Screen 05 — Renewal

### 5.1 Duration

```text
💎 Продление подписки

Выберите срок:
```

Buttons are built from the enabled pricing durations, normally 1, 3, 6, and 12
months, followed by `‹ Назад`.

### 5.2 Device limit

```text
📱 Количество устройств

Выберите лимит устройств:
```

Buttons cover every configured integer from `minDeviceLimit` through
`maxDeviceLimit`, capped at five.

### 5.3 Plus

```text
⚡️ Доступ Plus

Plus добавляет LTE и расширенный доступ.
```

```text
[⚡️ Добавить Plus]
[Без Plus]
[‹ Назад]
```

### 5.4 Review and checkout

```text
🧾 Проверьте заказ

Срок: 3 месяца
Устройства: 3
Доступ Plus: да

Итого: 1 990 ₽
```

```text
[💳 Оплатить]
[‹ Изменить]
[🏠 Главное меню]
```

After checkout creation the callback screen contains an ordinary
`💳 Перейти к оплате ↗` URL. Telegram Payments are not used. The billing
service remains authoritative for price changes, identical-checkout reuse,
changed-order superseding, active-term extension, and expired-term restart.

## 6. Screen 06 — Invite friends

```text
🎁 Пригласить друзей

Приглашено: 12
Активных: 5
Начислено дней: 10

Другу 1 день бесплатно
Вам +10 бонусных дней

Ваша ссылка:
https://pulsar-cloud.space/?invite=...

Telegram-ссылка:
https://t.me/pulsarcloud_bot?start=ref_...
```

When supported by the value length, buttons are:

```text
[📋 Скопировать ссылку сайта]
[📋 Скопировать Telegram-ссылку]
[‹ Вернуться в главное меню]
```

The displayed free-trial and inviter-reward conditions come from the shared
`PricingSettings`; the numbers above are only an example. Both links use one
enabled `ReferralProfile`. A referral bot start creates the normal shared
account, applies the same trial/inviter logic as the website, and queues one
inviter notification. Existing users cannot replace their inviter.

## 7. Screen 07 — Authorized website transition

All website buttons begin as callbacks because a stored URL would become stale.
The callback verifies the private chat and Telegram identity, creates a
five-minute completion challenge, stores only its HMAC, and renders:

```text
🪐 PULSAR VPN — Сайт / Подключение / Поддержка

🔐 Вход подготовлен.
⏳ Ссылка действует 5 минут.
```

The ordinary URL button opens in any browser, consumes the token once, creates
the normal web session, and redirects only to the server allowlist. No Mini App
state or Telegram browser cookie is required.

## 8. Screen 08 — Notifications and news

Allowed service events:

- subscription expiring in roughly three days or one day;
- subscription expired;
- support reply;
- new registration from a referral link;
- partner commission when `PartnerEnrollment.enabled=true`.

Intentionally silent:

- payment confirmed;
- subscription ready;
- provisioning failed.
- payout approved, paid, or rejected.

Subscription notifications:

```text
⏳ Подписка скоро закончится

Осталось 3 дня. Продлите подписку, чтобы сохранить доступ к PULSAR VPN.
```

Button: `💎 Продлить подписку` → in-bot renewal.

```text
🟠 Остался 1 день

Подписка PULSAR VPN закончится завтра.
```

Button: `💎 Продлить подписку` → in-bot renewal.

```text
🔴 Подписка закончилась

Доступ PULSAR VPN приостановлен. Возобновите подписку, чтобы снова подключиться.
```

Button: `💎 Возобновить подписку` → in-bot renewal.

Referral registration:

```text
🎁 Новый пользователь по вашей ссылке

@galeev66 зарегистрировался по вашей реферальной ссылке.
```

Partner commission:

```text
🤝 Партнёрское начисление

@galeev66 оплатил подписку.
Сумма оплаты: 1 990 ₽
Ваш доход: 597 ₽
```

Its `🤝 Открыть партнёрку` button creates a fresh login to `/partner`. Partner amounts are read from
the immutable commission row, not recalculated in the Telegram worker.

Support notifications do not copy the reply body; the `💬 Прочитать ответ`
button creates a fresh login to `/support`. Admin news is plain text, delivered in bounded outbox batches to
reachable active users with news enabled. A blocked/unavailable recipient is
marked once and skipped afterwards.

## 9. Security and acceptance

- Webhook secret header is timing-safely verified.
- Input is stopped at 256 KB and `update_id` is unique.
- Stored updates are normalized and exclude bearer tokens/full payloads.
- Telegram ID comes only from a safe numeric `from.id`, then becomes a string.
- Private chat equality is mandatory for auth/menu callbacks.
- Callback data is allowlisted ASCII and at most 64 bytes.
- Every callback receives one `answerCallbackQuery`.
- Provider/payment work happens in the worker, outside webhook transactions.
- Magic links are one-use, five-minute, HMAC-only, `no-store`, and
  `no-referrer`; Nginx does not log the completion route.

Live acceptance must verify BotFather metadata, `/start`, all main states,
device removal, renewal and upgrade checkouts, referral deep-link registration,
copy buttons, support/partner links, broadcast delivery, blocked-bot behavior,
and absence of any Mini App surface.

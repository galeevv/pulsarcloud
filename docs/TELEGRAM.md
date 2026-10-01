# Telegram

PULSAR VPN uses the ordinary Telegram Bot API bot `@pulsarcloud_bot` through
an HTTPS webhook and inline keyboards. Telegram Mini App and `web_app` are not
used. Website transitions are ordinary URL buttons created after a callback;
navigation inside the bot uses `callback_data`.

The BotFather command list contains exactly one command:

- `/start` — `Запустить бота`.

`/help`, legacy commands, and unknown private messages remain backend aliases
for `/start`, but are not published by `setMyCommands`. The chat menu button is
`commands`, never `web_app`.

## Shared account and registration

Every private `/start` takes the Telegram identity only from the verified
`message.from.id`, converts the safe integer to a string, and looks up the
shared `AuthIdentity.telegramId`. Username and names are display metadata only.
If no identity exists, one transaction creates the regular `User`, Telegram
`AuthIdentity`, `TelegramProfile`, `WalletAccount`, and `ReferralProfile`.
There is no bot-specific database or user model.

`/start ref_<inviteCode>` applies the same referral registration use case as
the website. The complete start parameter is limited to 64 Bot API characters,
so the code part is at most 60 characters. Existing users are never reassigned,
and idempotent retries do not duplicate an invite, trial, provisioning job, or
notification.

`/start <login-token>` keeps the existing login/linking flow. The webhook stores
only the HMAC of the opaque token. Conflicting Telegram identities are rejected;
accounts are never merged automatically.

## Main menu

The bot keeps one photo message (`public/tg/tg4.png`) and edits its caption and
keyboard. The main caption is headed `PULSAR VPN`, shows the Telegram display
name, linked email or `✉️ Привяжите почту на сайте` in the same position,
effective subscription state, device usage or an honest limit fallback, and
`Доступ Plus` (the domain field remains `lteEnabled`).

States:

- no subscription — subscription is not оформлена;
- active — remaining days, actual `{used} / {limit}` when Remnawave answers;
- expiring — orange status at three days or less;
- expired — red status and `💎 Возобновить подписку`;
- sync `PENDING` — setup in progress without technical details;
- sync `FAILED` — automatic retry/support state;
- device lookup failure — `Лимит устройств: до N`, never a fake zero;
- `SUSPENDED` — defensive legacy state leading to support, not payment.

Button order:

```text
[🔗 Подключиться]
[📱 Устройства] [💎 Продлить]
[🎁 Пригласить] [💬 Поддержка]
[🤝 Партнёрская программа]  # only when PartnerEnrollment.enabled=true
[🌐 Сайт]
```

`Подключиться`, `Поддержка`, and `Сайт` are callbacks. Each creates a fresh,
one-use, five-minute website login for `/instructions`, `/support`, or `/home`.
The partner button is absent for ordinary users. Its summary reads the shared
wallet, commission, and payout projections. Commission history uses one bounded
query with `take: 10`; payout details remain on `/partner` behind a fresh login.

## Devices

The device screen uses the existing subscription domain service and Remnawave
provider. It handles no subscription, empty list, provider unavailable, sync
pending/failed, reached limit, and maximum limit. Known platforms are presented
as Android, iPhone/iPad, Windows, macOS, or Linux; unknown values use
`🔒 Устройство`.

Raw HWIDs never enter captions, `callback_data`, webhook logs, or audit logs.
Each device button contains a 16-character HMAC reference bound to the local
user. On confirmation and deletion the worker reloads the owned remote list,
resolves exactly one matching reference, and calls
`deleteSubscriptionDevice`. A retry after a successful remote deletion is
treated as already complete and renders the current list.

The additional-device flow calls `getDeviceLimitUpgradeExpectation` and
`createDeviceLimitUpgradeCheckout`. It displays the current and maximum limits,
the prorated server price, and an ordinary external checkout URL. Telegram
Payments are not used.

## Renewal

Renewal is a callback flow:

1. duration from `PricingSettings.availableDurationsJson`;
2. device limit from the configured min/max rules (hard ceiling five);
3. Plus choice mapped to `lteEnabled`;
4. authoritative review with amount and pricing version;
5. existing billing checkout and ordinary provider URL.

The review button carries only compact validated selection data,
`pricingVersion`, and `expectedAmountMinor`. The worker uses a deterministic
idempotency key based on `update_id`. Existing billing logic reuses an identical
open checkout or supersedes a changed order. A stale quote renders an update
screen and never creates a payment. Active renewals extend from the current
expiry; expired subscriptions start from payment confirmation time.

## Referrals

The referral screen reads the shared referral projections and prints invited,
paid/active, and awarded-day counters plus two links:

```text
https://pulsar-cloud.space/?invite=<inviteCode>
https://t.me/pulsarcloud_bot?start=ref_<inviteCode>
```

When the profile is enabled and each URL is at most 256 characters, the inline
keyboard includes Bot API `copy_text` buttons. The URLs remain visible as text
for clients and as a fallback. The profile activation rule is unchanged: links
become available after the owner's first confirmed payment.

## Callback contract

All generated values are ASCII and at most 64 bytes:

| Pattern                                          | Meaning                                     |
| ------------------------------------------------ | ------------------------------------------- |
| `m:h`, `m:d`, `m:r`, `m:f`, `m:p`                | home, devices, renewal, referrals, partner  |
| `p:h`                                            | latest ten partner commissions              |
| `w:h`, `w:i`, `w:s`, `w:p`                       | fresh login for site destinations           |
| `d:c:<tag>`, `d:x:<tag>`, `d:u`                  | device confirm, delete, upgrade             |
| `u:q:<limit>`                                    | device-limit review                         |
| `u:x:<limit>:<version>:<amount>`                 | device-limit checkout                       |
| `r:0`, `r:d:<months>`, `r:l:<months>:<limit>`    | renewal navigation                          |
| `r:q:<months>:<limit>:<plus>`                    | renewal review                              |
| `r:x:<months>:<limit>:<plus>:<version>:<amount>` | renewal checkout                            |

Legacy `menu:home`, `menu:referrals`, and `menu:site-login` remain read-only
aliases for buttons already delivered before this release. Unknown data is
rejected. Every callback is answered exactly once; valid callbacks are
acknowledged before Remnawave/payment work and failures are rendered in the
same message.

## Webhook and security

`POST /api/integrations/telegram/webhook`:

- timing-safely checks `X-Telegram-Bot-Api-Secret-Token`;
- stops streaming input after 256 KB, including chunked bodies;
- requires a safe integer `update_id` and deduplicates it in SQLite;
- accepts only normalized `message`, `callback_query`, and `my_chat_member`;
- stores no raw message, full update, login token, HWID, or arbitrary callback;
- creates `PROCESS_TELEGRAM_UPDATE` transactionally and returns immediately;
- authorizes menu/login actions only when private `chat.id === from.id`;
- ignores groups and uses private `chat.id` for bot reachability updates.

Network and payment work runs in the outbox worker. Telegram IDs are strings in
the domain/database. The webhook secret must be 16–256 characters using only
`A-Z`, `a-z`, `0-9`, `_`, and `-`.

## Magic login

Website login links contain a challenge ID plus a random completion token,
expire after five minutes, and work in any browser. Only an HMAC is stored.
Consumption creates the regular USER session and allows only `/home`,
`/instructions`, `/referrals`, `/support`, or `/partner`.

The completion response is `no-store` and `Referrer-Policy: no-referrer`.
Nginx already disables access logging for the exact completion route. Together
these existing layers prevent query credentials from reaching access or
Referer logs; this release does not require a separate Nginx configuration
change.

## Notifications and news

All delivery uses the existing outbox. Enabled service events are subscription
expiry, support reply, referral registration, and partner commission. Payment
confirmation, provisioning success/failure, and payout-status messages are
explicitly silent.

Expiry messages use the compact PULSAR VPN copy and open the in-bot renewal
flow through `m:r`:

- three days: `⏳ Подписка скоро закончится` with `💎 Продлить подписку`;
- one day: `🟠 Остался 1 день` with `💎 Продлить подписку`;
- expired: `🔴 Подписка закончилась` with `💎 Возобновить подписку`.

Referral and partner messages use Telegram username when available, otherwise
the Telegram name or `Пользователь PULSAR`; email is not exposed. Partner
amounts come from the immutable `PartnerCommission` snapshot. Support text
stays on the website and its button creates a fresh login to `/support`.

Admin news uses `TelegramBroadcast` and bounded batch jobs. It targets active,
reachable users who have news notifications enabled. Transactional and news
preferences remain separate and default to enabled. `my_chat_member` plus
Bot API recipient-unavailable responses set `canReceiveMessages=false` without
repeated failures.

The production worker keeps the existing conservative 1500 ms polling interval
and queue behavior, so this release does not increase background polling load.
The optional live device count on the home screen has a one-second Remnawave
budget; on timeout the bot immediately falls back to the configured limit. The
full device screen keeps the normal provider timeout because it requires
authoritative data.

## Deployment

Run after TLS and `/etc/pulsar/pulsar.env` are ready:

```bash
sudo bash /opt/pulsar/current/deploy/pulsar/configure-telegram-webhook.sh
```

The script sets and reads back, for default and Russian localization:

- name `PULSAR VPN`;
- `/start — Запустить бота` as the only command;
- description and short description `🪐 PULSAR VPN — Быстрый и надежный VPN`,
  followed by `Site: pulsar-cloud.space` and `Channel: t.me/pulsarvpn_news`;
- a `commands` menu button;
- the production webhook, secret token, and the three allowed update types.

Telegram does not return the configured secret. Operational verification is an
invalid-header request returning `401` followed by a real Telegram delivery.
Canonical API reference: <https://core.telegram.org/bots/api>.

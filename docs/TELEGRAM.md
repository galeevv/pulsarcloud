# Telegram

PULSAR uses a regular BotFather bot through the Telegram Bot API. The integration uses an HTTPS webhook and `InlineKeyboardMarkup`. **Telegram Mini App and the `web_app` field are not used anywhere in the project.** Website buttons are ordinary `url` buttons and open in any browser; navigation inside the bot uses `callback_data`.

The BotFather command list contains exactly one command:

- `/start` — open the PULSAR menu.

`/help`, legacy commands, and unknown private messages are accepted by the backend as aliases for the main menu, but are intentionally absent from `setMyCommands`. The default chat menu button has type `commands`, not `web_app`.

## Main menu and shared account

A private `/start` without a parameter looks up `AuthIdentity.telegramId` using only the verified Telegram `from.id`. If the identity does not exist, one short transaction creates the same `User`, `AuthIdentity`, `TelegramProfile`, `WalletAccount`, and `ReferralProfile` used by the website. No bot-specific user or database exists. Username and display names are profile metadata and are never authorization inputs.

The main menu is a photo message using `/public/tg/lk.png`. Its HTML caption
shows the user's first name and the current shared `Subscription`: product
status, plan duration, expiry, honest local device limit, and LTE access. A
ready active subscription gets an ordinary URL button containing its
`subscriptionUrl`. Purchase, renewal, and website buttons use
`menu:site-login`; `menu:referrals` opens the referral screen.

The referral screen shows invited users, active users, and the shared
`WalletAccount.availableMinor` balance. It prints both the website invite URL
and `https://t.me/<bot>?start=ref_<inviteCode>`. The withdrawal button uses
`menu:payout-login`; both website callbacks create a fresh five-minute
one-time website login. Every callback is answered with
`answerCallbackQuery`; callbacks are accepted only from a private chat whose
`chat.id` equals the verified `from.id`.

## Website login and Telegram linking

The site creates a five-minute opaque start token and stores only its HMAC. `/start <token>` arrives through the same webhook. The worker matches the token hash, takes the Telegram ID exclusively from the verified update, and either uses the existing identity, creates the shared user graph, or links the identity to the authenticated requesting user. A Telegram identity already owned by another user is rejected and accounts are never merged automatically.

After confirmation the bot sends an ordinary URL button **«Вернуться в PULSAR»**. Its completion URL contains a matching challenge ID and a different one-use token, can be opened in any browser for five minutes, creates the website session, and redirects to `/home`. The same HMAC-only completion mechanism is used by `menu:site-login`, `menu:payout-login`, and support reply notifications, with safe redirects to `/home`, `/referrals`, or `/support`. Browser-state cookies are not required before the completion URL is opened. Raw start/completion tokens are never stored in the database or webhook log.

`/start ref_<inviteCode>` registers a new bot user in the shared user graph and
applies the existing referral domain logic atomically. Existing users are not
reassigned and retries do not create duplicate invites.

## Webhook and safety

The endpoint is `POST /api/integrations/telegram/webhook`. It:

- verifies `X-Telegram-Bot-Api-Secret-Token` with a timing-safe comparison;
- rejects bodies over 256 KB before processing;
- requires a safe integer `update_id` and deduplicates it with a unique database constraint;
- accepts only `message`, `callback_query`, and `my_chat_member` updates;
- stores a normalized allowlisted representation, not the full payload or raw message;
- commits a `PROCESS_TELEGRAM_UPDATE` outbox job and responds immediately;
- performs authentication and menu actions only in a private chat;
- stores Telegram IDs as strings;
- processes blocked/unblocked state from `my_chat_member` and disables delivery after Bot API `Forbidden`/blocked errors.

Telegram retries non-2xx webhook responses, while duplicate `update_id` values do not create a second job. Network calls to Telegram run in the single-concurrency worker, never inside a domain transaction.

## Notifications and news

Service notifications are enabled by default and are sent through the existing
outbox for approaching expiry, expiry, referral payout state, and support
replies. Payment confirmation and provisioning success/failure are
intentionally silent. A support notification never copies the private reply
text into Telegram; it provides a fresh authenticated URL button to
`/support`. News use `TelegramBroadcast` and small
`SEND_TELEGRAM_BROADCAST_BATCH` jobs and send the admin-entered body as plain
text. News respects `newsNotificationsEnabled`; transactional delivery
separately respects `transactionalNotificationsEnabled`. Blocking the bot
always stops both.

## Deployment

After TLS and the protected `/etc/pulsar/pulsar.env` are ready, run:

```bash
sudo bash /opt/pulsar/current/deploy/pulsar/configure-telegram-webhook.sh
```

The script sets the PULSAR name, description, short description, the single `/start` command for default and Russian command scopes, a `commands` menu button, and the webhook with `secret_token` plus the three allowed update types. It then reads back commands, profile metadata, menu button, webhook URL, and `allowed_updates` and fails on drift. Telegram does not return the configured webhook secret, so possession is verified operationally by a request with an invalid header returning `401` and Telegram deliveries with the configured secret succeeding.

The canonical Bot API contract is [core.telegram.org/bots/api](https://core.telegram.org/bots/api).

The local Telegram simulator is available only in non-production test mode. The explicit production test-mode override uses the configured real bot and `https://t.me/<bot>?start=<token>` while keeping created users isolated with `isTest=true`.

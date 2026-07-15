# Telegram

The site creates a five-minute opaque start token and stores only its hash. `/start <token>` arrives at `POST /api/integrations/telegram/webhook`, whose `X-Telegram-Bot-Api-Secret-Token` is verified before the 256 KB-limited request is accepted. The raw message and bearer token are never persisted: the webhook stores a normalized command plus only the token HMAC. `update_id` is unique and processing runs through the outbox.

The worker accepts auth commands only from a private chat whose `chat.id` equals `from.id`; group and supergroup `/start` messages are ignored so a bearer completion URL is never published to other members. It takes the verified numeric Telegram ID, creates or links the identity, and sends a one-use completion URL. Supported commands are `/start`, `/account`, `/notifications`, and `/help`.

`deploy/pulsar/configure-telegram-webhook.sh` also publishes the Russian command menu and the bot profile descriptions through the Bot API, then reads the command list back. The menu matches the handlers exactly:

- `/start` — start a Pulsar login or show the introduction;
- `/account` — open the personal account;
- `/notifications` — explain where notification preferences live;
- `/help` — show help and the supported commands.

The same values can be reviewed in BotFather under **My Bots → Edit Bot → Edit Commands / Edit Description / Edit About**, but the deployment script is the source of truth so later releases do not drift from the backend.

The completion URL includes `challenge=<id>` and a one-use token, and it may be redeemed in any browser within five minutes. The challenge ID must match the token's stored challenge; a mismatch does not consume the valid token. Browser-state cookies are not used for login completion.

The local Telegram simulator is available only in non-production test mode. The explicit production test-mode override uses the configured real bot and `https://t.me/<bot>?start=<token>` while keeping created users isolated with `isTest=true`.

Payment confirmation says setup is in progress. Separate outbox messages report provisioning completion or its terminal failure, subscription expiry, and payout state. Transactional notifications and opt-in broadcasts use the same gateway. Both individual sends and broadcast batches mark `canReceiveMessages=false`/`botBlockedAt` when Telegram reports that the bot was blocked.

Set a webhook after TLS is live:

```bash
curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://pulsar-cloud.space/api/integrations/telegram/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

Never trust username for authorization. Required values are bot token, bot username, and a random webhook secret.

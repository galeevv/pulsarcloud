# Integrations

External integrations are intentionally mocked for the current stage.

## Remnawave

Interface: `src/server/services/remnawave/client.ts`

Current implementation: `MockRemnawaveClient`

All subscription provisioning goes through `SubscriptionProvisioningService`. Replace the mock with a real client later; UI and server actions should not change.

Relevant references reviewed:

- Remnawave docs quick start: https://docs.rw/overview/quick-start/
- Remnawave GitHub: https://github.com/remnawave

## Platega

Interface: `src/server/services/payments/provider.ts`

Current implementation: `MockPaymentProvider`

Admin confirms mock payments manually. Later, implement Platega payment creation and webhook confirmation, storing all webhook payloads in `PaymentWebhookLog`.

Relevant reference reviewed:

- Platega auth docs: https://docs.platega.io/

## Telegram

Interface: `src/server/services/telegram/auth-service.ts`

Current implementation: `MockTelegramAuthService`

Future bot integration should use Telegram Bot API, complete `LoginChallenge`, and store `AuthIdentity.TELEGRAM`.

Relevant reference reviewed:

- Telegram Bot API: https://core.telegram.org/bots/api

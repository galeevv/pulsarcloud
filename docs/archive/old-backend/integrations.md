ARCHIVED: документ описывает удаленную реализацию backend и не является актуальной архитектурой Pulsar 2.0.

# Integrations

Payment, Remnawave, Telegram, and email adapters are mocked or intentionally
disabled during local development. Durable database boundaries are already in
place through `PaymentWebhookEvent`, `TelegramUpdate`, and `Job`.

Production implementation and verification steps are documented in
`docs/integration-handoff.md`.

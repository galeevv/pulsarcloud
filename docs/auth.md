# Auth flow

Pulsar uses passwordless identities. `AuthIdentity` is unique by
`(provider, providerSubject)` and by `(userId, provider)`, so one account cannot
silently acquire two email or two Telegram identities.

Email OTP and magic link share one `AuthChallenge`. Only hashes are stored in
the challenge, attempts are bounded, and consumption uses a conditional update
inside a transaction. A consumed challenge cannot be reused concurrently.

Sessions use an opaque random cookie; only its SHA-256 hash is stored in
`Session`. Logout revokes the row and clears the HTTP-only cookie.

OTP values and magic links are never returned to the browser or written to
logs. Resend delivery and Telegram webhook processing run through durable jobs;
see `docs/integration-handoff.md`.

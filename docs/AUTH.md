# Authentication

Email login issues a six-digit OTP and a magic link from the same one-use challenge. Both expire after five minutes. Resends have a 60-second cooldown; persisted upper limits are five requests per five minutes per normalized email and ten requests per five minutes per IP. These same limits apply to USER, ADMIN, and email-linking challenges; ADMIN login has no hidden stricter request cap. OTP verification locks a challenge after five incorrect attempts.

The database stores `HMAC-SHA256(AUTH_PEPPER, challengeId + ':' + otp)` and an HMAC of the random magic-link token, never either raw credential. The outbox carries AES-GCM-encrypted delivery values. Test mode may also retain the encrypted OTP for admin/dev display. Starting email authentication sets a signed, per-challenge, HttpOnly, SameSite=Lax browser-state cookie for five minutes. A magic link succeeds only in the initiating browser; a missing or mismatched state returns `error=device` without consuming the link. Successful OTP or link use completes the shared challenge, invalidating the other credential, and replay returns `error=used`.

New identities create a `User`, `WalletAccount`, and `ReferralProfile` atomically. Linking requires an existing USER session. A conflicting identity is rejected; accounts are never merged automatically.

Sessions use 32-byte random cookie tokens; only HMAC hashes are stored. USER and ADMIN cookies are distinct, HttpOnly, SameSite=Lax, and have a 180-day absolute cookie/database lifetime. The server applies a sliding 30-day USER idle timeout and a tighter seven-day ADMIN idle timeout, always capped by the absolute expiry. Production names are `__Host-pulsar_user_session` and `__Host-pulsar_admin_session`, with Secure/Path requirements and no Domain attribute. ADMIN login accepts only the bootstrapped email/Telegram identity, verifies `role=ADMIN`, and audits invalid OTP, rate-limited, and incorrect-Telegram attempts. Test adapters cannot authenticate a real identity and vice versa.

An authenticated request to `/` checks the separate ADMIN cookie first, then USER: ADMIN redirects to `/admin`, USER redirects to `/home`, and a browser holding both is sent to `/admin`.

Starting Telegram authentication sets a signed, per-challenge browser-state cookie for ten minutes. It is HttpOnly, SameSite=Lax, host-only, and Secure in production. The one-use completion URL includes the challenge ID and succeeds only when its signed state matches the initiating browser; a missing or mismatched state redirects with `error=device` without consuming the completion token.

Routes: `/api/auth/email/request`, `/api/auth/email/verify`, `/auth/verify/link`, `/api/auth/telegram/start`, `/api/auth/telegram/complete`, and `/api/auth/logout`. Technical errors are mapped to friendly messages.

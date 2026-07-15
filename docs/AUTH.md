# Authentication

Email login issues a six-digit OTP and a magic link from the same one-use challenge. Both expire after five minutes. A fresh pending challenge blocks another request for 60 seconds, while a completed login does not block an immediate new login after logout. Persisted upper limits are five requests per five minutes per normalized email and ten requests per five minutes per IP. These same limits apply to USER, ADMIN, and email-linking challenges; ADMIN login has no hidden stricter request cap. OTP verification locks a challenge after five incorrect attempts.

The database stores `HMAC-SHA256(AUTH_PEPPER, challengeId + ':' + otp)` and an HMAC of the random magic-link token, never either raw credential. The outbox carries AES-GCM-encrypted delivery values. Test mode may also retain the encrypted OTP for admin audit. A login magic link can be opened in any browser: authorization depends on the matching challenge ID and token hash, its five-minute expiry, and one-time consumption rather than a browser cookie. Successful OTP or link use completes the shared challenge, invalidating the other credential, and replay returns `error=used`.

New identities create a `User`, `WalletAccount`, and `ReferralProfile` atomically. Linking requires an existing USER session. A conflicting identity is rejected; accounts are never merged automatically.

Sessions use 32-byte random cookie tokens; only HMAC hashes are stored. USER and ADMIN cookies are distinct, HttpOnly, SameSite=Lax, and have a 180-day absolute cookie/database lifetime. The server applies a sliding 30-day USER idle timeout and a tighter seven-day ADMIN idle timeout, always capped by the absolute expiry. Production names are `__Host-pulsar_user_session` and `__Host-pulsar_admin_session`, with Secure/Path requirements and no Domain attribute. ADMIN login accepts only the bootstrapped email/Telegram identity, verifies `role=ADMIN`, and audits invalid OTP, rate-limited, and incorrect-Telegram attempts. Test adapters cannot authenticate a real identity and vice versa.

An authenticated request to `/` checks the separate ADMIN cookie first, then USER: ADMIN redirects to `/admin`, USER redirects to `/home`, and a browser holding both is sent to `/admin`.

The Telegram completion URL can also be opened in any browser. It includes the challenge ID and a one-use token; both must match the stored challenge, and completion expires after five minutes. A mismatched challenge does not consume the valid token.

The no-op email sender, Telegram simulator, and development OTP response are enabled only when test mode runs outside production. An explicitly approved production test-mode runtime still creates `isTest=true` users, but requires real Resend and Telegram credentials, sends users to the real `t.me` bot, and never returns `devOtp` to the client.

Routes: `/api/auth/email/request`, `/api/auth/email/verify`, `/auth/verify/link`, `/api/auth/telegram/start`, `/api/auth/telegram/complete`, and `/api/auth/logout`. Technical errors are mapped to friendly messages.

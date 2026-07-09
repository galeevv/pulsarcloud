# Auth Flow

Pulsar 2.0 uses passwordless auth only.

## Email OTP

1. User enters email on `/`.
2. `requestEmailOtpAction` creates:
   - `EmailOtp`
   - `LoginChallenge` with type `EMAIL_OTP`
3. In dev mode, OTP appears in server logs and the login card.
4. User enters OTP.
5. `verifyEmailOtpAction` validates the latest unconsumed OTP.
6. Existing user is logged in or a new user is created.
7. `AuthIdentity` with type `EMAIL` is upserted.
8. Session is created and stored in an HTTP-only cookie.

## Telegram Stub

The login page has a Telegram button. Today it creates a `LoginChallenge` with type `TELEGRAM` through `MockTelegramAuthService` and returns “Скоро”.

Future bot integration should complete the challenge, attach `AuthIdentity.TELEGRAM`, and create a session using the same session helper.

## Invite Capture

When a new user registers through `/?invite=...`, auth checks enabled `ReferralProfile.inviteCode` and creates `ReferralInvite`. Rewards are granted only after confirmed payment.

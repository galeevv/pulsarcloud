# Seed Data

`prisma/seed.ts` creates an idempotent development dataset.

## Users

- `admin@pulsarr.space` with role `ADMIN`
- `user@pulsarr.space` with no active subscription
- `active@pulsarr.space` with active subscription, Telegram identity, LTE add-on, referral access, support conversation, and pending payout
- `expired@pulsarr.space` with expired subscription

All users log in through Email OTP. There are no passwords.

## Pricing

- Base monthly price: 119 RUB
- Extra device monthly price: 15 RUB
- Device range: 1-5
- LTE add-on: 50 RUB/month
- Duration discounts: 1 month 0%, 3 months 10%, 6 months 15%, 12 months 30%
- Friend referral discount: 50%
- Referral reward: 75 RUB
- Minimal payout: 150 RUB

## Product Data

- Active and expired subscriptions
- Regular/LTE/Gaming nodes
- Legal documents: terms, privacy, offer
- Support conversation with user/admin messages
- Referral profile, invite, reward, and payout request
- Wallet ledger entries for referral reward and payout reserve
- Integration and audit log examples

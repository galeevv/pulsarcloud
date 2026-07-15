# Business rules

- Server pricing is authoritative. Current seeded prices are 119 ₽ base/month, 15 ₽ per extra device/month, 50 ₽ LTE/month, and 0/10/15/30% discounts for 1/3/6/12 months. Increasing the device limit of an already active subscription is a separate one-time purchase at 50 ₽ per added slot.
- A confirmed payment adds 30/90/180/365 days from `max(now, expiresAt)`. Its price snapshot never changes.
- A user has one canonical subscription. Expiration is computed when rendering and the record is retained.
- Device/LTE changes selected during a paid renewal apply immediately through the same canonical Remnawave user, so the subscription URL stays unchanged. A separate device-limit upgrade also applies immediately, never extends the term, and cannot raise the limit above five. Admin changes are immediate and audited.
- A valid enabled referral gives a new account one three-day trial with LTE. The inviter receives 75 ₽ only after the invited user's first confirmed payment; the former 50% friend discount is disabled.
- A wallet is a projection of immutable ledger deltas. Creating a payout moves available to reserved; reject returns it; paid removes reserved only.
- Refund status is recorded. Referral reversal/subscription correction that cannot be performed safely requires manual review; it is never silently applied.

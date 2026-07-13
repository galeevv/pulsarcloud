# Business rules

- Server pricing is authoritative. Current seeded prices preserve the frontend: 119 ₽ base/month, 50 ₽ per extra device/month, 50 ₽ LTE/month, and 0/10/15/20% discounts for 1/3/6/12 months.
- A confirmed payment adds 30/90/180/365 days from `max(now, expiresAt)`. Its price snapshot never changes.
- A user has one canonical subscription. Expiration is computed when rendering and the record is retained.
- Device/LTE changes selected during a paid renewal are stored as `next*` parameters with the old expiry as their boundary. The paid term is appended immediately, but the worker applies and provisions the new parameters only when that boundary is reached. Further queued renewals must use the already staged plan. There is no free in-period upgrade. Admin changes are immediate and audited.
- A valid enabled referral gives a new account one three-day trial. The inviter receives 75 ₽ only after the invited user's first confirmed payment.
- A wallet is a projection of immutable ledger deltas. Creating a payout moves available to reserved; reject returns it; paid removes reserved only.
- Refund status is recorded. Referral reversal/subscription correction that cannot be performed safely requires manual review; it is never silently applied.

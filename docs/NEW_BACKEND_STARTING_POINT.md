# New backend starting point

This document records the frontend surface the future backend must support. It
does not prescribe the new backend architecture or business rules.

| Page | Data expected by the UI | User actions / future command |
| --- | --- | --- |
| `/` | auth error, optional invite code | request email access, verify code, start Telegram login |
| `/auth/verify` | verification failure state | return to login |
| `/home` | subscription summary and pricing display model | open checkout, open VPN setup |
| `/subscription` | status, dates, progress display, URL, devices, LTE, friendly error | checkout, change device limit, regenerate/copy link, open client setup |
| `/referrals` | balance, invite URL, invite metrics/history, payout history, pricing display limits | copy invite, open checkout, request payout |
| `/profile` | email and Telegram identity display | link identity, logout, open support/legal |
| `/support` | ordered message list with author, body and display time | send message |
| `/legal` | agreement, offer and privacy Markdown | switch document tab |
| `/admin` | aggregate display metrics | none |
| Admin lists | users, subscriptions, payments, wallet, referrals, payouts, conversations, nodes, integration events, settings | future admin mutations shown by existing forms |

## View models to preserve

- `PreviewSubscription`: status, start/end dates, device limit, LTE flag,
  subscription URL and friendly/technical display states.
- `PreviewPricing`: device bounds, display amounts, referral/payout display
  values and duration options.
- Identity display: provider and provider subject.
- Support message: id, author role, body and formatted creation time.
- Referral/payout list items: id, display labels, status and amount/date labels.

The stable frontend props are documented by
`src/frontend-preview/view-models.ts` and the component props that consume them.
They are UI contracts, not database entities.

## Current preview replacements

- `mock-user.ts`: profile and account display.
- `mock-subscription.ts`: home/subscription state.
- `mock-pricing.ts`: read-only checkout and settings display options.
- `mock-referrals.ts`: referral metrics/history and payouts.
- `mock-support.ts`: support thread display.
- `mock-admin.ts`: all admin tables and metrics.
- `PreviewForm`: local no-write replacement for every former mutation.

When the new backend is connected, replace fixtures at page boundaries with
validated view models and replace preview handlers with explicit application
commands. Do not reuse the archived database schema or service implementation
implicitly.

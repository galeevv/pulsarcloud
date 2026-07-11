import { previewUserIdentities } from "@/src/frontend-preview/fixtures/mock-user"

export const previewReferralProfile = {
  userId: "preview-user",
  inviteCode: "PULSAR-PREVIEW",
  isEnabled: true,
}

export const previewReferralInvites = [
  {
    id: "preview-invite-1",
    invitedUserId: "preview-friend-1",
    status: "CONVERTED",
    createdAt: new Date("2026-07-10T12:00:00.000Z"),
    invited: {
      authIdentities: [
        { provider: "EMAIL", providerSubject: "friend@pulsar.local" },
      ],
    },
  },
]

export const previewPayouts = [
  {
    id: "preview-payout-1",
    amountRub: 150,
    payoutDetails: "Preview only",
    status: "PAID",
    createdAt: new Date("2026-07-11T12:00:00.000Z"),
    user: { authIdentities: previewUserIdentities },
  },
]

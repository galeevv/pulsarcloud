import { previewReferralInvites, previewPayouts } from "./mock-referrals"
import { previewSubscription } from "./mock-subscription"
import { previewUser, previewUserIdentities } from "./mock-user"

const previewAdminUser = {
  ...previewUser,
  authIdentities: previewUserIdentities,
}

export const previewAdminMetrics = {
  users: 1,
  activeSubscriptions: 1,
  pendingPayments: 0,
  pendingPayouts: 0,
  turnoverRub: 119,
}

export const previewAdminUsers = [
  {
    ...previewAdminUser,
    subscription: previewSubscription,
  },
]

export const previewAdminSubscriptions = [
  { ...previewSubscription, user: previewAdminUser },
]

export const previewAdminPayments = [
  {
    id: "preview-payment",
    amountRub: 119,
    status: "PREVIEW",
    provider: "NOT_CONNECTED",
    durationMonths: 1,
    deviceLimit: 3,
    lteEnabled: false,
    createdAt: new Date("2026-07-12T09:00:00.000Z"),
    user: previewAdminUser,
  },
]

export const previewAdminWalletEntries = [
  {
    id: "preview-ledger",
    direction: "CREDIT",
    amountRub: 119,
    type: "PREVIEW",
    status: "DISPLAY_ONLY",
    createdAt: new Date("2026-07-12T09:00:00.000Z"),
    user: previewAdminUser,
  },
]

export const previewAdminReferralProfiles = [
  {
    userId: previewUser.id,
    inviteCode: "PULSAR-PREVIEW",
    isEnabled: true,
    user: previewAdminUser,
  },
]

export const previewAdminReferralInvites = previewReferralInvites.map(
  (invite) => ({
    ...invite,
    inviter: previewAdminUser,
  })
)

export const previewAdminReferralRewards = [
  {
    id: "preview-reward",
    invitedUserId: "preview-friend-1",
    amountRub: 75,
    status: "DISPLAY_ONLY",
  },
]

export const previewAdminPayouts = previewPayouts

export const previewAdminConversations = [
  {
    id: "preview-conversation",
    status: "OPEN",
    user: previewAdminUser,
    messages: [
      {
        id: "preview-admin-message",
        authorRole: "USER",
        body: "Это демонстрация интерфейса обращения.",
      },
    ],
  },
]

export const previewAdminNodes = [
  {
    id: "preview-node",
    name: "Preview node",
    country: "—",
    city: "Backend not connected",
    type: "PREVIEW",
    protocol: "—",
    status: "NOT_CONNECTED",
    capacity: 0,
  },
]

export const previewAdminIntegrationLogs = [
  {
    id: "preview-integration-log",
    eventType: "frontend.preview",
    entityType: "Backend",
    createdAt: new Date("2026-07-12T09:00:00.000Z"),
  },
]

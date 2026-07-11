import type { PreviewSubscription } from "@/src/frontend-preview/view-models"

export const previewSubscription: PreviewSubscription = {
  createdAt: new Date("2026-07-12T09:00:00.000Z"),
  deviceLimit: 3,
  expiresAt: new Date("2027-08-15T23:59:59.000Z"),
  id: "preview-subscription",
  lastTechnicalError: null,
  lastUserFriendlyError: null,
  lteEnabled: false,
  startsAt: new Date("2026-07-12T09:00:00.000Z"),
  status: "ACTIVE",
  subscriptionUrl: "https://preview.invalid/subscription/pulsar-demo",
  syncStatus: "NOT_CONNECTED",
}

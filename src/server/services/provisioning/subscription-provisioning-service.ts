import {
  IntegrationLogStatus,
  IntegrationProvider,
  SubscriptionFeatureType,
  SubscriptionSyncStatus,
} from "@prisma/client"

import { prisma } from "@/lib/db"
import { createRemnawaveClient, type RemnawaveClient } from "@/src/server/services/remnawave/client"

const USER_FRIENDLY_SYNC_ERROR =
  "Не удалось обновить подписку. Мы уже проверяем проблему."

export class SubscriptionProvisioningService {
  constructor(private readonly remnawaveClient: RemnawaveClient) {}

  async provisionSubscription(subscriptionId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { user: true },
    })

    if (!subscription) {
      throw new Error("Subscription not found")
    }

    try {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { syncStatus: SubscriptionSyncStatus.PENDING },
      })

      const result = await this.remnawaveClient.createOrUpdateUser({
        userId: subscription.userId,
        email: subscription.user.email,
        deviceLimit: subscription.deviceLimit,
        lteEnabled: subscription.lteEnabled,
      })

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          remnawaveUserId: result.remnawaveUserId,
          subscriptionUrl: result.subscriptionUrl,
          syncStatus: SubscriptionSyncStatus.SYNCED,
          lastUserFriendlyError: null,
          lastTechnicalError: null,
        },
      })

      await this.log("provisionSubscription", IntegrationLogStatus.SUCCESS, {
        subscriptionId,
      })
    } catch (error) {
      await this.markFailed(subscription.id, error)
      throw error
    }
  }

  async regenerateSubscriptionUrl(subscriptionId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    })

    if (!subscription?.remnawaveUserId) {
      throw new Error("Subscription is not provisioned")
    }

    try {
      const result = await this.remnawaveClient.regenerateSubscriptionUrl(
        subscription.remnawaveUserId
      )

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          subscriptionUrl: result.subscriptionUrl,
          syncStatus: SubscriptionSyncStatus.SYNCED,
          lastUserFriendlyError: null,
          lastTechnicalError: null,
        },
      })

      await this.log("regenerateSubscriptionUrl", IntegrationLogStatus.SUCCESS, {
        subscriptionId,
      })
    } catch (error) {
      await this.markFailed(subscription.id, error)
      throw error
    }
  }

  async updateDeviceLimit(subscriptionId: string, deviceLimit: number) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    })

    if (!subscription?.remnawaveUserId) {
      throw new Error("Subscription is not provisioned")
    }

    try {
      await this.remnawaveClient.updateDeviceLimit(
        subscription.remnawaveUserId,
        deviceLimit
      )

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          deviceLimit,
          syncStatus: SubscriptionSyncStatus.SYNCED,
          lastUserFriendlyError: null,
          lastTechnicalError: null,
        },
      })

      await this.log("updateDeviceLimit", IntegrationLogStatus.SUCCESS, {
        subscriptionId,
        deviceLimit,
      })
    } catch (error) {
      await this.markFailed(subscription.id, error)
      throw error
    }
  }

  async setLte(subscriptionId: string, enabled: boolean) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    })

    if (!subscription?.remnawaveUserId) {
      throw new Error("Subscription is not provisioned")
    }

    try {
      if (enabled) {
        await this.remnawaveClient.enableLte(subscription.remnawaveUserId)
      } else {
        await this.remnawaveClient.disableLte(subscription.remnawaveUserId)
      }

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          lteEnabled: enabled,
          syncStatus: SubscriptionSyncStatus.SYNCED,
          lastUserFriendlyError: null,
          lastTechnicalError: null,
          features: enabled
            ? {
                upsert: {
                  where: {
                    subscriptionId_type: {
                      subscriptionId,
                      type: SubscriptionFeatureType.LTE_ACCESS,
                    },
                  },
                  update: { enabled: true },
                  create: {
                    type: SubscriptionFeatureType.LTE_ACCESS,
                    label: "LTE add-on",
                    enabled: true,
                  },
                },
              }
            : {
                updateMany: {
                  where: { type: SubscriptionFeatureType.LTE_ACCESS },
                  data: { enabled: false },
                },
              },
        },
      })

      await this.log("setLte", IntegrationLogStatus.SUCCESS, {
        subscriptionId,
        enabled,
      })
    } catch (error) {
      await this.markFailed(subscription.id, error)
      throw error
    }
  }

  async syncSubscription(subscriptionId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { user: true },
    })

    if (!subscription) {
      throw new Error("Subscription not found")
    }

    try {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { syncStatus: SubscriptionSyncStatus.PENDING },
      })

      const result = await this.remnawaveClient.syncSubscription({
        userId: subscription.userId,
        email: subscription.user.email,
        deviceLimit: subscription.deviceLimit,
        lteEnabled: subscription.lteEnabled,
        remnawaveUserId: subscription.remnawaveUserId,
      })

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          remnawaveUserId: result.remnawaveUserId,
          subscriptionUrl: result.subscriptionUrl,
          syncStatus: SubscriptionSyncStatus.SYNCED,
          lastUserFriendlyError: null,
          lastTechnicalError: null,
        },
      })

      await this.log("syncSubscription", IntegrationLogStatus.SUCCESS, {
        subscriptionId,
      })
    } catch (error) {
      await this.markFailed(subscription.id, error)
      throw error
    }
  }

  private async markFailed(subscriptionId: string, error: unknown) {
    const technicalError =
      error instanceof Error ? error.message : "Unknown provisioning error"

    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        syncStatus: SubscriptionSyncStatus.FAILED,
        lastUserFriendlyError: USER_FRIENDLY_SYNC_ERROR,
        lastTechnicalError: technicalError,
      },
    })

    await this.log(
      "provisioningFailed",
      IntegrationLogStatus.FAILED,
      { subscriptionId },
      technicalError
    )
  }

  private async log(
    action: string,
    status: IntegrationLogStatus,
    requestPayload: object,
    error?: string
  ) {
    await prisma.integrationLog.create({
      data: {
        provider: IntegrationProvider.REMNAWAVE,
        action,
        status,
        requestPayload,
        error,
      },
    })
  }
}

export function createSubscriptionProvisioningService() {
  return new SubscriptionProvisioningService(createRemnawaveClient())
}

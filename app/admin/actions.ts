"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { NodeProtocol, NodeStatus, NodeType, SupportConversationStatus } from "@prisma/client"

import { requireAdmin } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { confirmMockPayment } from "@/src/server/services/billing/payment-service"
import { createSubscriptionProvisioningService } from "@/src/server/services/provisioning/subscription-provisioning-service"
import {
  approvePayoutRequest,
  markPayoutRequestPaid,
  rejectPayoutRequest,
} from "@/src/server/services/wallet/payout-service"

export async function confirmPaymentAction(formData: FormData) {
  const admin = await requireAdmin()
  const paymentId = z.string().min(1).parse(formData.get("paymentId"))

  await confirmMockPayment(paymentId, admin.id)
  revalidatePath("/admin/payments")
  revalidatePath("/admin/subscriptions")
}

export async function extendSubscriptionAction(formData: FormData) {
  const admin = await requireAdmin()
  const subscriptionId = z.string().min(1).parse(formData.get("subscriptionId"))
  const months = z.coerce.number().int().min(1).max(24).parse(
    formData.get("months")
  )
  const subscription = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
  })
  const baseDate =
    subscription.expiresAt && subscription.expiresAt > new Date()
      ? subscription.expiresAt
      : new Date()
  const expiresAt = new Date(baseDate)
  expiresAt.setMonth(expiresAt.getMonth() + months)

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: "ACTIVE",
      startsAt: subscription.startsAt ?? new Date(),
      expiresAt,
    },
  })
  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "subscription.extend",
      entityType: "Subscription",
      entityId: subscriptionId,
      metadata: { months },
    },
  })
  revalidatePath("/admin/subscriptions")
}

export async function changeSubscriptionDeviceLimitAction(formData: FormData) {
  const admin = await requireAdmin()
  const subscriptionId = z.string().min(1).parse(formData.get("subscriptionId"))
  const deviceLimit = z.coerce.number().int().min(1).max(10).parse(
    formData.get("deviceLimit")
  )

  await createSubscriptionProvisioningService().updateDeviceLimit(
    subscriptionId,
    deviceLimit
  )
  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "subscription.deviceLimit",
      entityType: "Subscription",
      entityId: subscriptionId,
      metadata: { deviceLimit },
    },
  })
  revalidatePath("/admin/subscriptions")
}

export async function toggleSubscriptionLteAction(formData: FormData) {
  const admin = await requireAdmin()
  const subscriptionId = z.string().min(1).parse(formData.get("subscriptionId"))
  const enabled = formData.get("enabled") === "true"

  await createSubscriptionProvisioningService().setLte(subscriptionId, enabled)
  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "subscription.lte",
      entityType: "Subscription",
      entityId: subscriptionId,
      metadata: { enabled },
    },
  })
  revalidatePath("/admin/subscriptions")
}

export async function regenerateAdminSubscriptionUrlAction(formData: FormData) {
  const admin = await requireAdmin()
  const subscriptionId = z.string().min(1).parse(formData.get("subscriptionId"))

  await createSubscriptionProvisioningService().regenerateSubscriptionUrl(
    subscriptionId
  )
  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "subscription.regenerateUrl",
      entityType: "Subscription",
      entityId: subscriptionId,
    },
  })
  revalidatePath("/admin/subscriptions")
}

export async function syncAdminSubscriptionAction(formData: FormData) {
  const admin = await requireAdmin()
  const subscriptionId = z.string().min(1).parse(formData.get("subscriptionId"))

  await createSubscriptionProvisioningService().syncSubscription(subscriptionId)
  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "subscription.mockSync",
      entityType: "Subscription",
      entityId: subscriptionId,
    },
  })
  revalidatePath("/admin/subscriptions")
}

export async function approvePayoutAction(formData: FormData) {
  const admin = await requireAdmin()
  const payoutId = z.string().min(1).parse(formData.get("payoutId"))
  const adminNote = z.string().max(500).optional().parse(
    formData.get("adminNote") || undefined
  )

  await approvePayoutRequest(payoutId, admin.id, adminNote)
  revalidatePath("/admin/payouts")
}

export async function markPayoutPaidAction(formData: FormData) {
  const admin = await requireAdmin()
  const payoutId = z.string().min(1).parse(formData.get("payoutId"))
  const adminNote = z.string().max(500).optional().parse(
    formData.get("adminNote") || undefined
  )

  await markPayoutRequestPaid(payoutId, admin.id, adminNote)
  revalidatePath("/admin/payouts")
}

export async function rejectPayoutAction(formData: FormData) {
  const admin = await requireAdmin()
  const payoutId = z.string().min(1).parse(formData.get("payoutId"))
  const adminNote = z.string().max(500).optional().parse(
    formData.get("adminNote") || undefined
  )

  await rejectPayoutRequest(payoutId, admin.id, adminNote)
  revalidatePath("/admin/payouts")
}

export async function replySupportConversationAction(formData: FormData) {
  const admin = await requireAdmin()
  const conversationId = z.string().min(1).parse(formData.get("conversationId"))
  const body = z.string().min(2).max(1000).parse(formData.get("body"))

  await prisma.supportMessage.create({
    data: {
      conversationId,
      senderId: admin.id,
      authorRole: "ADMIN",
      body,
    },
  })
  await prisma.supportConversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  })
  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "support.reply",
      entityType: "SupportConversation",
      entityId: conversationId,
    },
  })
  revalidatePath("/admin/support")
}

export async function setSupportConversationStatusAction(formData: FormData) {
  const admin = await requireAdmin()
  const conversationId = z.string().min(1).parse(formData.get("conversationId"))
  const status = z.nativeEnum(SupportConversationStatus).parse(
    formData.get("status")
  )

  await prisma.supportConversation.update({
    where: { id: conversationId },
    data: { status },
  })
  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "support.status",
      entityType: "SupportConversation",
      entityId: conversationId,
      metadata: { status },
    },
  })
  revalidatePath("/admin/support")
}

export async function createNodeAction(formData: FormData) {
  const admin = await requireAdmin()
  const data = z
    .object({
      name: z.string().min(2).max(80),
      country: z.string().min(2).max(80),
      city: z.string().min(2).max(80),
      type: z.nativeEnum(NodeType),
      protocol: z.nativeEnum(NodeProtocol),
      domain: z.string().min(3).max(120),
      status: z.nativeEnum(NodeStatus),
      capacity: z.coerce.number().int().positive(),
      sortOrder: z.coerce.number().int().default(0),
    })
    .parse({
      name: formData.get("name"),
      country: formData.get("country"),
      city: formData.get("city"),
      type: formData.get("type"),
      protocol: formData.get("protocol"),
      domain: formData.get("domain"),
      status: formData.get("status"),
      capacity: formData.get("capacity"),
      sortOrder: formData.get("sortOrder"),
    })

  const node = await prisma.node.create({ data })
  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "node.create",
      entityType: "Node",
      entityId: node.id,
    },
  })
  revalidatePath("/admin/nodes")
}

export async function updatePricingSettingsAction(formData: FormData) {
  const admin = await requireAdmin()
  const data = z
    .object({
      baseMonthlyPriceRub: z.coerce.number().int().positive(),
      extraDeviceMonthlyPriceRub: z.coerce.number().int().min(0),
      lteMonthlyPriceRub: z.coerce.number().int().min(0),
      referralFriendDiscountPct: z.coerce.number().int().min(0).max(100),
      referralRewardRub: z.coerce.number().int().min(0),
      minimalPayoutRub: z.coerce.number().int().positive(),
    })
    .parse({
      baseMonthlyPriceRub: formData.get("baseMonthlyPriceRub"),
      extraDeviceMonthlyPriceRub: formData.get("extraDeviceMonthlyPriceRub"),
      lteMonthlyPriceRub: formData.get("lteMonthlyPriceRub"),
      referralFriendDiscountPct: formData.get("referralFriendDiscountPct"),
      referralRewardRub: formData.get("referralRewardRub"),
      minimalPayoutRub: formData.get("minimalPayoutRub"),
    })

  await prisma.pricingSettings.update({
    where: { id: "default" },
    data,
  })
  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "settings.pricing",
      entityType: "PricingSettings",
      entityId: "default",
    },
  })
  revalidatePath("/admin/settings")
}

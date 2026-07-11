"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  JobType,
  NodeProtocol,
  NodeStatus,
  NodeType,
  SupportConversationStatus,
  type Prisma,
} from "@/generated/prisma/client"

import { requireAdmin } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { runInTransaction } from "@/lib/transactions"
import {
  assertDeviceLimitCoveredByPayment,
  assertLteCoveredByPayment,
} from "@/lib/subscription-billing-policy"
import { confirmMockPayment } from "@/src/server/services/billing/payment-service"
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
  const months = z.coerce
    .number()
    .int()
    .min(1)
    .max(24)
    .parse(formData.get("months"))
  const subscription = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
  })
  const baseDate =
    subscription.expiresAt && subscription.expiresAt > new Date()
      ? subscription.expiresAt
      : new Date()
  const expiresAt = new Date(baseDate)
  expiresAt.setMonth(expiresAt.getMonth() + months)

  await runInTransaction(prisma, async (tx) => {
    const updated = await tx.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: "ACTIVE",
        startsAt: subscription.startsAt ?? new Date(),
        expiresAt,
        syncStatus: "PENDING",
        version: { increment: 1 },
      },
    })
    await enqueueSubscriptionSync(tx, updated.id, updated.version, "extend")
    await auditInTransaction(
      tx,
      admin.id,
      "subscription.extend",
      "Subscription",
      subscriptionId,
      { months }
    )
  })
  revalidatePath("/admin/subscriptions")
}

export async function changeSubscriptionDeviceLimitAction(formData: FormData) {
  const admin = await requireAdmin()
  const subscriptionId = z.string().min(1).parse(formData.get("subscriptionId"))
  const deviceLimit = z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .parse(formData.get("deviceLimit"))

  const subscription = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    include: { periods: { orderBy: { createdAt: "desc" }, take: 1 } },
  })
  assertDeviceLimitCoveredByPayment(
    subscription.deviceLimit,
    deviceLimit,
    subscription.periods[0]
  )

  await runInTransaction(prisma, async (tx) => {
    const updated = await tx.subscription.update({
      where: { id: subscriptionId },
      data: {
        deviceLimit,
        syncStatus: "PENDING",
        version: { increment: 1 },
      },
    })
    await enqueueSubscriptionSync(
      tx,
      updated.id,
      updated.version,
      "device-limit"
    )
    await auditInTransaction(
      tx,
      admin.id,
      "subscription.deviceLimit",
      "Subscription",
      subscriptionId,
      { deviceLimit }
    )
  })
  revalidatePath("/admin/subscriptions")
}

export async function toggleSubscriptionLteAction(formData: FormData) {
  const admin = await requireAdmin()
  const subscriptionId = z.string().min(1).parse(formData.get("subscriptionId"))
  const enabled = formData.get("enabled") === "true"

  const subscription = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    include: { periods: { orderBy: { createdAt: "desc" }, take: 1 } },
  })
  assertLteCoveredByPayment(
    subscription.lteEnabled,
    enabled,
    subscription.periods[0]
  )

  await runInTransaction(prisma, async (tx) => {
    const updated = await tx.subscription.update({
      where: { id: subscriptionId },
      data: {
        lteEnabled: enabled,
        syncStatus: "PENDING",
        version: { increment: 1 },
      },
    })
    await enqueueSubscriptionSync(tx, updated.id, updated.version, "lte")
    await auditInTransaction(
      tx,
      admin.id,
      "subscription.lte",
      "Subscription",
      subscriptionId,
      { enabled }
    )
  })
  revalidatePath("/admin/subscriptions")
}

export async function regenerateAdminSubscriptionUrlAction(formData: FormData) {
  const admin = await requireAdmin()
  const subscriptionId = z.string().min(1).parse(formData.get("subscriptionId"))

  await runInTransaction(prisma, async (tx) => {
    await tx.job.upsert({
      where: {
        idempotencyKey: `subscription:${subscriptionId}:regenerate-url`,
      },
      update: {
        status: "PENDING",
        runAt: new Date(),
        attemptCount: 0,
        lockedAt: null,
        lockedBy: null,
        completedAt: null,
        lastError: null,
      },
      create: {
        type: JobType.REGENERATE_SUBSCRIPTION_URL,
        idempotencyKey: `subscription:${subscriptionId}:regenerate-url`,
        payload: { subscriptionId },
      },
    })
    await auditInTransaction(
      tx,
      admin.id,
      "subscription.regenerateUrl",
      "Subscription",
      subscriptionId
    )
  })
  revalidatePath("/admin/subscriptions")
}

export async function syncAdminSubscriptionAction(formData: FormData) {
  const admin = await requireAdmin()
  const subscriptionId = z.string().min(1).parse(formData.get("subscriptionId"))

  await runInTransaction(prisma, async (tx) => {
    const subscription = await tx.subscription.update({
      where: { id: subscriptionId },
      data: { syncStatus: "PENDING", version: { increment: 1 } },
    })
    await enqueueSubscriptionSync(
      tx,
      subscription.id,
      subscription.version,
      "manual"
    )
    await auditInTransaction(
      tx,
      admin.id,
      "subscription.sync_requested",
      "Subscription",
      subscriptionId
    )
  })
  revalidatePath("/admin/subscriptions")
}

export async function approvePayoutAction(formData: FormData) {
  const admin = await requireAdmin()
  const payoutId = z.string().min(1).parse(formData.get("payoutId"))
  const adminNote = z
    .string()
    .max(500)
    .optional()
    .parse(formData.get("adminNote") || undefined)

  await approvePayoutRequest(payoutId, admin.id, adminNote)
  revalidatePath("/admin/payouts")
}

export async function markPayoutPaidAction(formData: FormData) {
  const admin = await requireAdmin()
  const payoutId = z.string().min(1).parse(formData.get("payoutId"))
  const adminNote = z
    .string()
    .max(500)
    .optional()
    .parse(formData.get("adminNote") || undefined)

  await markPayoutRequestPaid(payoutId, admin.id, adminNote)
  revalidatePath("/admin/payouts")
}

export async function rejectPayoutAction(formData: FormData) {
  const admin = await requireAdmin()
  const payoutId = z.string().min(1).parse(formData.get("payoutId"))
  const adminNote = z
    .string()
    .max(500)
    .optional()
    .parse(formData.get("adminNote") || undefined)

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
  await audit(admin.id, "support.reply", "SupportConversation", conversationId)
  revalidatePath("/admin/support")
}

export async function setSupportConversationStatusAction(formData: FormData) {
  const admin = await requireAdmin()
  const conversationId = z.string().min(1).parse(formData.get("conversationId"))
  const status = z
    .nativeEnum(SupportConversationStatus)
    .parse(formData.get("status"))

  await prisma.supportConversation.update({
    where: { id: conversationId },
    data: { status },
  })
  await audit(
    admin.id,
    "support.status",
    "SupportConversation",
    conversationId,
    { status }
  )
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
  await audit(admin.id, "node.create", "Node", node.id)
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
      minDeviceLimit: z.coerce.number().int().min(1).max(20),
      maxDeviceLimit: z.coerce.number().int().min(1).max(20),
      discount1: z.coerce.number().int().min(0).max(100),
      discount3: z.coerce.number().int().min(0).max(100),
      discount6: z.coerce.number().int().min(0).max(100),
      discount12: z.coerce.number().int().min(0).max(100),
    })
    .parse({
      baseMonthlyPriceRub: formData.get("baseMonthlyPriceRub"),
      extraDeviceMonthlyPriceRub: formData.get("extraDeviceMonthlyPriceRub"),
      lteMonthlyPriceRub: formData.get("lteMonthlyPriceRub"),
      referralFriendDiscountPct: formData.get("referralFriendDiscountPct"),
      referralRewardRub: formData.get("referralRewardRub"),
      minimalPayoutRub: formData.get("minimalPayoutRub"),
      minDeviceLimit: formData.get("minDeviceLimit"),
      maxDeviceLimit: formData.get("maxDeviceLimit"),
      discount1: formData.get("discount1"),
      discount3: formData.get("discount3"),
      discount6: formData.get("discount6"),
      discount12: formData.get("discount12"),
    })

  const pricing = await runInTransaction(prisma, async (tx) => {
    const current = await tx.pricingVersion.findFirstOrThrow({
      where: { status: "ACTIVE" },
      orderBy: { version: "desc" },
    })
    await tx.pricingVersion.update({
      where: { id: current.id },
      data: { status: "RETIRED", retiredAt: new Date() },
    })
    if (data.minDeviceLimit > data.maxDeviceLimit) {
      throw new Error("Minimum device limit cannot exceed maximum.")
    }
    const { discount1, discount3, discount6, discount12, ...pricingData } = data
    return tx.pricingVersion.create({
      data: {
        ...pricingData,
        version: current.version + 1,
        status: "ACTIVE",
        effectiveAt: new Date(),
        durationDiscounts: [
          { months: 1, discountPct: discount1 },
          { months: 3, discountPct: discount3 },
          { months: 6, discountPct: discount6 },
          { months: 12, discountPct: discount12 },
        ],
      },
    })
  })
  await audit(admin.id, "settings.pricing", "PricingVersion", pricing.id)
  revalidatePath("/admin/settings")
}

function enqueueSubscriptionSync(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
  version: number,
  reason: string
) {
  return tx.job.create({
    data: {
      type: JobType.SYNC_SUBSCRIPTION,
      idempotencyKey: `subscription:${subscriptionId}:version:${version}`,
      payload: { subscriptionId, version, reason },
    },
  })
}

function auditInTransaction(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  eventType: string,
  entityType: string,
  entityId?: string,
  data?: object
) {
  return tx.auditEvent.create({
    data: { actorUserId, eventType, entityType, entityId, data },
  })
}

function audit(
  actorUserId: string,
  eventType: string,
  entityType: string,
  entityId?: string,
  data?: object
) {
  return prisma.auditEvent.create({
    data: { actorUserId, eventType, entityType, entityId, data },
  })
}

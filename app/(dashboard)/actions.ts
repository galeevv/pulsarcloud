"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { clearCurrentSession, requireUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createMockPayment } from "@/src/server/services/billing/payment-service"
import { createSubscriptionProvisioningService } from "@/src/server/services/provisioning/subscription-provisioning-service"
import { createPayoutRequest } from "@/src/server/services/wallet/payout-service"

const paymentSchema = z.object({
  months: z.coerce.number().int().refine((value) => [1, 3, 6, 12].includes(value)),
  deviceLimit: z.coerce.number().int().min(1).max(5),
  lteEnabled: z.coerce.boolean().default(false),
})

export async function createPaymentAction(formData: FormData) {
  const user = await requireUser()
  const parsed = paymentSchema.safeParse({
    months: formData.get("months"),
    deviceLimit: formData.get("deviceLimit"),
    lteEnabled: formData.get("lteEnabled") === "on",
  })

  if (!parsed.success) {
    redirect("/subscription?error=payment")
  }

  await createMockPayment({
    userId: user.id,
    ...parsed.data,
  })

  redirect("/subscription?payment=pending")
}

export async function regenerateSubscriptionUrlAction() {
  const user = await requireUser()
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId: user.id,
    },
    orderBy: { createdAt: "desc" },
  })

  if (!subscription) {
    redirect("/subscription")
  }

  await createSubscriptionProvisioningService().regenerateSubscriptionUrl(
    subscription.id
  )
  revalidatePath("/subscription")
}

export async function changeOwnDeviceLimitAction(formData: FormData) {
  const user = await requireUser()
  const deviceLimit = z.coerce.number().int().min(1).max(5).parse(
    formData.get("deviceLimit")
  )
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId: user.id,
    },
    orderBy: { createdAt: "desc" },
  })

  if (!subscription) {
    redirect("/subscription")
  }

  await prisma.deviceLimitChange.create({
    data: {
      subscriptionId: subscription.id,
      fromLimit: subscription.deviceLimit,
      toLimit: deviceLimit,
      actorUserId: user.id,
    },
  })
  await createSubscriptionProvisioningService().updateDeviceLimit(
    subscription.id,
    deviceLimit
  )
  revalidatePath("/subscription")
}

export async function createPayoutRequestAction(formData: FormData) {
  const user = await requireUser()
  const amountRub = z.coerce.number().int().positive().parse(
    formData.get("amountRub")
  )
  const payoutDetails = z.string().min(5).max(500).parse(
    formData.get("payoutDetails")
  )

  await createPayoutRequest(user.id, amountRub, payoutDetails)
  revalidatePath("/referrals")
}

export async function createSupportMessageAction(formData: FormData) {
  const user = await requireUser()
  const body = z.string().min(2).max(1000).parse(formData.get("body"))
  const conversation =
    (await prisma.supportConversation.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    })) ??
    (await prisma.supportConversation.create({
      data: {
        userId: user.id,
        subject: "Чат поддержки",
      },
    }))

  await prisma.supportMessage.create({
    data: {
      conversationId: conversation.id,
      senderId: user.id,
      authorRole: "USER",
      body,
    },
  })
  await prisma.supportConversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
    },
  })
  revalidatePath("/support")
}

export async function logoutAction() {
  await clearCurrentSession()
  redirect("/")
}

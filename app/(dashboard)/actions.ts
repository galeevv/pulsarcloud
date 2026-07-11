"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { clearCurrentSession, requireUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { runInTransaction } from "@/lib/transactions"
import { assertDeviceLimitCoveredByPayment } from "@/lib/subscription-billing-policy"
import { createSubscriptionPayment } from "@/src/server/services/billing/payment-service"
import { createSubscriptionProvisioningService } from "@/src/server/services/provisioning/subscription-provisioning-service"
import { createPayoutRequest } from "@/src/server/services/wallet/payout-service"

const paymentSchema = z.object({
  months: z.coerce
    .number()
    .int()
    .refine((value) => [1, 3, 6, 12].includes(value)),
  deviceLimit: z.coerce.number().int().min(1).max(5),
  lteEnabled: z.coerce.boolean().default(false),
  idempotencyKey: z.string().uuid(),
})

export type SupportMessageState = {
  ok: boolean
  message?: string
  resetKey?: number
}

const supportMessageSchema = z
  .string()
  .trim()
  .min(2, "Напишите сообщение от 2 символов.")
  .max(1000, "Сообщение не должно быть длиннее 1000 символов.")

export async function createPaymentAction(formData: FormData) {
  const user = await requireUser()
  const parsed = paymentSchema.safeParse({
    months: formData.get("months"),
    deviceLimit: formData.get("deviceLimit"),
    lteEnabled: formData.get("lteEnabled") === "on",
    idempotencyKey: formData.get("idempotencyKey"),
  })

  if (!parsed.success) {
    redirect("/subscription?error=payment")
  }

  const payment = await createSubscriptionPayment({
    userId: user.id,
    ...parsed.data,
  })

  if (payment.checkoutUrl?.startsWith("https://")) {
    redirect(payment.checkoutUrl)
  }
  redirect("/subscription?payment=pending")
}

export async function regenerateSubscriptionUrlAction() {
  const user = await requireUser()
  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.id },
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
  const parsedDeviceLimit = z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .safeParse(formData.get("deviceLimit"))

  if (!parsedDeviceLimit.success) {
    redirect("/subscription?error=device-limit")
  }

  const deviceLimit = parsedDeviceLimit.data
  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.id },
    include: { periods: { orderBy: { createdAt: "desc" }, take: 1 } },
  })

  if (!subscription) {
    redirect("/subscription")
  }

  try {
    assertDeviceLimitCoveredByPayment(
      subscription.deviceLimit,
      deviceLimit,
      subscription.periods[0]
    )
  } catch {
    redirect("/subscription?error=billing-required")
  }

  await createSubscriptionProvisioningService().updateDeviceLimit(
    subscription.id,
    deviceLimit
  )
  await prisma.auditEvent.create({
    data: {
      actorUserId: user.id,
      eventType: "subscription.device_limit_changed",
      entityType: "Subscription",
      entityId: subscription.id,
      data: { fromLimit: subscription.deviceLimit, toLimit: deviceLimit },
    },
  })
  revalidatePath("/subscription")
}

export async function createPayoutRequestAction(formData: FormData) {
  const user = await requireUser()
  const amountRub = z.coerce
    .number()
    .int()
    .positive()
    .parse(formData.get("amountRub"))
  const payoutDetails = z
    .string()
    .min(5)
    .max(500)
    .parse(formData.get("payoutDetails"))
  const idempotencyKey = z.string().uuid().parse(formData.get("idempotencyKey"))

  await createPayoutRequest(user.id, amountRub, payoutDetails, idempotencyKey)
  revalidatePath("/referrals")
}

export async function createSupportMessageAction(
  _state: SupportMessageState,
  formData: FormData
): Promise<SupportMessageState> {
  void _state

  const user = await requireUser()
  const parsedBody = supportMessageSchema.safeParse(formData.get("body"))

  if (!parsedBody.success) {
    return {
      ok: false,
      message:
        parsedBody.error.issues[0]?.message ??
        "Не удалось отправить сообщение.",
    }
  }

  const body = parsedBody.data
  await runInTransaction(prisma, async (tx) => {
    const conversation =
      (await tx.supportConversation.findFirst({
        where: { userId: user.id, status: "OPEN" },
      })) ??
      (await tx.supportConversation.create({
        data: { userId: user.id, subject: "Чат поддержки" },
      }))

    const now = new Date()
    await tx.supportMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: user.id,
        authorRole: "USER",
        body,
      },
    })
    await tx.supportConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: now },
    })
  })
  revalidatePath("/support")

  return {
    ok: true,
    message: "Сообщение отправлено.",
    resetKey: Date.now(),
  }
}

export async function logoutAction() {
  await clearCurrentSession()
  redirect("/")
}

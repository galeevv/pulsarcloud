"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { BusinessError, toFriendlyError } from "@/src/server/application/errors"
import { getConfig } from "@/src/server/config"
import { transitionPayout } from "@/src/server/domain/wallet/service"
import { db } from "@/src/server/infrastructure/db/client"
import { correlationId } from "@/src/server/infrastructure/security/crypto"
import { requireWebSession } from "@/src/server/transport/web/session"

const payoutTransitionSchema = z.object({
  payoutId: z.string().min(8).max(100),
  action: z.enum(["APPROVE", "REJECT", "PAID"]),
  comment: z.string().trim().min(5).max(500),
})

export type PayoutTransitionInput = z.input<typeof payoutTransitionSchema>

export type PayoutTransitionResult = {
  ok: boolean
  message: string
}

const successMessages = {
  APPROVE: "Заявка одобрена.",
  REJECT: "Заявка отклонена, средства возвращены на баланс.",
  PAID: "Выплата отмечена как выполненная.",
} as const

export async function transitionAdminPayout(
  input: PayoutTransitionInput
): Promise<PayoutTransitionResult> {
  const parsed = payoutTransitionSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      message: "Проверьте комментарий и выбранное действие.",
    }

  try {
    const session = await requireWebSession("ADMIN")
    const testMode = getConfig().testMode
    if (session.user.role !== "ADMIN" || session.user.isTest !== testMode)
      throw new BusinessError("ADMIN_FORBIDDEN", 403)

    const payout = await db.payoutRequest.findFirst({
      where: {
        id: parsed.data.payoutId,
        user: {
          is: {
            role: "USER",
            isTest: testMode,
          },
        },
      },
      select: { id: true },
    })
    if (!payout) throw new BusinessError("NOT_FOUND", 404)

    await transitionPayout({
      payoutId: payout.id,
      adminUserId: session.userId,
      action: parsed.data.action,
      reason: parsed.data.comment,
      correlationId: correlationId(),
    })

    revalidatePath("/admin/dashboard")
    revalidatePath("/admin/payouts")
    revalidatePath(`/admin/payouts/${payout.id}`)
    return {
      ok: true,
      message: successMessages[parsed.data.action],
    }
  } catch (error) {
    const friendly = toFriendlyError(error)
    return {
      ok: false,
      message: friendly.message,
    }
  }
}

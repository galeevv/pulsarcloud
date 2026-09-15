"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { BusinessError, toFriendlyError } from "@/src/server/application/errors"
import { db } from "@/src/server/infrastructure/db/client"
import { encryptSensitive } from "@/src/server/infrastructure/security/crypto"
import { requireWebSession } from "@/src/server/transport/web/session"

const payoutSchema = z.object({
  amountRub: z.coerce.number().int().positive().max(100_000),
  recipient: z.string().trim().min(5).max(100),
  bank: z.enum(["Сбербанк", "Альфа-Банк", "Тиньков", "Ozon Банк"]),
  idempotencyKey: z.uuid(),
})

export type PartnerPayoutActionState = {
  status: "idle" | "success" | "error"
  message: string
}

export async function createPartnerPayout(
  _previousState: PartnerPayoutActionState,
  formData: FormData
): Promise<PartnerPayoutActionState> {
  const session = await requireWebSession("USER")
  const parsed = payoutSchema.safeParse({
    amountRub: formData.get("amountRub"),
    recipient: formData.get("recipient"),
    bank: formData.get("bank"),
    idempotencyKey: formData.get("idempotencyKey"),
  })
  if (!parsed.success)
    return {
      status: "error",
      message: "Укажите сумму, реквизиты и банк.",
    }

  try {
    await db.$transaction(async (tx) => {
      const pricing = await tx.pricingSettings.findUniqueOrThrow({
        where: { key: "default" },
      })
      const enrollment = await tx.partnerEnrollment.findUnique({
        where: { userId: session.userId },
      })
      if (!enrollment?.enabled) throw new BusinessError("ADMIN_FORBIDDEN", 403)
      const amountMinor = parsed.data.amountRub * 100
      if (amountMinor < pricing.minimalPayoutMinor)
        throw new BusinessError("INVALID_INPUT")

      const existing = await tx.payoutRequest.findUnique({
        where: { idempotencyKey: parsed.data.idempotencyKey },
      })
      if (existing) return

      const wallet = await tx.walletAccount.findUnique({
        where: { userId: session.userId },
      })
      if (!wallet || wallet.availableMinor < amountMinor)
        throw new BusinessError("CONFLICT")

      const masked = maskRecipient(parsed.data.recipient)
      const details = JSON.stringify({
        method: "CARD_OR_PHONE",
        recipient: parsed.data.recipient,
        bank: parsed.data.bank,
      })
      const request = await tx.payoutRequest.create({
        data: {
          userId: session.userId,
          idempotencyKey: parsed.data.idempotencyKey,
          amountMinor,
          payoutDetailsEncrypted: encryptSensitive(details),
          payoutDetailsMasked: `Реквизиты · ${masked} · ${parsed.data.bank}`,
        },
      })
      const updatedWallet = await tx.walletAccount.update({
        where: { id: wallet.id },
        data: {
          availableMinor: { decrement: amountMinor },
          reservedMinor: { increment: amountMinor },
          version: { increment: 1 },
        },
      })
      await tx.walletLedgerEntry.create({
        data: {
          walletAccountId: updatedWallet.id,
          userId: session.userId,
          type: "PARTNER_PAYOUT_RESERVE",
          deltaAvailableMinor: -amountMinor,
          deltaReservedMinor: amountMinor,
          referenceType: "PayoutRequest",
          referenceId: request.id,
          idempotencyKey: `partner-payout-reserve:${request.id}`,
          description: "Резервирование средств для партнёрской выплаты",
        },
      })
    })
    revalidatePath("/partner")
    return { status: "success", message: "Заявка на вывод создана." }
  } catch (error) {
    if (error instanceof BusinessError && error.code === "CONFLICT")
      return { status: "error", message: "Недостаточно средств для вывода." }
    if (error instanceof BusinessError && error.code === "INVALID_INPUT")
      return { status: "error", message: "Сумма меньше минимальной выплаты." }
    return { status: "error", message: toFriendlyError(error).message }
  }
}

function maskRecipient(value: string) {
  const trimmed = value.trim()
  if (trimmed.length <= 4) return "••••"
  return `${"•".repeat(Math.min(6, trimmed.length - 4))}${trimmed.slice(-4)}`
}

import { randomBytes } from "node:crypto"
import {
  AuthChallengeStatus,
  AuthProvider,
  TelegramUpdateStatus,
} from "@/generated/prisma/client"
import { z } from "zod"

import { ConflictError, ValidationError } from "@/lib/application-errors"
import { prisma } from "@/lib/db"
import { hashValue } from "@/lib/security"
import { runInTransaction } from "@/lib/transactions"
import { sendTelegramMessage } from "@/src/server/services/telegram/bot-client"
import { applyReferralOnboarding } from "@/src/server/services/referrals/referral-onboarding-service"

const updateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: z
    .object({
      chat: z.object({ id: z.number().int() }),
      from: z.object({ id: z.number().int() }),
      text: z.string().optional(),
    })
    .optional(),
})

export async function processTelegramUpdate(updateId: bigint) {
  const record = await prisma.telegramUpdate.findUniqueOrThrow({
    where: { updateId },
  })
  if (record.status === TelegramUpdateStatus.PROCESSED) return
  const parsed = updateSchema.safeParse(record.payload)
  if (!parsed.success)
    throw new ValidationError("Unsupported Telegram update payload.")
  const message = parsed.data.message
  if (!message?.text) return void (await markProcessed(record.id))

  const telegramId = String(message.from.id)
  const chatId = String(message.chat.id)
  const [commandWithBot, argument] = message.text.trim().split(/\s+/, 2)
  const command = commandWithBot?.split("@")[0]?.toLowerCase()

  if (command === "/start" && argument?.startsWith("login_")) {
    const nonce = argument.slice(6)
    const userId = await consumeLoginChallenge(nonce, telegramId)
    await sendTelegramMessage(
      chatId,
      "Telegram подтверждён. Завершите вход на сайте Pulsar.",
      {
        buttonText: "Войти в Pulsar",
        buttonUrl: `${appUrl()}/auth/telegram/complete?token=${encodeURIComponent(nonce)}`,
      }
    )
    await prisma.auditEvent.create({
      data: {
        actorUserId: userId,
        eventType: "telegram.login_confirmed",
        entityType: "AuthIdentity",
      },
    })
  } else {
    await handleCommand(command, telegramId, chatId)
  }
  await markProcessed(record.id)
}

async function handleCommand(
  command: string | undefined,
  telegramId: string,
  chatId: string
) {
  const identity = await prisma.authIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: AuthProvider.TELEGRAM,
        providerSubject: telegramId,
      },
    },
    include: { user: { include: { subscription: true } } },
  })
  if (!identity) {
    await sendTelegramMessage(
      chatId,
      "Откройте app.pulsar-cloud.space и выберите вход через Telegram."
    )
    return
  }
  const subscription = identity.user.subscription
  if (command === "/connect") {
    if (!subscription?.subscriptionUrl || subscription.status !== "ACTIVE") {
      await sendTelegramMessage(chatId, "Активной подписки пока нет.")
    } else {
      await sendTelegramMessage(chatId, "Ваша ссылка подключения:", {
        buttonText: "Подключить VPN",
        buttonUrl: subscription.subscriptionUrl,
      })
    }
    return
  }
  if (command === "/subscription") {
    const text = subscription
      ? `Статус: ${subscription.status}\nДействует до: ${subscription.expiresAt?.toLocaleString("ru-RU", { timeZone: "UTC" }) ?? "—"} UTC\nУстройств: ${subscription.deviceLimit}\nLTE: ${subscription.lteEnabled ? "включён" : "нет"}`
      : "Подписка ещё не оформлена."
    await sendTelegramMessage(chatId, text)
    return
  }
  await sendTelegramMessage(
    chatId,
    "Pulsar VPN\n/subscription — состояние подписки\n/connect — получить ссылку подключения\n/help — помощь"
  )
}

async function consumeLoginChallenge(nonce: string, telegramId: string) {
  if (nonce.length < 16 || nonce.length > 128)
    throw new ValidationError("Invalid Telegram login challenge.")
  return runInTransaction(prisma, async (tx) => {
    const challenge = await tx.authChallenge.findUnique({
      where: { tokenHash: hashValue(nonce) },
    })
    if (
      !challenge ||
      challenge.provider !== AuthProvider.TELEGRAM ||
      challenge.status !== AuthChallengeStatus.PENDING ||
      challenge.expiresAt <= new Date()
    ) {
      throw new ConflictError("Telegram login challenge expired.")
    }
    const existing = await tx.authIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: AuthProvider.TELEGRAM,
          providerSubject: telegramId,
        },
      },
    })
    if (challenge.userId && existing && existing.userId !== challenge.userId)
      throw new ConflictError("Telegram account is already linked.")
    const createdUser =
      challenge.userId ??
      existing?.userId ??
      (
        await tx.user.create({
          data: {
            referralProfile: {
              create: {
                inviteCode: randomBytes(9).toString("base64url"),
                isEnabled: true,
                enabledAt: new Date(),
              },
            },
          },
        })
      ).id
    const userId = createdUser
    if (!challenge.userId && !existing) {
      await applyReferralOnboarding(tx, userId, readInvite(challenge.context))
    }
    if (!existing)
      await tx.authIdentity.create({
        data: {
          userId,
          provider: AuthProvider.TELEGRAM,
          providerSubject: telegramId,
          verifiedAt: new Date(),
        },
      })
    const consumed = await tx.authChallenge.updateMany({
      where: { id: challenge.id, status: AuthChallengeStatus.PENDING },
      data: { userId },
    })
    if (consumed.count !== 1)
      throw new ConflictError("Telegram challenge was already used.")
    return userId
  })
}

function markProcessed(id: string) {
  return prisma.telegramUpdate.update({
    where: { id },
    data: {
      status: TelegramUpdateStatus.PROCESSED,
      processedAt: new Date(),
      lastError: null,
    },
  })
}
function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  )
}

function readInvite(context: unknown) {
  if (!context || typeof context !== "object" || !("invite" in context)) {
    return undefined
  }
  return typeof context.invite === "string" ? context.invite : undefined
}

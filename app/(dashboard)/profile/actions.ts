"use server"

import { revalidatePath } from "next/cache"
import {
  AuthChallengeKind,
  AuthChallengeStatus,
  AuthProvider,
  JobType,
} from "@/generated/prisma/client"
import { z } from "zod"

import { requireUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { sealJobPayload } from "@/lib/job-payload-crypto"
import {
  createOtpCode,
  createRandomToken,
  hashOtp,
  hashValue,
  timingSafeStringEqual,
} from "@/lib/security"
import { runInTransaction } from "@/lib/transactions"

export type EmailBindingState = {
  ok: boolean
  email?: string
  challengeId?: string
  message?: string
}

export type TelegramBindingState = {
  ok: boolean
  url?: string
  message?: string
}

export async function requestEmailBindingAction(
  _state: EmailBindingState,
  formData: FormData
): Promise<EmailBindingState> {
  const user = await requireUser()
  const email = z.string().trim().email().toLowerCase().parse(formData.get("email"))
  const existing = await prisma.authIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: AuthProvider.EMAIL,
        providerSubject: email,
      },
    },
  })
  if (existing && existing.userId !== user.id) {
    return { ok: false, message: "Этот email уже используется другим аккаунтом." }
  }
  if (user.email) {
    return { ok: false, message: "Email уже привязан." }
  }

  const code = createOtpCode()
  const token = createRandomToken()
  const challenge = await runInTransaction(prisma, async (tx) => {
    await tx.authChallenge.updateMany({
      where: {
        userId: user.id,
        provider: AuthProvider.EMAIL,
        status: AuthChallengeStatus.PENDING,
      },
      data: { status: AuthChallengeStatus.CANCELED },
    })
    const created = await tx.authChallenge.create({
      data: {
        userId: user.id,
        provider: AuthProvider.EMAIL,
        providerSubject: email,
        kind: AuthChallengeKind.EMAIL_OTP,
        status: AuthChallengeStatus.PENDING,
        tokenHash: hashValue(token),
        codeHash: hashOtp(email, code),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        context: { purpose: "bind" },
      },
    })
    await tx.job.create({
      data: {
        type: JobType.SEND_AUTH_EMAIL,
        idempotencyKey: `auth:${created.id}:bind-email`,
        payload: {
          challengeId: created.id,
          email,
          delivery: sealJobPayload({ code, purpose: "bind" }),
        },
      },
    })
    return created
  })

  return {
    ok: true,
    email,
    challengeId: challenge.id,
    message: "Код подтверждения отправлен.",
  }
}

export async function verifyEmailBindingAction(
  _state: EmailBindingState,
  formData: FormData
): Promise<EmailBindingState> {
  const user = await requireUser()
  const parsed = z.object({
    challengeId: z.string().min(1),
    email: z.string().trim().email().toLowerCase(),
    otp: z.string().regex(/^\d{6}$/),
  }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: "Введите шестизначный код." }

  const challenge = await prisma.authChallenge.findUnique({
    where: { id: parsed.data.challengeId },
  })
  if (
    !challenge ||
    challenge.userId !== user.id ||
    challenge.provider !== AuthProvider.EMAIL ||
    challenge.providerSubject !== parsed.data.email ||
    challenge.status !== AuthChallengeStatus.PENDING ||
    challenge.expiresAt <= new Date()
  ) {
    return { ok: false, message: "Код устарел. Запросите новый." }
  }
  if (
    !challenge.codeHash ||
    !timingSafeStringEqual(
      challenge.codeHash,
      hashOtp(parsed.data.email, parsed.data.otp)
    )
  ) {
    await prisma.authChallenge.update({
      where: { id: challenge.id },
      data: {
        attemptCount: { increment: 1 },
        ...(challenge.attemptCount + 1 >= challenge.maxAttempts
          ? { status: AuthChallengeStatus.CANCELED }
          : {}),
      },
    })
    return { ok: false, message: "Неверный код." }
  }

  await runInTransaction(prisma, async (tx) => {
    const consumed = await tx.authChallenge.updateMany({
      where: {
        id: challenge.id,
        status: AuthChallengeStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      data: { status: AuthChallengeStatus.CONSUMED, consumedAt: new Date() },
    })
    if (consumed.count !== 1) throw new Error("Email challenge was already used.")
    await tx.authIdentity.create({
      data: {
        userId: user.id,
        provider: AuthProvider.EMAIL,
        providerSubject: parsed.data.email,
        verifiedAt: new Date(),
      },
    })
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        eventType: "auth.email_linked",
        entityType: "AuthIdentity",
        idempotencyKey: `audit:auth:${challenge.id}:email-linked`,
      },
    })
  })
  revalidatePath("/profile")
  return { ok: true, email: parsed.data.email, message: "Email привязан." }
}

export async function startTelegramBindingAction(): Promise<TelegramBindingState> {
  const user = await requireUser()
  if (user.telegramId) return { ok: false, message: "Telegram уже привязан." }
  const nonce = createRandomToken(18)
  await prisma.authChallenge.create({
    data: {
      userId: user.id,
      provider: AuthProvider.TELEGRAM,
      providerSubject: nonce,
      kind: AuthChallengeKind.TELEGRAM_LOGIN,
      tokenHash: hashValue(nonce),
      context: { purpose: "bind" },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  })
  const username = process.env.TELEGRAM_BOT_USERNAME ?? "pulsarcloud_bot"
  return {
    ok: true,
    url: `https://t.me/${username}?start=login_${nonce}`,
    message: "Откройте бота и подтвердите привязку.",
  }
}

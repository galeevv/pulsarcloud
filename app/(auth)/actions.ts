"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import {
  AuthChallengeKind,
  AuthChallengeStatus,
  AuthProvider,
  JobType,
} from "@/generated/prisma/client"
import { z } from "zod"

import { createSession } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
  DATABASE_SETUP_MESSAGE,
  ensureDatabaseReady,
  isDatabaseSetupError,
} from "@/lib/db-health"
import { getOrCreateEmailUserInTransaction } from "@/lib/email-login"
import { sealJobPayload } from "@/lib/job-payload-crypto"
import {
  createOtpCode,
  createRandomToken,
  hashOtp,
  hashValue,
  timingSafeStringEqual,
} from "@/lib/security"
import { runInTransaction } from "@/lib/transactions"
import { createTelegramAuthService } from "@/src/server/services/telegram/auth-service"

export type RequestOtpState = {
  ok: boolean
  email?: string
  challengeId?: string
  devMagicLink?: string
  devOtp?: string
  message?: string
}

export type VerifyOtpState = { ok: boolean; message?: string }
export type TelegramStubState = { ok: boolean; message?: string; url?: string }

const emailSchema = z.object({
  email: z.string().trim().email("Введите корректный email").toLowerCase(),
  invite: z.string().trim().min(1).max(64).optional(),
})

const verifySchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  challengeId: z.string().min(1),
  otp: z.string().regex(/^\d{6}$/, "Введите 6 цифр"),
})

export async function requestEmailOtpAction(
  _state: RequestOtpState,
  formData: FormData
): Promise<RequestOtpState> {
  void _state
  const dbError = await ensureDatabaseReady()

  if (dbError) {
    return { ok: false, message: dbError }
  }

  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
    invite: formData.get("invite") || undefined,
  })

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Email не принят.",
    }
  }

  const { email, invite } = parsed.data
  const code = createOtpCode()
  const token = createRandomToken()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
  const magicPath = `/auth/verify/link?token=${encodeURIComponent(token)}`
  const magicLink = await buildAbsoluteUrl(magicPath)

  try {
    const challenge = await runInTransaction(prisma, async (tx) => {
      await tx.authChallenge.updateMany({
        where: {
          provider: AuthProvider.EMAIL,
          providerSubject: email,
          status: AuthChallengeStatus.PENDING,
        },
        data: { status: AuthChallengeStatus.CANCELED },
      })

      const created = await tx.authChallenge.create({
        data: {
          provider: AuthProvider.EMAIL,
          providerSubject: email,
          kind: AuthChallengeKind.EMAIL_OTP,
          tokenHash: hashValue(token),
          codeHash: hashOtp(email, code),
          expiresAt,
          context: invite ? { invite } : undefined,
        },
      })

      await tx.job.create({
        data: {
          type: JobType.SEND_AUTH_EMAIL,
          idempotencyKey: `auth:${created.id}:email`,
          payload: {
            challengeId: created.id,
            email,
            delivery: sealJobPayload({ code, magicLink }),
          },
        },
      })

      return created
    })

    if (shouldShowDevAuth()) {
      console.info(`[Pulsar dev magic link] ${email}: ${magicLink}`)
      console.info(`[Pulsar dev fallback code] ${email}: ${code}`)
    }

    return {
      ok: true,
      email,
      challengeId: challenge.id,
      devMagicLink: shouldShowDevAuth() ? magicPath : undefined,
      devOtp: shouldShowDevAuth() ? code : undefined,
      message: "Ссылка отправлена.",
    }
  } catch (error) {
    if (isDatabaseSetupError(error)) {
      return { ok: false, message: DATABASE_SETUP_MESSAGE }
    }

    throw error
  }
}

export async function verifyEmailOtpAction(
  _state: VerifyOtpState,
  formData: FormData
): Promise<VerifyOtpState> {
  void _state
  const parsed = verifySchema.safeParse({
    email: formData.get("email"),
    challengeId: formData.get("challengeId"),
    otp: formData.get("otp"),
  })

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Код не принят.",
    }
  }

  const { email, challengeId, otp } = parsed.data
  const challenge = await prisma.authChallenge.findUnique({
    where: { id: challengeId },
  })

  if (!challenge || !isUsableEmailChallenge(challenge, email)) {
    return { ok: false, message: "Ссылка устарела. Запросите новую." }
  }

  if (
    !challenge.codeHash ||
    !timingSafeStringEqual(challenge.codeHash, hashOtp(email, otp))
  ) {
    const nextAttempts = challenge.attemptCount + 1
    await prisma.authChallenge.updateMany({
      where: {
        id: challenge.id,
        status: AuthChallengeStatus.PENDING,
        attemptCount: challenge.attemptCount,
      },
      data: {
        attemptCount: { increment: 1 },
        status:
          nextAttempts >= challenge.maxAttempts
            ? AuthChallengeStatus.CANCELED
            : AuthChallengeStatus.PENDING,
      },
    })

    return { ok: false, message: "Неверный код." }
  }

  const user = await runInTransaction(prisma, async (tx) => {
    const consumed = await tx.authChallenge.updateMany({
      where: {
        id: challenge.id,
        status: AuthChallengeStatus.PENDING,
        expiresAt: { gt: new Date() },
        attemptCount: { lt: challenge.maxAttempts },
      },
      data: {
        status: AuthChallengeStatus.CONSUMED,
        consumedAt: new Date(),
      },
    })

    if (consumed.count !== 1) {
      throw new Error("Auth challenge was already consumed.")
    }

    const createdUser = await getOrCreateEmailUserInTransaction(
      tx,
      email,
      readInvite(challenge.context)
    )

    await tx.authChallenge.update({
      where: { id: challenge.id },
      data: { userId: createdUser.id },
    })

    return createdUser
  })

  await createSession(user.id)
  redirect("/home")
}

export async function startTelegramStubAction(
  _state: TelegramStubState,
  _formData: FormData
): Promise<TelegramStubState> {
  void _state
  void _formData
  const telegramAuth = createTelegramAuthService()
  const challenge = await telegramAuth.createLoginChallenge()

  await prisma.authChallenge.create({
    data: {
      provider: AuthProvider.TELEGRAM,
      providerSubject: challenge.nonce,
      kind: AuthChallengeKind.TELEGRAM_LOGIN,
      tokenHash: hashValue(challenge.nonce),
      context: { provider: "telegram", message: challenge.message },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  })

  if (challenge.nonce) {
    const username = process.env.TELEGRAM_BOT_USERNAME ?? "pulsarcloud_bot"
    return {
      ok: true,
      message: "Откройте бота и подтвердите вход.",
      url: `https://t.me/${username}?start=login_${challenge.nonce}`,
    }
  }

  return { ok: true, message: "Telegram-вход будет подключён позже." }
}

function isUsableEmailChallenge(
  challenge: NonNullable<
    Awaited<ReturnType<typeof prisma.authChallenge.findUnique>>
  >,
  email: string
) {
  return Boolean(
    challenge &&
    challenge.provider === AuthProvider.EMAIL &&
    challenge.kind === AuthChallengeKind.EMAIL_OTP &&
    challenge.status === AuthChallengeStatus.PENDING &&
    challenge.providerSubject === email &&
    challenge.expiresAt > new Date() &&
    challenge.attemptCount < challenge.maxAttempts
  )
}

function readInvite(context: unknown) {
  if (!context || typeof context !== "object" || !("invite" in context)) {
    return undefined
  }

  return typeof context.invite === "string" ? context.invite : undefined
}

function shouldShowDevAuth() {
  return (
    process.env.DEV_SHOW_OTP === "true" ||
    (process.env.NODE_ENV !== "production" &&
      process.env.DEV_SHOW_OTP !== "false")
  )
}

async function buildAbsoluteUrl(path: string) {
  const headerStore = await headers()
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL

  if (configuredOrigin) {
    return new URL(path, configuredOrigin).toString()
  }

  const host = headerStore.get("host")
  const protocol =
    headerStore.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "production" ? "https" : "http")

  return host ? `${protocol}://${host}${path}` : path
}

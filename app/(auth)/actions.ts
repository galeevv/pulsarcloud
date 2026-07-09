"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { LoginChallengeStatus, LoginChallengeType } from "@prisma/client"
import { z } from "zod"

import { createSession } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
  DATABASE_SETUP_MESSAGE,
  ensureDatabaseReady,
  isDatabaseSetupError,
} from "@/lib/db-health"
import { getOrCreateEmailUser } from "@/lib/email-login"
import {
  createOtpCode,
  createRandomToken,
  hashOtp,
  hashValue,
  timingSafeStringEqual,
} from "@/lib/security"
import { createTelegramAuthService } from "@/src/server/services/telegram/auth-service"

export type RequestOtpState = {
  ok: boolean
  email?: string
  challengeId?: string
  devMagicLink?: string
  devOtp?: string
  message?: string
}

export type VerifyOtpState = {
  ok: boolean
  message?: string
}

export type TelegramStubState = {
  ok: boolean
  message?: string
}

const emailSchema = z.object({
  email: z.string().trim().email("Введите корректный email").toLowerCase(),
  invite: z.string().optional(),
})

const verifySchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  challengeId: z.string().min(1),
  otp: z.string().regex(/^\d{6}$/, "Введите 6 цифр"),
  invite: z.string().optional(),
})

export async function requestEmailOtpAction(
  _state: RequestOtpState,
  formData: FormData
): Promise<RequestOtpState> {
  void _state

  const dbError = await ensureDatabaseReady()

  if (dbError) {
    return {
      ok: false,
      message: dbError,
    }
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

  const email = parsed.data.email
  const invite = parsed.data.invite
  const code = createOtpCode()
  const token = createRandomToken()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
  const magicPath = `/auth/verify/link?token=${encodeURIComponent(token)}${
    invite ? `&invite=${encodeURIComponent(invite)}` : ""
  }`
  const magicLink = await buildAbsoluteUrl(magicPath)

  try {
    const challenge = await prisma.loginChallenge.create({
      data: {
        type: LoginChallengeType.EMAIL_OTP,
        status: LoginChallengeStatus.PENDING,
        email,
        nonce: hashValue(token),
        expiresAt,
      },
    })

    await prisma.emailOtp.create({
      data: {
        email,
        codeHash: hashOtp(email, code),
        expiresAt,
      },
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
      return {
        ok: false,
        message: DATABASE_SETUP_MESSAGE,
      }
    }

    throw error
  }
}

export async function verifyEmailOtpAction(
  _state: VerifyOtpState,
  formData: FormData
): Promise<VerifyOtpState> {
  void _state

  const dbError = await ensureDatabaseReady()

  if (dbError) {
    return {
      ok: false,
      message: dbError,
    }
  }

  const parsed = verifySchema.safeParse({
    email: formData.get("email"),
    challengeId: formData.get("challengeId"),
    otp: formData.get("otp"),
    invite: formData.get("invite") || undefined,
  })

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Код не принят.",
    }
  }

  const { email, challengeId, otp, invite } = parsed.data
  const challenge = await prisma.loginChallenge.findUnique({
    where: { id: challengeId },
  })

  if (
    !challenge ||
    challenge.type !== LoginChallengeType.EMAIL_OTP ||
    challenge.status !== LoginChallengeStatus.PENDING ||
    challenge.email !== email ||
    challenge.expiresAt <= new Date()
  ) {
    return {
      ok: false,
      message: "Ссылка устарела. Запросите новую ссылку для входа.",
    }
  }

  const emailOtp = await prisma.emailOtp.findFirst({
    where: {
      email,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  })

  if (!emailOtp || emailOtp.attempts >= 5) {
    return {
      ok: false,
      message: "Ссылка устарела. Запросите новую ссылку для входа.",
    }
  }

  const expectedHash = hashOtp(email, otp)

  if (!timingSafeStringEqual(emailOtp.codeHash, expectedHash)) {
    await prisma.emailOtp.update({
      where: { id: emailOtp.id },
      data: {
        attempts: {
          increment: 1,
        },
      },
    })

    return {
      ok: false,
      message: "Неверный код.",
    }
  }

  const user = await getOrCreateEmailUser(email, invite)

  await prisma.emailOtp.update({
    where: { id: emailOtp.id },
    data: { consumedAt: new Date() },
  })
  await prisma.loginChallenge.update({
    where: { id: challenge.id },
    data: {
      userId: user.id,
      status: LoginChallengeStatus.COMPLETED,
      completedAt: new Date(),
    },
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

  const dbError = await ensureDatabaseReady()

  if (dbError) {
    return {
      ok: false,
      message: dbError,
    }
  }

  const telegramAuth = createTelegramAuthService()
  const challenge = await telegramAuth.createLoginChallenge()

  try {
    await prisma.loginChallenge.create({
      data: {
        type: LoginChallengeType.TELEGRAM,
        status: LoginChallengeStatus.PENDING,
        nonce: hashValue(challenge.nonce),
        telegramPayload: {
          provider: "mock",
          message: challenge.message,
        },
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    })
  } catch (error) {
    if (isDatabaseSetupError(error)) {
      return {
        ok: false,
        message: DATABASE_SETUP_MESSAGE,
      }
    }

    throw error
  }

  return {
    ok: true,
    message: "В dev-режиме Telegram откроет бот-сценарий позже.",
  }
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
  const host = headerStore.get("host")

  if (!host) {
    return path
  }

  const protocol =
    headerStore.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "production" ? "https" : "http")

  return `${protocol}://${host}${path}`
}

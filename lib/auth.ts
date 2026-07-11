import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { AuthProvider, UserRole, type User } from "@/generated/prisma/client"

import { prisma } from "@/lib/db"
import { isDatabaseSetupError } from "@/lib/db-health"
import { createRandomToken, hashValue } from "@/lib/security"

const DEFAULT_SESSION_TTL_DAYS = 180

export type CurrentUser = User & {
  email: string | null
  telegramId: string | null
}

export function getSessionCookieName() {
  return process.env.SESSION_COOKIE_NAME ?? "pulsar_session"
}

function getSessionExpiresAt() {
  const configured = Number(process.env.SESSION_TTL_DAYS)
  const days =
    Number.isInteger(configured) && configured > 0
      ? configured
      : DEFAULT_SESSION_TTL_DAYS
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

export async function createSession(userId: string) {
  const token = createRandomToken()
  const expiresAt = getSessionExpiresAt()
  const headerStore = await headers()

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashValue(token),
      expiresAt,
      userAgent: headerStore.get("user-agent"),
      ipAddress: headerStore.get("x-forwarded-for"),
    },
  })

  const cookieStore = await cookies()
  cookieStore.set(getSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  })
}

export async function clearCurrentSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(getSessionCookieName())?.value

  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashValue(token), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  cookieStore.delete(getSessionCookieName())
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(getSessionCookieName())?.value

  if (!token) {
    return null
  }

  const session = await prisma.session
    .findUnique({
      where: { tokenHash: hashValue(token) },
      include: { user: { include: { authIdentities: true } } },
    })
    .catch((error: unknown) => {
      if (isDatabaseSetupError(error)) {
        return null
      }

      throw error
    })

  if (!session || session.revokedAt) {
    return null
  }

  if (session.expiresAt <= new Date()) {
    await prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    return null
  }

  const email =
    session.user.authIdentities.find(
      (identity) => identity.provider === AuthProvider.EMAIL
    )?.providerSubject ?? null
  const telegramId =
    session.user.authIdentities.find(
      (identity) => identity.provider === AuthProvider.TELEGRAM
    )?.providerSubject ?? null

  return { ...session.user, email, telegramId }
}

export async function requireUser() {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/")
  }

  return user
}

export async function requireAdmin() {
  const user = await requireUser()

  if (user.role !== UserRole.ADMIN) {
    redirect("/home")
  }

  return user
}

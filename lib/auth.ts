import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import type { User } from "@prisma/client"
import { UserRole } from "@prisma/client"

import { prisma } from "@/lib/db"
import { isDatabaseSetupError } from "@/lib/db-health"
import { createRandomToken, hashValue } from "@/lib/security"

const SESSION_TTL_DAYS = 30

export function getSessionCookieName() {
  return process.env.SESSION_COOKIE_NAME ?? "pulsar_session"
}

function getSessionExpiresAt() {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
}

export async function createSession(userId: string) {
  const token = createRandomToken()
  const tokenHash = hashValue(token)
  const expiresAt = getSessionExpiresAt()
  const headerStore = await headers()

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
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
    await prisma.session.deleteMany({
      where: {
        tokenHash: hashValue(token),
      },
    })
  }

  cookieStore.delete(getSessionCookieName())
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(getSessionCookieName())?.value

  if (!token) {
    return null
  }

  const session = await prisma.session
    .findUnique({
      where: {
        tokenHash: hashValue(token),
      },
      include: {
        user: true,
      },
    })
    .catch((error: unknown) => {
      if (isDatabaseSetupError(error)) {
        return null
      }

      throw error
    })

  if (!session) {
    return null
  }

  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({
      where: {
        id: session.id,
      },
    })

    return null
  }

  return session.user
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

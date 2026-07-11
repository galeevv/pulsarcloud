import { NextRequest, NextResponse } from "next/server"
import {
  AuthChallengeKind,
  AuthChallengeStatus,
  AuthProvider,
} from "@/generated/prisma/client"

import { createSession } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { ensureDatabaseReady } from "@/lib/db-health"
import { getOrCreateEmailUserInTransaction } from "@/lib/email-login"
import { hashValue } from "@/lib/security"
import { runInTransaction } from "@/lib/transactions"

export async function GET(request: NextRequest) {
  if (await ensureDatabaseReady()) {
    return redirectToAuth(request, "expired")
  }

  const token = request.nextUrl.searchParams.get("token")

  if (!token) {
    return redirectToAuth(request, "expired")
  }

  const challenge = await prisma.authChallenge.findUnique({
    where: { tokenHash: hashValue(token) },
  })

  if (
    !challenge ||
    challenge.provider !== AuthProvider.EMAIL ||
    challenge.kind !== AuthChallengeKind.EMAIL_OTP
  ) {
    return redirectToAuth(request, "expired")
  }

  if (challenge.status === AuthChallengeStatus.CONSUMED) {
    return redirectToAuth(request, "used")
  }

  if (
    challenge.status !== AuthChallengeStatus.PENDING ||
    challenge.expiresAt <= new Date()
  ) {
    await prisma.authChallenge.updateMany({
      where: { id: challenge.id, status: AuthChallengeStatus.PENDING },
      data: { status: AuthChallengeStatus.EXPIRED },
    })
    return redirectToAuth(request, "expired")
  }

  const user = await runInTransaction(prisma, async (tx) => {
    const consumed = await tx.authChallenge.updateMany({
      where: {
        id: challenge.id,
        status: AuthChallengeStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      data: {
        status: AuthChallengeStatus.CONSUMED,
        consumedAt: new Date(),
      },
    })

    if (consumed.count !== 1) {
      return null
    }

    const createdUser = await getOrCreateEmailUserInTransaction(
      tx,
      challenge.providerSubject,
      readInvite(challenge.context)
    )
    await tx.authChallenge.update({
      where: { id: challenge.id },
      data: { userId: createdUser.id },
    })
    return createdUser
  })

  if (!user) {
    return redirectToAuth(request, "used")
  }

  await createSession(user.id)
  return NextResponse.redirect(new URL("/home", request.url))
}

function readInvite(context: unknown) {
  if (!context || typeof context !== "object" || !("invite" in context)) {
    return undefined
  }
  return typeof context.invite === "string" ? context.invite : undefined
}

function redirectToAuth(request: NextRequest, error: "expired" | "used") {
  const url = new URL("/", request.url)
  url.searchParams.set("authError", error)
  return NextResponse.redirect(url)
}

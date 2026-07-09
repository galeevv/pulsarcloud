import { NextRequest, NextResponse } from "next/server"
import { LoginChallengeStatus, LoginChallengeType } from "@prisma/client"

import { createSession } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { ensureDatabaseReady } from "@/lib/db-health"
import { getOrCreateEmailUser } from "@/lib/email-login"
import { hashValue } from "@/lib/security"

export async function GET(request: NextRequest) {
  const dbError = await ensureDatabaseReady()

  if (dbError) {
    return redirectToAuth(request, "expired")
  }

  const token = request.nextUrl.searchParams.get("token")
  const invite = request.nextUrl.searchParams.get("invite") ?? undefined

  if (!token) {
    return redirectToAuth(request, "expired")
  }

  const challenge = await prisma.loginChallenge.findUnique({
    where: { nonce: hashValue(token) },
  })

  if (!challenge || challenge.type !== LoginChallengeType.EMAIL_OTP) {
    return redirectToAuth(request, "expired")
  }

  if (challenge.status === LoginChallengeStatus.COMPLETED) {
    return redirectToAuth(request, "used")
  }

  if (
    challenge.status !== LoginChallengeStatus.PENDING ||
    challenge.expiresAt <= new Date() ||
    !challenge.email
  ) {
    if (challenge.status === LoginChallengeStatus.PENDING) {
      await prisma.loginChallenge.update({
        where: { id: challenge.id },
        data: { status: LoginChallengeStatus.EXPIRED },
      })
    }

    return redirectToAuth(request, "expired")
  }

  const user = await getOrCreateEmailUser(challenge.email, invite)

  await prisma.loginChallenge.update({
    where: { id: challenge.id },
    data: {
      completedAt: new Date(),
      status: LoginChallengeStatus.COMPLETED,
      userId: user.id,
    },
  })
  await createSession(user.id)

  return NextResponse.redirect(new URL("/home", request.url))
}

function redirectToAuth(request: NextRequest, error: "expired" | "used") {
  const url = new URL("/", request.url)
  url.searchParams.set("authError", error)

  return NextResponse.redirect(url)
}

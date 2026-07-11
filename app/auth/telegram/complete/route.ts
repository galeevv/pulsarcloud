import { redirect } from "next/navigation"
import { AuthChallengeStatus, AuthProvider } from "@/generated/prisma/client"

import { createSession } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { hashValue } from "@/lib/security"

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")
  if (!token) redirect("/?authError=expired")
  const challenge = await prisma.authChallenge.findUnique({
    where: { tokenHash: hashValue(token) },
  })
  if (
    !challenge?.userId ||
    challenge.provider !== AuthProvider.TELEGRAM ||
    challenge.status !== AuthChallengeStatus.PENDING ||
    challenge.expiresAt <= new Date()
  )
    redirect("/?authError=expired")
  const consumed = await prisma.authChallenge.updateMany({
    where: {
      id: challenge.id,
      status: AuthChallengeStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
    data: { status: AuthChallengeStatus.CONSUMED, consumedAt: new Date() },
  })
  if (consumed.count !== 1) redirect("/?authError=used")
  await createSession(challenge.userId)
  redirect("/home")
}

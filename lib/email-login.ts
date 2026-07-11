import { randomBytes } from "node:crypto"

import { AuthProvider, type Prisma } from "@/generated/prisma/client"

import { prisma } from "@/lib/db"
import { runInTransaction } from "@/lib/transactions"

export function getOrCreateEmailUser(email: string, invite?: string) {
  return runInTransaction(prisma, (tx) =>
    getOrCreateEmailUserInTransaction(tx, email, invite)
  )
}

export async function getOrCreateEmailUserInTransaction(
  tx: Prisma.TransactionClient,
  rawEmail: string,
  invite?: string
) {
  const email = rawEmail.trim().toLowerCase()
  const existingIdentity = await tx.authIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: AuthProvider.EMAIL,
        providerSubject: email,
      },
    },
    include: { user: true },
  })

  if (existingIdentity) {
    if (!existingIdentity.verifiedAt) {
      await tx.authIdentity.update({
        where: { id: existingIdentity.id },
        data: { verifiedAt: new Date() },
      })
    }

    return existingIdentity.user
  }

  const user = await tx.user.create({
    data: {
      referralProfile: {
        create: {
          inviteCode: createInviteCode(),
        },
      },
      authIdentities: {
        create: {
          provider: AuthProvider.EMAIL,
          providerSubject: email,
          verifiedAt: new Date(),
        },
      },
    },
  })

  await captureInvite(tx, user.id, invite)

  return user
}

async function captureInvite(
  tx: Prisma.TransactionClient,
  invitedUserId: string,
  invite?: string
) {
  if (!invite) {
    return
  }

  const inviterProfile = await tx.referralProfile.findUnique({
    where: { inviteCode: invite },
  })

  if (!inviterProfile?.isEnabled || inviterProfile.userId === invitedUserId) {
    return
  }

  await tx.referralInvite.create({
    data: {
      inviterId: inviterProfile.userId,
      invitedUserId,
      inviteCodeSnapshot: inviterProfile.inviteCode,
    },
  })
}

function createInviteCode() {
  return randomBytes(9).toString("base64url")
}

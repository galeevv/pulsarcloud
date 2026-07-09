import { AuthIdentityType } from "@prisma/client"

import { prisma } from "@/lib/db"

export async function getOrCreateEmailUser(email: string, invite?: string) {
  const existing = await prisma.user.findUnique({
    where: { email },
  })

  if (existing) {
    await ensureEmailIdentity(existing.id, email)
    return existing
  }

  const user = await prisma.user.create({
    data: {
      email,
      referralProfile: {
        create: {
          inviteCode: createInviteCode(),
          inviteUrl: "",
          isEnabled: false,
        },
      },
    },
  })

  await prisma.referralProfile.update({
    where: { userId: user.id },
    data: {
      inviteUrl: `https://pulsarr.space/?invite=${user.id.slice(-7)}`,
    },
  })
  await ensureEmailIdentity(user.id, email)
  await captureInvite(user.id, invite)

  return user
}

async function ensureEmailIdentity(userId: string, email: string) {
  await prisma.authIdentity.upsert({
    where: {
      type_identifier: {
        type: AuthIdentityType.EMAIL,
        identifier: email,
      },
    },
    update: {
      userId,
      verifiedAt: new Date(),
    },
    create: {
      userId,
      type: AuthIdentityType.EMAIL,
      identifier: email,
      verifiedAt: new Date(),
    },
  })
}

async function captureInvite(invitedUserId: string, invite?: string) {
  if (!invite) {
    return
  }

  const inviterProfile = await prisma.referralProfile.findUnique({
    where: { inviteCode: invite },
  })

  if (!inviterProfile?.isEnabled || inviterProfile.userId === invitedUserId) {
    return
  }

  await prisma.referralInvite.upsert({
    where: { invitedUserId },
    update: {
      inviterId: inviterProfile.userId,
    },
    create: {
      inviterId: inviterProfile.userId,
      invitedUserId,
    },
  })
}

function createInviteCode() {
  return String(Math.floor(1000000 + Math.random() * 9000000))
}

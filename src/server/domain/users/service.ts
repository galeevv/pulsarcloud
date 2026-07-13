import type { Prisma } from "@/src/generated/prisma/client"
import { randomToken } from "@/src/server/infrastructure/security/crypto"

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export async function createUserGraph(
  tx: Prisma.TransactionClient,
  input: { isTest?: boolean }
) {
  const user = await tx.user.create({ data: { isTest: input.isTest ?? false } })
  await tx.walletAccount.create({ data: { userId: user.id } })
  await tx.referralProfile.create({
    data: { userId: user.id, inviteCode: randomToken(12) },
  })
  return user
}

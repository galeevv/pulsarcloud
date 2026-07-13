import type { Prisma, SessionKind } from "@/src/generated/prisma/client"
import { BusinessError } from "@/src/server/application/errors"
import {
  hashToken,
  randomToken,
} from "@/src/server/infrastructure/security/crypto"

const DAY = 86_400_000
export const SESSION_ABSOLUTE_DAYS = 180

function sessionIdleDays(kind: SessionKind) {
  return kind === "ADMIN" ? 7 : 30
}

export async function createSession(
  tx: Prisma.TransactionClient,
  input: {
    userId: string
    kind: SessionKind
    userAgentHash?: string
    ipPrefixHash?: string
  }
) {
  const rawToken = randomToken(32)
  const now = new Date()
  const idleDays = sessionIdleDays(input.kind)
  await tx.session.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      tokenHash: hashToken(rawToken),
      idleExpiresAt: new Date(now.getTime() + idleDays * DAY),
      absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_DAYS * DAY),
      userAgentHash: input.userAgentHash,
      ipPrefixHash: input.ipPrefixHash,
    },
  })
  return rawToken
}

export async function resolveSession(
  tx: Prisma.TransactionClient,
  rawToken: string | undefined,
  kind: SessionKind
) {
  if (!rawToken) return null
  const now = new Date()
  const session = await tx.session.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  })
  if (
    !session ||
    session.kind !== kind ||
    session.revokedAt ||
    session.idleExpiresAt <= now ||
    session.absoluteExpiresAt <= now ||
    session.user.status !== "ACTIVE" ||
    (kind === "ADMIN" && session.user.role !== "ADMIN")
  )
    return null
  if (now.getTime() - session.lastSeenAt.getTime() > 12 * 60_000) {
    await tx.session.update({
      where: { id: session.id },
      data: {
        lastSeenAt: now,
        idleExpiresAt: new Date(
          Math.min(
            now.getTime() + sessionIdleDays(kind) * DAY,
            session.absoluteExpiresAt.getTime()
          )
        ),
      },
    })
  }
  return session
}

export async function requireSession(
  tx: Prisma.TransactionClient,
  rawToken: string | undefined,
  kind: SessionKind
) {
  const session = await resolveSession(tx, rawToken, kind)
  if (!session)
    throw new BusinessError(
      kind === "ADMIN" ? "ADMIN_FORBIDDEN" : "AUTH_FORBIDDEN",
      401
    )
  if (kind === "ADMIN" && session.user.role !== "ADMIN")
    throw new BusinessError("ADMIN_FORBIDDEN", 403)
  return session
}

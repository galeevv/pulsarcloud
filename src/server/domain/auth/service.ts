import { randomInt, randomUUID } from "node:crypto"
import type {
  ChallengePurpose,
  LoginChallenge,
  Prisma,
  SessionKind,
} from "@/src/generated/prisma/client"
import { db, withBusyRetry } from "@/src/server/infrastructure/db/client"
import { BusinessError } from "@/src/server/application/errors"
import {
  createUserGraph,
  normalizeEmail,
} from "@/src/server/domain/users/service"
import { applyReferralOnRegistration } from "@/src/server/domain/referrals/service"
import { createSession } from "@/src/server/domain/auth/session"
import {
  verifyEmailBrowserState,
  verifyTelegramBrowserState,
} from "@/src/server/domain/auth/browser-state"
import {
  correlationId,
  encryptSensitive,
  hashOtp,
  hashToken,
  randomToken,
  safeEqual,
} from "@/src/server/infrastructure/security/crypto"
import { getConfig } from "@/src/server/config"

const MINUTE = 60_000

function authTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>
) {
  return withBusyRetry(() => db.$transaction(operation), 6)
}

async function consumeRateLimit(
  tx: Prisma.TransactionClient,
  key: string,
  windowMs: number,
  max: number,
  now = new Date()
) {
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs)
  const bucket = await tx.rateLimitBucket.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: {
      key,
      windowStart,
      count: 1,
      expiresAt: new Date(windowStart.getTime() + windowMs * 2),
    },
    update: { count: { increment: 1 } },
  })
  return bucket.count <= max
}

export async function requestEmailChallenge(input: {
  email: string
  purpose?: ChallengePurpose
  requestedByUserId?: string
  inviteCode?: string
  ipHash?: string
  userAgentHash?: string
}) {
  const email = normalizeEmail(input.email)
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254)
    throw new BusinessError("INVALID_INPUT")
  const purpose = input.purpose ?? "USER_LOGIN"
  if (purpose === "ADMIN_LOGIN" && email !== getConfig().admin.email)
    throw new BusinessError("ADMIN_FORBIDDEN", 403)
  const id = randomUUID()
  const otp = randomInt(0, 1_000_000).toString().padStart(6, "0")
  const magicLinkToken = randomToken(32)
  const now = new Date()
  const limits = await authTransaction(async (tx) => {
    const cooldownAllowed = await consumeRateLimit(
      tx,
      `otp:cooldown:${email}`,
      MINUTE,
      1,
      now
    )
    const emailAllowed = await consumeRateLimit(
      tx,
      `otp:email:5m:${email}`,
      5 * MINUTE,
      5,
      now
    )
    const ipAllowed = input.ipHash
      ? await consumeRateLimit(
          tx,
          `otp:ip:5m:${input.ipHash}`,
          5 * MINUTE,
          10,
          now
        )
      : true
    return {
      cooldownAllowed,
      emailAllowed,
      ipAllowed,
    }
  })
  if (!limits.cooldownAllowed || !limits.emailAllowed || !limits.ipAllowed) {
    if (purpose === "ADMIN_LOGIN")
      await db.auditLog.create({
        data: {
          actorType: "SYSTEM",
          action: "ADMIN_LOGIN_RATE_LIMITED",
          entityType: "Authentication",
          metadataJson: JSON.stringify({ ipHash: input.ipHash ?? null }),
          correlationId: correlationId(),
        },
      })
    throw new BusinessError("AUTH_RATE_LIMITED", 429)
  }
  const recentChallenge = await db.loginChallenge.findFirst({
    where: {
      emailNormalized: email,
      createdAt: { gt: new Date(now.getTime() - MINUTE) },
    },
    select: { id: true },
  })
  if (recentChallenge) throw new BusinessError("AUTH_RATE_LIMITED", 429)
  await authTransaction(async (tx) => {
    await tx.loginChallenge.create({
      data: {
        id,
        channel: "EMAIL",
        purpose,
        emailNormalized: email,
        requestedByUserId: input.requestedByUserId,
        inviteCodeSnapshot: input.inviteCode?.slice(0, 100),
        otpHash: hashOtp(id, otp),
        magicLinkTokenHash: hashToken(magicLinkToken),
        expiresAt: new Date(now.getTime() + 5 * MINUTE),
        requestedIpHash: input.ipHash,
        userAgentHash: input.userAgentHash,
        devOtpEncrypted: getConfig().testMode ? encryptSensitive(otp) : null,
      },
    })
    await tx.outboxJob.create({
      data: {
        type: "SEND_EMAIL_OTP",
        aggregateType: "LoginChallenge",
        aggregateId: id,
        payloadJson: JSON.stringify({
          challengeId: id,
          email,
          otpEncrypted: encryptSensitive(otp),
          magicLinkTokenEncrypted: encryptSensitive(magicLinkToken),
        }),
        dedupeKey: `email-otp:${id}`,
        maxAttempts: 5,
      },
    })
  })
  return {
    challengeId: id,
    expiresAt: new Date(now.getTime() + 5 * MINUTE),
    ...(getConfig().testMode ? { devOtp: otp } : {}),
  }
}

async function rejectInactiveEmailChallenge(
  tx: Prisma.TransactionClient,
  challenge: LoginChallenge
) {
  if (challenge.status === "PENDING")
    await tx.loginChallenge.update({
      where: { id: challenge.id },
      data: { status: "EXPIRED" },
    })
  if (challenge.purpose === "ADMIN_LOGIN")
    await tx.auditLog.create({
      data: {
        actorType: "SYSTEM",
        action: "ADMIN_LOGIN_CHALLENGE_REJECTED",
        entityType: "LoginChallenge",
        entityId: challenge.id,
        metadataJson: JSON.stringify({ reason: "expired_or_not_pending" }),
        correlationId: correlationId(),
      },
    })
  return { error: "AUTH_CHALLENGE_EXPIRED" as const, status: 400 }
}

async function completeEmailChallenge(
  tx: Prisma.TransactionClient,
  challenge: LoginChallenge,
  input: {
    currentUserId?: string
    userAgentHash?: string
    ipPrefixHash?: string
    incrementAttempts: boolean
  }
) {
  if (!challenge.emailNormalized) throw new BusinessError("INVALID_INPUT")

  let userId: string
  const identity = await tx.authIdentity.findUnique({
    where: { emailNormalized: challenge.emailNormalized },
  })
  if (challenge.purpose === "LINK_EMAIL") {
    if (
      !challenge.requestedByUserId ||
      challenge.requestedByUserId !== input.currentUserId
    )
      throw new BusinessError("AUTH_FORBIDDEN", 403)
    if (identity && identity.userId !== challenge.requestedByUserId)
      throw new BusinessError("AUTH_IDENTITY_IN_USE", 409)
    userId = challenge.requestedByUserId
    if (!identity)
      await tx.authIdentity.create({
        data: {
          userId,
          provider: "EMAIL",
          providerSubject: challenge.emailNormalized,
          emailNormalized: challenge.emailNormalized,
          verifiedAt: new Date(),
        },
      })
  } else if (identity) {
    userId = identity.userId
  } else {
    if (challenge.purpose === "ADMIN_LOGIN")
      throw new BusinessError("ADMIN_FORBIDDEN", 403)
    const user = await createUserGraph(tx, { isTest: getConfig().testMode })
    userId = user.id
    await tx.authIdentity.create({
      data: {
        userId,
        provider: "EMAIL",
        providerSubject: challenge.emailNormalized,
        emailNormalized: challenge.emailNormalized,
        verifiedAt: new Date(),
      },
    })
    await applyReferralOnRegistration(tx, {
      invitedUserId: userId,
      inviteCode: challenge.inviteCodeSnapshot,
    })
  }
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
  if (user.isTest !== getConfig().testMode)
    throw new BusinessError("AUTH_FORBIDDEN", 403)
  const kind: SessionKind =
    challenge.purpose === "ADMIN_LOGIN" ? "ADMIN" : "USER"
  if (kind === "ADMIN" && user.role !== "ADMIN")
    throw new BusinessError("ADMIN_FORBIDDEN", 403)
  if (user.status !== "ACTIVE") throw new BusinessError("AUTH_FORBIDDEN", 403)
  const rawSession =
    challenge.purpose === "LINK_EMAIL"
      ? null
      : await createSession(tx, {
          userId,
          kind,
          userAgentHash: input.userAgentHash,
          ipPrefixHash: input.ipPrefixHash,
        })
  await tx.loginChallenge.update({
    where: { id: challenge.id },
    data: {
      status: "COMPLETED",
      consumedAt: new Date(),
      attempts: challenge.attempts + (input.incrementAttempts ? 1 : 0),
      otpHash: null,
      devOtpEncrypted: null,
    },
  })
  await tx.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  })
  return {
    value: {
      userId,
      kind,
      rawSession,
      linked: challenge.purpose === "LINK_EMAIL",
    },
  }
}

export async function verifyEmailChallenge(input: {
  challengeId: string
  otp: string
  currentUserId?: string
  userAgentHash?: string
  ipPrefixHash?: string
}) {
  const outcome = await authTransaction(async (tx) => {
    const challenge = await tx.loginChallenge.findUnique({
      where: { id: input.challengeId },
    })
    if (!challenge || challenge.channel !== "EMAIL")
      throw new BusinessError("AUTH_INVALID_OTP")
    if (challenge.status === "COMPLETED")
      return { error: "AUTH_CHALLENGE_USED" as const, status: 409 }
    if (challenge.status !== "PENDING" || challenge.expiresAt <= new Date())
      return rejectInactiveEmailChallenge(tx, challenge)
    if (!challenge.otpHash) throw new BusinessError("AUTH_INVALID_OTP")
    const valid =
      /^\d{6}$/.test(input.otp) &&
      safeEqual(challenge.otpHash, hashOtp(challenge.id, input.otp))
    if (!valid) {
      const attempts = challenge.attempts + 1
      await tx.loginChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts,
          status: attempts >= challenge.maxAttempts ? "LOCKED" : "PENDING",
        },
      })
      if (challenge.purpose === "ADMIN_LOGIN")
        await tx.auditLog.create({
          data: {
            actorType: "SYSTEM",
            action: "ADMIN_LOGIN_INVALID_OTP",
            entityType: "LoginChallenge",
            entityId: challenge.id,
            metadataJson: JSON.stringify({ attempts }),
            correlationId: correlationId(),
          },
        })
      return { error: "AUTH_INVALID_OTP" as const, status: 400 }
    }
    return completeEmailChallenge(tx, challenge, {
      currentUserId: input.currentUserId,
      userAgentHash: input.userAgentHash,
      ipPrefixHash: input.ipPrefixHash,
      incrementAttempts: true,
    })
  })
  if ("error" in outcome && outcome.error)
    throw new BusinessError(outcome.error, outcome.status)
  return outcome.value
}

export async function consumeEmailMagicLink(input: {
  challengeId: string
  rawMagicLinkToken: string
  browserState: string
  currentUserId?: string
  userAgentHash?: string
  ipPrefixHash?: string
}) {
  const outcome = await authTransaction(async (tx) => {
    const challenge = await tx.loginChallenge.findUnique({
      where: { magicLinkTokenHash: hashToken(input.rawMagicLinkToken) },
    })
    if (!challenge || challenge.channel !== "EMAIL")
      throw new BusinessError("AUTH_CHALLENGE_EXPIRED")
    if (
      challenge.id !== input.challengeId ||
      !verifyEmailBrowserState(challenge.id, input.browserState)
    )
      throw new BusinessError("AUTH_BROWSER_MISMATCH", 403)
    if (challenge.status === "COMPLETED")
      return { error: "AUTH_CHALLENGE_USED" as const, status: 409 }
    if (challenge.status !== "PENDING" || challenge.expiresAt <= new Date())
      return rejectInactiveEmailChallenge(tx, challenge)
    return completeEmailChallenge(tx, challenge, {
      currentUserId: input.currentUserId,
      userAgentHash: input.userAgentHash,
      ipPrefixHash: input.ipPrefixHash,
      incrementAttempts: false,
    })
  })
  if ("error" in outcome && outcome.error)
    throw new BusinessError(outcome.error, outcome.status)
  return outcome.value
}

export async function requestTelegramChallenge(input: {
  purpose?: ChallengePurpose
  requestedByUserId?: string
  inviteCode?: string
  ipHash?: string
}) {
  const purpose = input.purpose ?? "USER_LOGIN"
  const username = getConfig().telegram.botUsername
  if (!username)
    throw new BusinessError("INTEGRATION_TEMPORARILY_UNAVAILABLE", 503)
  if (input.ipHash) {
    const allowed = await authTransaction((tx) =>
      consumeRateLimit(
        tx,
        `${purpose === "ADMIN_LOGIN" ? "admin-telegram" : "telegram"}:start:${input.ipHash}`,
        15 * MINUTE,
        purpose === "ADMIN_LOGIN" ? 3 : 10
      )
    )
    if (!allowed) {
      if (purpose === "ADMIN_LOGIN")
        await db.auditLog.create({
          data: {
            actorType: "SYSTEM",
            action: "ADMIN_TELEGRAM_LOGIN_RATE_LIMITED",
            entityType: "Authentication",
            metadataJson: JSON.stringify({ ipHash: input.ipHash }),
            correlationId: correlationId(),
          },
        })
      throw new BusinessError("AUTH_RATE_LIMITED", 429)
    }
  }
  const rawToken = randomToken(24)
  const challenge = await withBusyRetry(
    () =>
      db.loginChallenge.create({
        data: {
          channel: "TELEGRAM",
          purpose,
          requestedByUserId: input.requestedByUserId,
          inviteCodeSnapshot: input.inviteCode?.slice(0, 100),
          telegramStartTokenHash: hashToken(rawToken),
          requestedIpHash: input.ipHash,
          expiresAt: new Date(Date.now() + 5 * MINUTE),
        },
      }),
    6
  )
  return {
    challengeId: challenge.id,
    url: `https://t.me/${username}?start=${rawToken}`,
  }
}

type TelegramStartCredential =
  | { rawStartToken: string; startTokenHash?: never }
  | { startTokenHash: string; rawStartToken?: never }

export async function completeTelegramStart(
  input: TelegramStartCredential & {
    telegramId: string
    username?: string
    chatId?: string
  }
) {
  const startTokenHash = input.startTokenHash ?? hashToken(input.rawStartToken)
  if (input.chatId && input.chatId !== input.telegramId)
    throw new BusinessError("AUTH_FORBIDDEN", 403)
  if (input.telegramId !== getConfig().admin.telegramId) {
    const possibleAdminChallenge = await db.loginChallenge.findUnique({
      where: { telegramStartTokenHash: startTokenHash },
    })
    if (possibleAdminChallenge?.purpose === "ADMIN_LOGIN")
      await db.auditLog.create({
        data: {
          actorType: "SYSTEM",
          action: "ADMIN_TELEGRAM_LOGIN_REJECTED",
          entityType: "LoginChallenge",
          entityId: possibleAdminChallenge.id,
          correlationId: correlationId(),
        },
      })
  }
  return authTransaction(async (tx) => {
    const challenge = await tx.loginChallenge.findUnique({
      where: { telegramStartTokenHash: startTokenHash },
    })
    if (
      !challenge ||
      challenge.channel !== "TELEGRAM" ||
      challenge.status !== "PENDING"
    )
      throw new BusinessError("AUTH_CHALLENGE_EXPIRED")
    if (challenge.expiresAt <= new Date())
      throw new BusinessError("AUTH_CHALLENGE_EXPIRED")
    if (
      challenge.purpose === "ADMIN_LOGIN" &&
      input.telegramId !== getConfig().admin.telegramId
    )
      throw new BusinessError("ADMIN_FORBIDDEN", 403)
    let identity = await tx.authIdentity.findUnique({
      where: { telegramId: input.telegramId },
    })
    let userId: string
    if (challenge.purpose === "LINK_TELEGRAM") {
      if (!challenge.requestedByUserId)
        throw new BusinessError("AUTH_FORBIDDEN")
      if (identity && identity.userId !== challenge.requestedByUserId)
        throw new BusinessError("AUTH_IDENTITY_IN_USE", 409)
      userId = challenge.requestedByUserId
    } else if (identity) userId = identity.userId
    else {
      if (challenge.purpose === "ADMIN_LOGIN")
        throw new BusinessError("ADMIN_FORBIDDEN", 403)
      const user = await createUserGraph(tx, { isTest: getConfig().testMode })
      userId = user.id
      await applyReferralOnRegistration(tx, {
        invitedUserId: userId,
        inviteCode: challenge.inviteCodeSnapshot,
      })
    }
    if (!identity)
      identity = await tx.authIdentity.create({
        data: {
          userId,
          provider: "TELEGRAM",
          providerSubject: input.telegramId,
          telegramId: input.telegramId,
          telegramUsername: input.username,
          verifiedAt: new Date(),
        },
      })
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    if (user.isTest !== getConfig().testMode)
      throw new BusinessError("AUTH_FORBIDDEN", 403)
    await tx.telegramProfile.upsert({
      where: { userId },
      create: {
        userId,
        telegramId: input.telegramId,
        username: input.username,
        chatId: input.chatId,
        botStartedAt: new Date(),
      },
      update: {
        username: input.username,
        chatId: input.chatId,
        canReceiveMessages: true,
        botStartedAt: new Date(),
        botBlockedAt: null,
      },
    })
    const completionToken = randomToken(32)
    const completionPayload =
      challenge.purpose === "LINK_TELEGRAM"
        ? {
            type: "SEND_TELEGRAM_LINK_CONFIRMED",
            payload: { chatId: input.chatId },
          }
        : {
            type: "SEND_TELEGRAM_LOGIN_COMPLETION",
            payload: {
              chatId: input.chatId,
              tokenEncrypted: encryptSensitive(completionToken),
            },
          }
    await tx.loginChallenge.update({
      where: { id: challenge.id },
      data: {
        status: "COMPLETED",
        consumedAt: new Date(),
        telegramId: input.telegramId,
        telegramStartTokenHash: null,
        completionTokenHash:
          challenge.purpose === "LINK_TELEGRAM"
            ? null
            : hashToken(completionToken),
      },
    })
    if (input.chatId)
      await tx.outboxJob.create({
        data: {
          type: completionPayload.type,
          aggregateType: "LoginChallenge",
          aggregateId: challenge.id,
          payloadJson: JSON.stringify(completionPayload.payload),
          dedupeKey: `telegram-challenge-result:${challenge.id}`,
          maxAttempts: 8,
        },
      })
    return {
      userId,
      completionToken:
        challenge.purpose === "LINK_TELEGRAM" ? null : completionToken,
      linked: challenge.purpose === "LINK_TELEGRAM",
    }
  })
}

export async function consumeTelegramCompletion(input: {
  rawCompletionToken: string
  challengeId: string
  browserState: string
  userAgentHash?: string
  ipPrefixHash?: string
}) {
  return authTransaction(async (tx) => {
    const challenge = await tx.loginChallenge.findUnique({
      where: { completionTokenHash: hashToken(input.rawCompletionToken) },
    })
    if (!challenge) throw new BusinessError("AUTH_CHALLENGE_EXPIRED")
    if (
      challenge.id !== input.challengeId ||
      !verifyTelegramBrowserState(challenge.id, input.browserState)
    )
      throw new BusinessError("AUTH_BROWSER_MISMATCH", 403)
    if (
      !challenge.telegramId ||
      !challenge.consumedAt ||
      Date.now() - challenge.consumedAt.getTime() > 5 * MINUTE
    )
      throw new BusinessError("AUTH_CHALLENGE_EXPIRED")
    const identity = await tx.authIdentity.findUniqueOrThrow({
      where: { telegramId: challenge.telegramId },
      include: { user: true },
    })
    if (identity.user.status !== "ACTIVE")
      throw new BusinessError("AUTH_FORBIDDEN", 403)
    if (identity.user.isTest !== getConfig().testMode)
      throw new BusinessError("AUTH_FORBIDDEN", 403)
    const kind: SessionKind =
      challenge.purpose === "ADMIN_LOGIN" ? "ADMIN" : "USER"
    if (kind === "ADMIN" && identity.user.role !== "ADMIN")
      throw new BusinessError("ADMIN_FORBIDDEN", 403)
    const rawSession = await createSession(tx, {
      userId: identity.userId,
      kind,
      userAgentHash: input.userAgentHash,
      ipPrefixHash: input.ipPrefixHash,
    })
    await tx.loginChallenge.update({
      where: { id: challenge.id },
      data: { completionTokenHash: null },
    })
    return { rawSession, kind, userId: identity.userId }
  })
}

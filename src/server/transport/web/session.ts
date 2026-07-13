import { cookies, headers } from "next/headers"
import { db } from "@/src/server/infrastructure/db/client"
import {
  requireSession,
  resolveSession,
  SESSION_ABSOLUTE_DAYS,
} from "@/src/server/domain/auth/session"
import { privacyHash } from "@/src/server/infrastructure/security/crypto"
import type { SessionKind } from "@/src/generated/prisma/client"
import { getConfig } from "@/src/server/config"
import {
  createEmailBrowserState,
  createTelegramBrowserState,
} from "@/src/server/domain/auth/browser-state"

export const USER_COOKIE = "pulsar_user_session"
export const ADMIN_COOKIE = "pulsar_admin_session"
const TELEGRAM_STATE_COOKIE_PREFIX = "pulsar_telegram_state_"
const TELEGRAM_STATE_MAX_AGE_SECONDS = 10 * 60
const EMAIL_STATE_COOKIE_PREFIX = "pulsar_email_state_"
const EMAIL_STATE_MAX_AGE_SECONDS = 5 * 60

function hostCookieName(base: string) {
  return getConfig().appEnv === "production" ? `__Host-${base}` : base
}

function sessionCookieName(kind: SessionKind) {
  const base = kind === "ADMIN" ? ADMIN_COOKIE : USER_COOKIE
  return hostCookieName(base)
}

function telegramStateCookieName(challengeId: string) {
  return hostCookieName(`${TELEGRAM_STATE_COOKIE_PREFIX}${challengeId}`)
}

function emailStateCookieName(challengeId: string) {
  return hostCookieName(`${EMAIL_STATE_COOKIE_PREFIX}${challengeId}`)
}

export async function requestFingerprint() {
  const values = await headers()
  const forwarded =
    values.get("x-real-ip")?.trim() ??
    values.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
    "unknown"
  const prefix = forwarded.includes(":")
    ? forwarded.split(":").slice(0, 4).join(":")
    : forwarded.split(".").slice(0, 3).join(".")
  return {
    userAgentHash: privacyHash(values.get("user-agent") ?? "unknown"),
    ipHash: privacyHash(forwarded),
    ipPrefixHash: privacyHash(prefix),
  }
}

export async function setSessionCookie(rawToken: string, kind: SessionKind) {
  const jar = await cookies()
  jar.set(sessionCookieName(kind), rawToken, {
    httpOnly: true,
    secure: getConfig().appEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_ABSOLUTE_DAYS * 86400,
  })
}

export async function clearSessionCookie(kind: SessionKind) {
  ;(await cookies()).delete(sessionCookieName(kind))
}

export async function setEmailChallengeCookie(challengeId: string) {
  ;(await cookies()).set(
    emailStateCookieName(challengeId),
    createEmailBrowserState(challengeId),
    {
      httpOnly: true,
      secure: getConfig().appEnv === "production",
      sameSite: "lax",
      path: "/",
      maxAge: EMAIL_STATE_MAX_AGE_SECONDS,
    }
  )
}

export async function getEmailChallengeCookie(challengeId: string) {
  return (await cookies()).get(emailStateCookieName(challengeId))?.value
}

export async function clearEmailChallengeCookie(challengeId: string) {
  ;(await cookies()).set(emailStateCookieName(challengeId), "", {
    httpOnly: true,
    secure: getConfig().appEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
}

export async function setTelegramChallengeCookie(challengeId: string) {
  const jar = await cookies()
  jar.set(
    telegramStateCookieName(challengeId),
    createTelegramBrowserState(challengeId),
    {
      httpOnly: true,
      secure: getConfig().appEnv === "production",
      sameSite: "lax",
      path: "/",
      maxAge: TELEGRAM_STATE_MAX_AGE_SECONDS,
    }
  )
}

export async function getTelegramChallengeCookie(challengeId: string) {
  return (await cookies()).get(telegramStateCookieName(challengeId))?.value
}

export async function clearTelegramChallengeCookie(challengeId: string) {
  ;(await cookies()).set(telegramStateCookieName(challengeId), "", {
    httpOnly: true,
    secure: getConfig().appEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
}

export async function getSession(kind: SessionKind) {
  const jar = await cookies()
  return resolveSession(db, jar.get(sessionCookieName(kind))?.value, kind)
}
export async function requireWebSession(kind: SessionKind) {
  const jar = await cookies()
  return requireSession(db, jar.get(sessionCookieName(kind))?.value, kind)
}

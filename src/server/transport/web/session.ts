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

export const USER_COOKIE = "pulsar_user_session"
export const ADMIN_COOKIE = "pulsar_admin_session"

function hostCookieName(base: string) {
  return getConfig().appEnv === "production" ? `__Host-${base}` : base
}

function sessionCookieName(kind: SessionKind) {
  const base = kind === "ADMIN" ? ADMIN_COOKIE : USER_COOKIE
  return hostCookieName(base)
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

export async function getSession(kind: SessionKind) {
  const jar = await cookies()
  return resolveSession(db, jar.get(sessionCookieName(kind))?.value, kind)
}
export async function requireWebSession(kind: SessionKind) {
  const jar = await cookies()
  return requireSession(db, jar.get(sessionCookieName(kind))?.value, kind)
}

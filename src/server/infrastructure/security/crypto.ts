import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"
import { getConfig } from "@/src/server/config"

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url")
}

export function hashToken(raw: string) {
  return createHmac("sha256", getConfig().sessionSecret)
    .update(raw)
    .digest("hex")
}

export function hashOtp(challengeId: string, otp: string) {
  return createHmac("sha256", getConfig().authPepper)
    .update(`${challengeId}:${otp}`)
    .digest("hex")
}

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function privacyHash(value: string) {
  return createHmac("sha256", getConfig().authPepper)
    .update(value)
    .digest("hex")
}

export function correlationId() {
  return randomBytes(12).toString("hex")
}

export function encryptSensitive(plainText: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getConfig().encryptionKey, iv)
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ])
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".")
}

export function decryptSensitive(value: string) {
  const [version, iv, tag, encrypted] = value.split(".")
  if (version !== "v1" || !iv || !tag || !encrypted)
    throw new Error("Invalid encrypted value")
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getConfig().encryptionKey,
    Buffer.from(iv, "base64url")
  )
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

export function stableEventId(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

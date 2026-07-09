import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

export function createRandomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url")
}

export function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

export function hashOtp(email: string, code: string) {
  const secret = process.env.SESSION_SECRET ?? "dev-session-secret"

  return hashValue(`${email.toLowerCase()}:${code}:${secret}`)
}

export function timingSafeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function createOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

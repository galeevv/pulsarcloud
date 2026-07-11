import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"

import { IntegrationError } from "@/lib/application-errors"

type SealedPayload = {
  iv: string
  tag: string
  ciphertext: string
}

export function sealJobPayload(value: unknown): SealedPayload {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ])

  return {
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  }
}

export function openJobPayload<T>(payload: SealedPayload): T {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getKey(),
      Buffer.from(payload.iv, "base64url")
    )
    decipher.setAuthTag(Buffer.from(payload.tag, "base64url"))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64url")),
      decipher.final(),
    ])
    return JSON.parse(plaintext.toString("utf8")) as T
  } catch (error) {
    throw new IntegrationError(
      "Encrypted job payload could not be opened.",
      {},
      {
        cause: error,
      }
    )
  }
}

function getKey() {
  const secret = process.env.JOB_PAYLOAD_SECRET ?? process.env.SESSION_SECRET
  if (
    !secret ||
    (process.env.NODE_ENV === "production" && secret.length < 32)
  ) {
    throw new IntegrationError(
      "JOB_PAYLOAD_SECRET (or SESSION_SECRET) must contain at least 32 characters."
    )
  }
  return createHash("sha256").update(secret).digest()
}

import {
  hashToken,
  randomToken,
  safeEqual,
} from "@/src/server/infrastructure/security/crypto"

const STATE_VERSION = "v1"
const STATE_NONCE_PATTERN = /^[A-Za-z0-9_-]{32}$/
const STATE_SIGNATURE_PATTERN = /^[a-f0-9]{64}$/
type BrowserStateKind = "email" | "telegram"

function signature(kind: BrowserStateKind, challengeId: string, nonce: string) {
  return hashToken(`${kind}-browser-state:${challengeId}:${nonce}`)
}

function createBrowserState(kind: BrowserStateKind, challengeId: string) {
  const nonce = randomToken(24)
  return `${STATE_VERSION}.${nonce}.${signature(kind, challengeId, nonce)}`
}

function verifyBrowserState(
  kind: BrowserStateKind,
  challengeId: string,
  candidate: string | undefined
) {
  if (!candidate) return false
  const [version, nonce, receivedSignature, extra] = candidate.split(".")
  if (
    version !== STATE_VERSION ||
    !nonce ||
    !STATE_NONCE_PATTERN.test(nonce) ||
    !receivedSignature ||
    !STATE_SIGNATURE_PATTERN.test(receivedSignature) ||
    extra !== undefined
  )
    return false
  return safeEqual(signature(kind, challengeId, nonce), receivedSignature)
}

export function createEmailBrowserState(challengeId: string) {
  return createBrowserState("email", challengeId)
}

export function verifyEmailBrowserState(
  challengeId: string,
  candidate: string | undefined
) {
  return verifyBrowserState("email", challengeId, candidate)
}

export function createTelegramBrowserState(challengeId: string) {
  return createBrowserState("telegram", challengeId)
}

export function verifyTelegramBrowserState(
  challengeId: string,
  candidate: string | undefined
) {
  return verifyBrowserState("telegram", challengeId, candidate)
}

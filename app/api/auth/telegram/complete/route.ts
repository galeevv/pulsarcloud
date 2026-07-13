import { NextResponse } from "next/server"
import { BusinessError } from "@/src/server/application/errors"
import { consumeTelegramCompletion } from "@/src/server/domain/auth/service"
import {
  clearTelegramChallengeCookie,
  getTelegramChallengeCookie,
  requestFingerprint,
  setSessionCookie,
} from "@/src/server/transport/web/session"
import { getConfig } from "@/src/server/config"

const challengeIdPattern = /^[A-Za-z0-9_-]{8,128}$/

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams
    const token = searchParams.get("token") ?? ""
    const challengeId = searchParams.get("challenge") ?? ""
    if (!challengeIdPattern.test(challengeId))
      throw new BusinessError("AUTH_BROWSER_MISMATCH", 403)
    const browserState = await getTelegramChallengeCookie(challengeId)
    if (!browserState) throw new BusinessError("AUTH_BROWSER_MISMATCH", 403)
    const fingerprint = await requestFingerprint()
    const result = await consumeTelegramCompletion({
      rawCompletionToken: token,
      challengeId,
      browserState,
      userAgentHash: fingerprint.userAgentHash,
      ipPrefixHash: fingerprint.ipPrefixHash,
    })
    await setSessionCookie(result.rawSession, result.kind)
    await clearTelegramChallengeCookie(challengeId)
    return NextResponse.redirect(
      `${getConfig().appUrl}${result.kind === "ADMIN" ? "/admin" : "/home"}`
    )
  } catch (error) {
    const reason =
      error instanceof BusinessError && error.code === "AUTH_BROWSER_MISMATCH"
        ? "device"
        : "used"
    return NextResponse.redirect(
      `${getConfig().appUrl}/auth/verify?error=${reason}`
    )
  }
}

import { NextResponse } from "next/server"
import { BusinessError } from "@/src/server/application/errors"
import { consumeTelegramCompletion } from "@/src/server/domain/auth/service"
import {
  requestFingerprint,
  setSessionCookie,
} from "@/src/server/transport/web/session"
import { getConfig } from "@/src/server/config"

const challengeIdPattern = /^[A-Za-z0-9_-]{8,128}$/
const userReturnPaths = new Set(["/home", "/referrals", "/support"])

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams
    const token = searchParams.get("token") ?? ""
    const challengeId = searchParams.get("challenge") ?? ""
    const requestedReturnTo = searchParams.get("returnTo") ?? "/home"
    if (!challengeIdPattern.test(challengeId))
      throw new BusinessError("AUTH_CHALLENGE_EXPIRED")
    const fingerprint = await requestFingerprint()
    const result = await consumeTelegramCompletion({
      rawCompletionToken: token,
      challengeId,
      userAgentHash: fingerprint.userAgentHash,
      ipPrefixHash: fingerprint.ipPrefixHash,
    })
    await setSessionCookie(result.rawSession, result.kind)
    const returnTo =
      result.kind === "ADMIN"
        ? "/admin/dashboard"
        : userReturnPaths.has(requestedReturnTo)
          ? requestedReturnTo
          : "/home"
    return NextResponse.redirect(
      `${getConfig().appUrl}${returnTo}`
    )
  } catch {
    return NextResponse.redirect(
      `${getConfig().appUrl}/auth/verify?error=expired`
    )
  }
}

import { NextResponse } from "next/server"

import { BusinessError } from "@/src/server/application/errors"
import { getConfig } from "@/src/server/config"
import { consumeEmailMagicLink } from "@/src/server/domain/auth/service"
import {
  getSession,
  requestFingerprint,
  setSessionCookie,
} from "@/src/server/transport/web/session"

const challengeIdPattern = /^[A-Za-z0-9_-]{8,128}$/
const tokenPattern = /^[A-Za-z0-9_-]{32,128}$/

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams
    const challengeId = searchParams.get("challenge") ?? ""
    const token = searchParams.get("token") ?? ""
    if (!challengeIdPattern.test(challengeId) || !tokenPattern.test(token))
      throw new BusinessError("AUTH_CHALLENGE_EXPIRED")
    const [fingerprint, currentUser] = await Promise.all([
      requestFingerprint(),
      getSession("USER"),
    ])
    const result = await consumeEmailMagicLink({
      challengeId,
      rawMagicLinkToken: token,
      currentUserId: currentUser?.userId,
      userAgentHash: fingerprint.userAgentHash,
      ipPrefixHash: fingerprint.ipPrefixHash,
    })
    if (result.rawSession)
      await setSessionCookie(result.rawSession, result.kind)
    const destination = result.linked
      ? "/profile"
      : result.kind === "ADMIN"
        ? "/admin"
        : "/home"
    return NextResponse.redirect(`${getConfig().appUrl}${destination}`)
  } catch (error) {
    const reason =
      error instanceof BusinessError && error.code === "AUTH_CHALLENGE_USED"
        ? "used"
        : "expired"
    return NextResponse.redirect(
      `${getConfig().appUrl}/auth/verify?error=${reason}`
    )
  }
}

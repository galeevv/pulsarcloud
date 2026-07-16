import { z } from "zod"
import { verifyEmailChallenge } from "@/src/server/domain/auth/service"
import {
  requireSameOrigin,
  routeErrorResponse,
} from "@/src/server/transport/http/security"
import {
  getSession,
  requestFingerprint,
  setSessionCookie,
} from "@/src/server/transport/web/session"

const verifySchema = z.object({
  challengeId: z.string().min(1).max(200),
  otp: z.string().regex(/^\d{6}$/),
})

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    const body = verifySchema.parse(await request.json())
    const fingerprint = await requestFingerprint()
    const currentUser = await getSession("USER")
    const result = await verifyEmailChallenge({
      ...body,
      currentUserId: currentUser?.userId,
      userAgentHash: fingerprint.userAgentHash,
      ipPrefixHash: fingerprint.ipPrefixHash,
    })
    if (result.rawSession)
      await setSessionCookie(result.rawSession, result.kind)
    return Response.json({
      ok: true,
      redirectTo: result.kind === "ADMIN" ? "/admin/dashboard" : "/home",
      linked: result.linked,
    })
  } catch (error) {
    return routeErrorResponse(error)
  }
}

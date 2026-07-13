import { z } from "zod"
import { requestEmailChallenge } from "@/src/server/domain/auth/service"
import {
  requireSameOrigin,
  routeErrorResponse,
} from "@/src/server/transport/http/security"
import {
  requestFingerprint,
  requireWebSession,
  setEmailChallengeCookie,
} from "@/src/server/transport/web/session"

const requestSchema = z.object({
  email: z.email().max(254),
  invite: z.string().max(100).optional(),
  purpose: z.enum(["USER_LOGIN", "ADMIN_LOGIN", "LINK_EMAIL"]).optional(),
})

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    const body = requestSchema.parse(await request.json())
    const requestedByUserId =
      body.purpose === "LINK_EMAIL"
        ? (await requireWebSession("USER")).userId
        : undefined
    const fingerprint = await requestFingerprint()
    const result = await requestEmailChallenge({
      email: body.email,
      purpose: body.purpose,
      requestedByUserId,
      inviteCode: body.invite,
      ipHash: fingerprint.ipHash,
      userAgentHash: fingerprint.userAgentHash,
    })
    await setEmailChallengeCookie(result.challengeId)
    return Response.json(result)
  } catch (error) {
    return routeErrorResponse(error)
  }
}

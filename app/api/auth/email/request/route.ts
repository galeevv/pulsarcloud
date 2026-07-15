import { z } from "zod"
import { getConfig } from "@/src/server/config"
import { requestEmailChallenge } from "@/src/server/domain/auth/service"
import {
  requireSameOrigin,
  routeErrorResponse,
} from "@/src/server/transport/http/security"
import {
  requestFingerprint,
  requireWebSession,
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
    return Response.json({
      challengeId: result.challengeId,
      expiresAt: result.expiresAt,
      ...(getConfig().localAuthAdaptersEnabled && result.devOtp
        ? { devOtp: result.devOtp }
        : {}),
    })
  } catch (error) {
    return routeErrorResponse(error)
  }
}

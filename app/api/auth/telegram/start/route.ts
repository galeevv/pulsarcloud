import { z } from "zod"
import { requestTelegramChallenge } from "@/src/server/domain/auth/service"
import {
  requireSameOrigin,
  routeErrorResponse,
} from "@/src/server/transport/http/security"
import {
  requestFingerprint,
  requireWebSession,
} from "@/src/server/transport/web/session"

const startSchema = z.object({
  invite: z.string().max(100).optional(),
  purpose: z.enum(["USER_LOGIN", "ADMIN_LOGIN", "LINK_TELEGRAM"]).optional(),
})

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    const body = startSchema.parse(await request.json())
    const requestedByUserId =
      body.purpose === "LINK_TELEGRAM"
        ? (await requireWebSession("USER")).userId
        : undefined
    const fingerprint = await requestFingerprint()
    const challenge = await requestTelegramChallenge({
      purpose: body.purpose,
      requestedByUserId,
      inviteCode: body.invite,
      ipHash: fingerprint.ipHash,
    })
    return Response.json(challenge)
  } catch (error) {
    return routeErrorResponse(error)
  }
}

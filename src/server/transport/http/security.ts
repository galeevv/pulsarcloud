import { ZodError } from "zod"
import { BusinessError, toFriendlyError } from "@/src/server/application/errors"
import { getConfig } from "@/src/server/config"
import { logger } from "@/src/server/infrastructure/logging/logger"

export function requireSameOrigin(
  request: Request,
  options: { requireJson?: boolean } = {}
) {
  const expectedOrigin = new URL(getConfig().appUrl).origin
  const origin = request.headers.get("origin")
  const fetchSite = request.headers.get("sec-fetch-site")
  if (
    !origin ||
    origin !== expectedOrigin ||
    (fetchSite && fetchSite !== "same-origin")
  )
    throw new BusinessError("AUTH_FORBIDDEN", 403)
  if (
    options.requireJson !== false &&
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  )
    throw new BusinessError("INVALID_INPUT", 415)
}

export function routeErrorResponse(error: unknown) {
  if (error instanceof BusinessError) {
    const friendly = toFriendlyError(error)
    return Response.json(
      { error: friendly.code, message: friendly.message },
      { status: error.status }
    )
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    const friendly = toFriendlyError(new BusinessError("INVALID_INPUT"))
    return Response.json(
      { error: friendly.code, message: friendly.message },
      { status: 400 }
    )
  }
  logger.error("route handler failed", {
    error: error instanceof Error ? error.message : String(error),
  })
  const friendly = toFriendlyError(error)
  return Response.json(
    { error: friendly.code, message: friendly.message },
    { status: 500 }
  )
}

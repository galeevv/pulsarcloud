import { routeErrorResponse } from "@/src/server/transport/http/security"
import { requireWebSession } from "@/src/server/transport/web/session"
import { db } from "@/src/server/infrastructure/db/client"

export async function GET() {
  try {
    const session = await requireWebSession("USER")
    const subscription = await db.subscription.findUnique({
      where: { userId: session.userId },
      select: {
        status: true,
        expiresAt: true,
        syncStatus: true,
        subscriptionUrl: true,
        deviceLimit: true,
      },
    })

    return Response.json(
      {
        subscription: subscription
          ? {
              ...subscription,
              hasSubscriptionUrl: Boolean(subscription.subscriptionUrl),
              subscriptionUrl: undefined,
            }
          : null,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error) {
    return routeErrorResponse(error)
  }
}

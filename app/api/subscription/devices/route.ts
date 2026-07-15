import { z } from "zod"

import {
  deleteSubscriptionDevice,
  getSubscriptionDevices,
} from "@/src/server/domain/subscriptions/service"
import {
  requireSameOrigin,
  routeErrorResponse,
} from "@/src/server/transport/http/security"
import { requireWebSession } from "@/src/server/transport/web/session"

const deleteDeviceSchema = z.object({
  hwid: z.string().trim().min(1).max(256),
})

function publicDevice(
  device: Awaited<ReturnType<typeof getSubscriptionDevices>>[number]
) {
  return {
    hwid: device.hwid,
    platform: device.platform,
    osVersion: device.osVersion,
    deviceModel: device.deviceModel,
    userAgent: device.userAgent,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  }
}

export async function GET() {
  try {
    const session = await requireWebSession("USER")
    const devices = await getSubscriptionDevices(session.userId)
    return Response.json(
      { devices: devices.map(publicDevice) },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error) {
    return routeErrorResponse(error)
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request)
    const session = await requireWebSession("USER")
    const body = deleteDeviceSchema.parse(await request.json())
    const devices = await deleteSubscriptionDevice({
      userId: session.userId,
      hwid: body.hwid,
    })
    return Response.json({ devices: devices.map(publicDevice) })
  } catch (error) {
    return routeErrorResponse(error)
  }
}

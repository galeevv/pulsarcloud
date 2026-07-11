import { ConflictError } from "@/lib/application-errors"

type PaidEntitlement = {
  deviceLimit: number
  lteEnabled: boolean
}

export function assertDeviceLimitCoveredByPayment(
  currentDeviceLimit: number,
  requestedDeviceLimit: number,
  paidEntitlement?: PaidEntitlement
) {
  if (requestedDeviceLimit <= currentDeviceLimit) {
    return
  }

  if (!paidEntitlement || requestedDeviceLimit > paidEntitlement.deviceLimit) {
    throw new ConflictError(
      "Increasing device limit requires a successful payment."
    )
  }
}

export function assertLteCoveredByPayment(
  currentEnabled: boolean,
  requestedEnabled: boolean,
  paidEntitlement?: PaidEntitlement
) {
  if (!requestedEnabled || currentEnabled) {
    return
  }

  if (!paidEntitlement?.lteEnabled) {
    throw new ConflictError("Enabling LTE requires a successful payment.")
  }
}

import { ForbiddenError } from "@/lib/application-errors"

export function areTestPaymentsEnabled() {
  return process.env.ENABLE_TEST_PAYMENTS === "true"
}

export function assertTestPaymentsEnabled() {
  if (!areTestPaymentsEnabled()) {
    throw new ForbiddenError("Test payments are disabled.")
  }
}

export type RemnawaveSubscriptionInput = {
  userId: string
  email: string | null
  deviceLimit: number
  lteEnabled: boolean
}

export type RemnawaveSubscriptionResult = {
  remnawaveUserId: string
  subscriptionUrl: string
}

export interface RemnawaveClient {
  createOrUpdateUser(
    input: RemnawaveSubscriptionInput
  ): Promise<RemnawaveSubscriptionResult>
  revokeSubscription(remnawaveUserId: string): Promise<void>
  regenerateSubscriptionUrl(
    remnawaveUserId: string
  ): Promise<{ subscriptionUrl: string }>
  updateDeviceLimit(remnawaveUserId: string, deviceLimit: number): Promise<void>
  enableLte(remnawaveUserId: string): Promise<void>
  disableLte(remnawaveUserId: string): Promise<void>
  syncSubscription(
    input: RemnawaveSubscriptionInput & { remnawaveUserId?: string | null }
  ): Promise<RemnawaveSubscriptionResult>
}

export class MockRemnawaveClient implements RemnawaveClient {
  async createOrUpdateUser(input: RemnawaveSubscriptionInput) {
    return this.buildResult(input.userId)
  }

  async revokeSubscription() {
    return
  }

  async regenerateSubscriptionUrl(remnawaveUserId: string) {
    return {
      subscriptionUrl: `https://pulsarr.space/sub/${remnawaveUserId}-${Date.now()}`,
    }
  }

  async updateDeviceLimit() {
    return
  }

  async enableLte() {
    return
  }

  async disableLte() {
    return
  }

  async syncSubscription(
    input: RemnawaveSubscriptionInput & { remnawaveUserId?: string | null }
  ) {
    return this.buildResult(input.remnawaveUserId ?? input.userId)
  }

  private buildResult(seed: string) {
    const remnawaveUserId = seed.startsWith("mock-rw-")
      ? seed
      : `mock-rw-${seed}`

    return {
      remnawaveUserId,
      subscriptionUrl: `https://pulsarr.space/sub/${remnawaveUserId}`,
    }
  }
}

export function createRemnawaveClient(): RemnawaveClient {
  return new MockRemnawaveClient()
}

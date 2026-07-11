import { createHash } from "node:crypto"

import { z } from "zod"

import { IntegrationError } from "@/lib/application-errors"

export type RemnawaveSubscriptionInput = {
  userId: string
  email: string | null
  telegramId?: string | null
  expiresAt: Date
  deviceLimit: number
  lteEnabled: boolean
}

export type RemnawaveSubscriptionResult = {
  remnawaveUserId: string
  subscriptionUrl: string
}

export type RemnawaveDevice = {
  hwid: string
  platform: string | null
  osVersion: string | null
  deviceModel: string | null
  createdAt: string
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
  listDevices(remnawaveUserId: string): Promise<RemnawaveDevice[]>
  deleteDevice(remnawaveUserId: string, hwid: string): Promise<void>
}

const userResponseSchema = z.object({
  response: z.object({
    uuid: z.string().uuid(),
    subscriptionUrl: z.string().url(),
  }),
})

const devicesResponseSchema = z.object({
  response: z.object({
    devices: z.array(
      z.object({
        hwid: z.string(),
        platform: z.string().nullable(),
        osVersion: z.string().nullable(),
        deviceModel: z.string().nullable(),
        createdAt: z.string(),
      })
    ),
  }),
})

export class HttpRemnawaveClient implements RemnawaveClient {
  async createOrUpdateUser(input: RemnawaveSubscriptionInput) {
    const uuid = stableRemnawaveUuid(input.userId)
    const body = userBody(input, uuid)

    const existing = await this.request(`/api/users/${uuid}`, {
      allowNotFound: true,
    })
    const result = existing
      ? await this.request("/api/users", { method: "PATCH", body })
      : await this.request("/api/users", { method: "POST", body })

    return parseUser(result)
  }

  async syncSubscription(
    input: RemnawaveSubscriptionInput & { remnawaveUserId?: string | null }
  ) {
    const uuid = input.remnawaveUserId ?? stableRemnawaveUuid(input.userId)
    const result = await this.request("/api/users", {
      method: "PATCH",
      body: userBody(input, uuid),
    })
    return parseUser(result)
  }

  async revokeSubscription(remnawaveUserId: string) {
    await this.request(`/api/users/${remnawaveUserId}/actions/revoke`, {
      method: "POST",
      body: { revokeOnlyPasswords: false },
    })
  }

  async regenerateSubscriptionUrl(remnawaveUserId: string) {
    await this.revokeSubscription(remnawaveUserId)
    const result = await this.request(`/api/users/${remnawaveUserId}`)
    return { subscriptionUrl: parseUser(result).subscriptionUrl }
  }

  async updateDeviceLimit(remnawaveUserId: string, deviceLimit: number) {
    await this.request("/api/users", {
      method: "PATCH",
      body: { uuid: remnawaveUserId, hwidDeviceLimit: deviceLimit },
    })
  }

  async enableLte(remnawaveUserId: string) {
    await this.updateSquads(remnawaveUserId, true)
  }

  async disableLte(remnawaveUserId: string) {
    await this.updateSquads(remnawaveUserId, false)
  }

  async listDevices(remnawaveUserId: string) {
    const result = await this.request(`/api/hwid/devices/${remnawaveUserId}`)
    const parsed = devicesResponseSchema.safeParse(result)
    if (!parsed.success) {
      throw new IntegrationError(
        "Remnawave returned an invalid devices response."
      )
    }
    return parsed.data.response.devices
  }

  async deleteDevice(remnawaveUserId: string, hwid: string) {
    await this.request("/api/hwid/devices/delete", {
      method: "POST",
      body: { userUuid: remnawaveUserId, hwid },
    })
  }

  private async updateSquads(remnawaveUserId: string, lteEnabled: boolean) {
    await this.request("/api/users", {
      method: "PATCH",
      body: {
        uuid: remnawaveUserId,
        activeInternalSquads: getSquads(lteEnabled),
      },
    })
  }

  private async request(
    path: string,
    options: {
      method?: "GET" | "POST" | "PATCH"
      body?: object
      allowNotFound?: boolean
    } = {}
  ): Promise<unknown | null> {
    const baseUrl = requireEnv("REMNAWAVE_BASE_URL")
    const response = await fetch(
      new URL(path, `${baseUrl.replace(/\/$/, "")}/`),
      {
        method: options.method ?? "GET",
        headers: {
          authorization: `Bearer ${requireEnv("REMNAWAVE_API_TOKEN")}`,
          accept: "application/json",
          ...(options.body ? { "content-type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(15_000),
      }
    )

    if (response.status === 404 && options.allowNotFound) return null
    if (!response.ok) {
      throw new IntegrationError("Remnawave request failed.", {
        path,
        status: response.status,
      })
    }
    if (response.status === 204) return {}
    const text = await response.text()
    return text ? (JSON.parse(text) as unknown) : {}
  }
}

export class MockRemnawaveClient implements RemnawaveClient {
  async createOrUpdateUser(input: RemnawaveSubscriptionInput) {
    return this.buildResult(input.userId)
  }
  async revokeSubscription() {}
  async regenerateSubscriptionUrl(id: string) {
    return {
      subscriptionUrl: `https://sub.pulsar-cloud.space/${id}-${Date.now()}`,
    }
  }
  async updateDeviceLimit() {}
  async enableLte() {}
  async disableLte() {}
  async syncSubscription(
    input: RemnawaveSubscriptionInput & { remnawaveUserId?: string | null }
  ) {
    return this.buildResult(input.remnawaveUserId ?? input.userId)
  }
  async listDevices() {
    return []
  }
  async deleteDevice() {}
  private buildResult(seed: string) {
    const id = seed.startsWith("mock-rw-") ? seed : `mock-rw-${seed}`
    return {
      remnawaveUserId: id,
      subscriptionUrl: `https://sub.pulsar-cloud.space/${id}`,
    }
  }
}

export function createRemnawaveClient(): RemnawaveClient {
  return process.env.REMNAWAVE_PROVIDER === "HTTP"
    ? new HttpRemnawaveClient()
    : new MockRemnawaveClient()
}

function userBody(input: RemnawaveSubscriptionInput, uuid: string) {
  return {
    uuid,
    username: `pulsar_${input.userId}`.slice(0, 36),
    status: "ACTIVE",
    expireAt: input.expiresAt.toISOString(),
    trafficLimitBytes: 0,
    trafficLimitStrategy: "NO_RESET",
    email: input.email,
    telegramId: input.telegramId ? Number(input.telegramId) : null,
    hwidDeviceLimit: input.deviceLimit,
    activeInternalSquads: getSquads(input.lteEnabled),
    description: `Pulsar user ${input.userId}`,
    tag: "PULSAR",
  }
}

function getSquads(lteEnabled: boolean) {
  const standard = requireEnv("REMNAWAVE_STANDARD_SQUAD_UUID")
  if (!lteEnabled) return [standard]
  return [standard, requireEnv("REMNAWAVE_LTE_SQUAD_UUID")]
}

function parseUser(value: unknown) {
  const parsed = userResponseSchema.safeParse(value)
  if (!parsed.success) {
    throw new IntegrationError("Remnawave returned an invalid user response.")
  }
  return {
    remnawaveUserId: parsed.data.response.uuid,
    subscriptionUrl: parsed.data.response.subscriptionUrl,
  }
}

function stableRemnawaveUuid(userId: string) {
  const hex = createHash("sha256").update(`pulsar:${userId}`).digest("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new IntegrationError(`${name} is required.`)
  return value
}

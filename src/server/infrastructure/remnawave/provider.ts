import { createHash } from "node:crypto"
import { z } from "zod"

import { getConfig } from "@/src/server/config"
import { randomToken } from "@/src/server/infrastructure/security/crypto"

const MAX_RESPONSE_BYTES = 256 * 1024

const remoteUserEnvelopeSchema = z.object({
  response: z.object({
    uuid: z.string().uuid(),
    shortUuid: z.string().min(6),
    status: z.enum(["ACTIVE", "DISABLED", "LIMITED", "EXPIRED"]),
    expireAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
    hwidDeviceLimit: z.number().int().min(0).nullable(),
    subscriptionUrl: z.string().url(),
    activeInternalSquads: z.array(
      z.object({
        uuid: z.string().uuid(),
        name: z.string(),
      })
    ),
  }),
})

type RemoteUser = z.infer<typeof remoteUserEnvelopeSchema>["response"]
type FetchImplementation = typeof fetch

export type RemoteSubscriberState = {
  remoteUserId: string
  expiresAt: Date
  deviceLimit: number
  lteEnabled: boolean
  subscriptionUrl: string
}

export interface ProvisioningProvider {
  upsertSubscriber(input: {
    localUserId: string
    expiresAt: Date
    deviceLimit: number
    lteEnabled: boolean
  }): Promise<{ remoteUserId: string; subscriptionUrl: string }>
  updateSubscriber(input: RemoteSubscriberState): Promise<void>
  regenerateSubscriptionUrl(input: {
    remoteUserId: string
  }): Promise<{ subscriptionUrl: string }>
  getSubscriberState(remoteUserId: string): Promise<RemoteSubscriberState>
}

class MockProvisioningProvider implements ProvisioningProvider {
  async upsertSubscriber(input: { localUserId: string }) {
    return {
      remoteUserId: `mock_${input.localUserId}`,
      subscriptionUrl: `${getConfig().appUrl}/test/sub/${randomToken(18)}`,
    }
  }
  async updateSubscriber() {}
  async regenerateSubscriptionUrl() {
    return {
      subscriptionUrl: `${getConfig().appUrl}/test/sub/${randomToken(18)}`,
    }
  }
  async getSubscriberState(remoteUserId: string) {
    return {
      remoteUserId,
      expiresAt: new Date(),
      deviceLimit: 1,
      lteEnabled: false,
      subscriptionUrl: "",
    }
  }
}

export type RemnawaveHttpProviderOptions = {
  baseUrl: string
  apiToken: string
  standardSquadUuid: string
  lteSquadUuid: string
  timeoutMs?: number
  fetchImplementation?: FetchImplementation
}

export class RemnawaveHttpProvider implements ProvisioningProvider {
  private readonly baseUrl: string
  private readonly apiToken: string
  private readonly standardSquadUuid: string
  private readonly lteSquadUuid: string
  private readonly timeoutMs: number
  private readonly fetchImplementation: FetchImplementation

  constructor(options: RemnawaveHttpProviderOptions) {
    const baseUrl = new URL(options.baseUrl)
    if (!["http:", "https:"].includes(baseUrl.protocol))
      throw new Error("Remnawave base URL must use HTTP or HTTPS")
    this.baseUrl = baseUrl.toString().replace(/\/$/, "")
    this.apiToken = options.apiToken
    this.standardSquadUuid = options.standardSquadUuid
    this.lteSquadUuid = options.lteSquadUuid
    this.timeoutMs = options.timeoutMs ?? 8_000
    this.fetchImplementation = options.fetchImplementation ?? fetch
  }

  async upsertSubscriber(input: {
    localUserId: string
    expiresAt: Date
    deviceLimit: number
    lteEnabled: boolean
  }) {
    const username = this.usernameFor(input.localUserId)
    const existing = await this.findByUsername(username)
    if (existing) {
      const updated = await this.updateRemote(existing.uuid, input)
      return this.toUpsertResult(updated)
    }

    try {
      const created = await this.requestUser(
        "/api/users",
        "POST",
        {
          username,
          status: "ACTIVE",
          expireAt: input.expiresAt.toISOString(),
          trafficLimitBytes: 0,
          trafficLimitStrategy: "NO_RESET",
          hwidDeviceLimit: input.deviceLimit,
          activeInternalSquads: this.squadsFor(input.lteEnabled),
          description: `Pulsar user ${input.localUserId}`,
        },
        "create user"
      )
      return this.toUpsertResult(created)
    } catch (createError) {
      // A timeout or 409 can be ambiguous: the Panel may have committed the
      // deterministic username before the response was lost. Resolve it once
      // so a worker retry cannot create a duplicate remote user.
      try {
        const recovered = await this.findByUsername(username)
        if (recovered) {
          const updated = await this.updateRemote(recovered.uuid, input)
          return this.toUpsertResult(updated)
        }
      } catch {
        // Preserve the original create failure; lookup failures are secondary.
      }
      throw createError
    }
  }

  async updateSubscriber(input: RemoteSubscriberState) {
    await this.updateRemote(input.remoteUserId, input)
  }

  async regenerateSubscriptionUrl(input: { remoteUserId: string }) {
    const user = await this.requestUser(
      `/api/users/${encodeURIComponent(input.remoteUserId)}/actions/revoke`,
      "POST",
      {},
      "revoke subscription URL"
    )
    return { subscriptionUrl: user.subscriptionUrl }
  }

  async getSubscriberState(remoteUserId: string) {
    const user = await this.requestUser(
      `/api/users/${encodeURIComponent(remoteUserId)}`,
      "GET",
      undefined,
      "get user"
    )
    return this.toState(user)
  }

  private async findByUsername(username: string) {
    const payload = await this.request(
      `/api/users/by-username/${encodeURIComponent(username)}`,
      "GET",
      undefined,
      "find user",
      true
    )
    return payload === null ? null : this.parseUser(payload, "find user")
  }

  private async updateRemote(
    remoteUserId: string,
    input: Pick<
      RemoteSubscriberState,
      "expiresAt" | "deviceLimit" | "lteEnabled"
    >
  ) {
    return this.requestUser(
      "/api/users",
      "PATCH",
      {
        uuid: remoteUserId,
        status: "ACTIVE",
        expireAt: input.expiresAt.toISOString(),
        trafficLimitBytes: 0,
        trafficLimitStrategy: "NO_RESET",
        hwidDeviceLimit: input.deviceLimit,
        activeInternalSquads: this.squadsFor(input.lteEnabled),
      },
      "update user"
    )
  }

  private async requestUser(
    path: string,
    method: "GET" | "POST" | "PATCH",
    body: Record<string, unknown> | undefined,
    operation: string
  ) {
    return this.parseUser(
      await this.request(path, method, body, operation),
      operation
    )
  }

  private async request(
    path: string,
    method: "GET" | "POST" | "PATCH",
    body: Record<string, unknown> | undefined,
    operation: string,
    allowNotFound = false
  ): Promise<unknown | null> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    let response: Response
    try {
      response = await this.fetchImplementation(new URL(path, this.baseUrl), {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiToken}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch {
      clearTimeout(timeout)
      if (controller.signal.aborted)
        throw new Error(`Remnawave API ${operation} timed out`)
      throw new Error(`Remnawave API ${operation} request failed`)
    }

    if (allowNotFound && response.status === 404) {
      await response.body?.cancel().catch(() => undefined)
      clearTimeout(timeout)
      return null
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      clearTimeout(timeout)
      throw new Error(
        `Remnawave API ${operation} failed with HTTP ${response.status}`
      )
    }

    let text: string
    try {
      text = await this.readBoundedBody(response, operation)
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error(`Remnawave API ${operation} timed out`)
      throw error
    } finally {
      clearTimeout(timeout)
    }
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new Error(`Remnawave API ${operation} returned invalid JSON`)
    }
  }

  private async readBoundedBody(response: Response, operation: string) {
    const declaredLength = Number(response.headers.get("content-length"))
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_RESPONSE_BYTES
    ) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error(`Remnawave API ${operation} response is too large`)
    }
    if (!response.body) return ""

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new Error(`Remnawave API ${operation} response is too large`)
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString(
      "utf8"
    )
  }

  private parseUser(payload: unknown, operation: string) {
    const parsed = remoteUserEnvelopeSchema.safeParse(payload)
    if (!parsed.success)
      throw new Error(`Remnawave API ${operation} returned an invalid user`)
    return parsed.data.response
  }

  private toUpsertResult(user: RemoteUser) {
    return {
      remoteUserId: user.uuid,
      subscriptionUrl: user.subscriptionUrl,
    }
  }

  private toState(user: RemoteUser): RemoteSubscriberState {
    return {
      remoteUserId: user.uuid,
      expiresAt: new Date(user.expireAt),
      deviceLimit: user.hwidDeviceLimit ?? 0,
      lteEnabled: user.activeInternalSquads.some(
        (squad) => squad.uuid === this.lteSquadUuid
      ),
      subscriptionUrl: user.subscriptionUrl,
    }
  }

  private squadsFor(lteEnabled: boolean) {
    return [this.standardSquadUuid, ...(lteEnabled ? [this.lteSquadUuid] : [])]
  }

  private usernameFor(localUserId: string) {
    const digest = createHash("sha256")
      .update(`pulsar:${localUserId}`)
      .digest("hex")
      .slice(0, 24)
    return `pulsar_${digest}`
  }
}

export function getProvisioningProvider(): ProvisioningProvider {
  const config = getConfig()
  if (config.remnawave.provider === "mock")
    return new MockProvisioningProvider()
  return new RemnawaveHttpProvider({
    baseUrl: config.remnawave.baseUrl!,
    apiToken: config.remnawave.apiToken!,
    standardSquadUuid: config.remnawave.standardSquadUuid!,
    lteSquadUuid: config.remnawave.lteSquadUuid!,
    timeoutMs: config.remnawave.timeoutMs,
  })
}

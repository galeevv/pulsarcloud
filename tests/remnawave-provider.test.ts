import assert from "node:assert/strict"
import test from "node:test"

import { RemnawaveHttpProvider } from "@/src/server/infrastructure/remnawave/provider"

const standardSquadUuid = "11111111-1111-4111-8111-111111111111"
const lteSquadUuid = "22222222-2222-4222-8222-222222222222"
const remoteUserUuid = "33333333-3333-4333-8333-333333333333"

function remoteUser(
  overrides: Partial<{
    expireAt: string
    hwidDeviceLimit: number | null
    subscriptionUrl: string
    activeInternalSquads: Array<{ uuid: string; name: string }>
  }> = {}
) {
  return {
    response: {
      id: 17,
      uuid: remoteUserUuid,
      shortUuid: "short-user-id",
      status: "ACTIVE",
      expireAt: "2027-07-13T12:00:00.000Z",
      hwidDeviceLimit: 1,
      subscriptionUrl: "https://sub.pulsar-cloud.space/short-user-id",
      activeInternalSquads: [
        { uuid: standardSquadUuid, name: "PULSAR_TEST_STANDARD" },
      ],
      ...overrides,
    },
  }
}

function remoteDevices(hwids = ["device-hwid-001"]) {
  return {
    response: {
      total: hwids.length,
      devices: hwids.map((hwid, index) => ({
        hwid,
        userId: 17,
        platform: "Android",
        osVersion: "14",
        deviceModel: index === 0 ? "Mi Note 10 Lite" : null,
        userAgent: "Happ/1.0",
        requestIp: "192.0.2.1",
        createdAt: "2026-07-14T12:00:00.000Z",
        updatedAt: "2026-07-14T12:30:00.000Z",
      })),
    },
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function createProvider(
  fetchImplementation: typeof fetch,
  userNamespace = "pulsar"
) {
  return new RemnawaveHttpProvider({
    baseUrl: "https://panel.example.test",
    apiToken: "test-token-that-must-never-appear-in-errors",
    userNamespace,
    standardSquadUuid,
    lteSquadUuid,
    timeoutMs: 1_000,
    fetchImplementation,
  })
}

async function captureCreatedUsername(userNamespace: string) {
  let callNumber = 0
  let createdUsername = ""
  const fetchImplementation = (async (
    _input: URL | RequestInfo,
    init?: RequestInit
  ) => {
    callNumber += 1
    if (callNumber === 1) return jsonResponse({ message: "not found" }, 404)
    const body = JSON.parse(String(init?.body)) as { username?: string }
    createdUsername = body.username ?? ""
    return jsonResponse(remoteUser(), 201)
  }) as typeof fetch
  const provider = createProvider(fetchImplementation, userNamespace)
  await provider.upsertSubscriber({
    localUserId: "same-local-user-id",
    expiresAt: new Date("2027-07-13T12:00:00.000Z"),
    deviceLimit: 1,
    lteEnabled: false,
  })
  return createdUsername
}

test("Remnawave provider creates a deterministic standard subscriber", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetchImplementation = (async (
    input: URL | RequestInfo,
    init?: RequestInit
  ) => {
    calls.push({ url: String(input), init })
    if (calls.length === 1) return jsonResponse({ message: "not found" }, 404)
    return jsonResponse(remoteUser(), 201)
  }) as typeof fetch
  const provider = createProvider(fetchImplementation)
  const expiresAt = new Date("2027-07-13T12:00:00.000Z")

  const result = await provider.upsertSubscriber({
    localUserId: "local-user-id",
    expiresAt,
    deviceLimit: 2,
    lteEnabled: false,
  })

  assert.deepEqual(result, {
    remoteUserId: remoteUserUuid,
    subscriptionUrl: "https://sub.pulsar-cloud.space/short-user-id",
  })
  assert.equal(calls.length, 2)
  assert.match(calls[0].url, /\/api\/users\/by-username\/pulsar_[a-f0-9]{24}$/)
  assert.equal(calls[0].init?.method, "GET")
  assert.equal(calls[1].url, "https://panel.example.test/api/users")
  assert.equal(calls[1].init?.method, "POST")
  const body = JSON.parse(String(calls[1].init?.body)) as Record<
    string,
    unknown
  >
  assert.match(String(body.username), /^pulsar_[a-f0-9]{24}$/)
  assert.doesNotMatch(String(body.username), /local-user-id/)
  assert.equal(body.expireAt, expiresAt.toISOString())
  assert.equal(body.hwidDeviceLimit, 2)
  assert.deepEqual(body.activeInternalSquads, [standardSquadUuid])
  assert.equal(body.trafficLimitBytes, 0)
  assert.equal(body.trafficLimitStrategy, "NO_RESET")
})

test("Remnawave provider namespaces deterministic usernames", async () => {
  const productionUsername = await captureCreatedUsername("pulsar")
  const repeatedProductionUsername = await captureCreatedUsername("pulsar")
  const localTestUsername = await captureCreatedUsername("pulsar_local_test")

  assert.equal(productionUsername, repeatedProductionUsername)
  assert.notEqual(productionUsername, localTestUsername)
  assert.match(productionUsername, /^pulsar_[a-f0-9]{24}$/)
  assert.match(localTestUsername, /^pulsar_[a-f0-9]{24}$/)
})

test("Remnawave provider rejects an unsafe user namespace", () => {
  assert.throws(
    () => createProvider(fetch, "Pulsar production/../local"),
    /user namespace is invalid/i
  )
})

test("Remnawave provider updates one user and grants both squads for LTE", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetchImplementation = (async (
    input: URL | RequestInfo,
    init?: RequestInit
  ) => {
    calls.push({ url: String(input), init })
    if (calls.length === 1) return jsonResponse(remoteUser())
    return jsonResponse(
      remoteUser({
        hwidDeviceLimit: 4,
        activeInternalSquads: [
          { uuid: standardSquadUuid, name: "PULSAR_TEST_STANDARD" },
          { uuid: lteSquadUuid, name: "PULSAR_TEST_LTE" },
        ],
      })
    )
  }) as typeof fetch
  const provider = createProvider(fetchImplementation)

  await provider.upsertSubscriber({
    localUserId: "local-user-id",
    expiresAt: new Date("2027-07-13T12:00:00.000Z"),
    deviceLimit: 4,
    lteEnabled: true,
  })

  assert.equal(calls.length, 2)
  assert.equal(calls[1].init?.method, "PATCH")
  const body = JSON.parse(String(calls[1].init?.body)) as Record<
    string,
    unknown
  >
  assert.equal(body.uuid, remoteUserUuid)
  assert.equal(body.hwidDeviceLimit, 4)
  assert.deepEqual(body.activeInternalSquads, [standardSquadUuid, lteSquadUuid])
})

test("Remnawave provider reads desired state and LTE entitlement", async () => {
  const fetchImplementation = (async () =>
    jsonResponse(
      remoteUser({
        hwidDeviceLimit: 5,
        activeInternalSquads: [
          { uuid: standardSquadUuid, name: "PULSAR_TEST_STANDARD" },
          { uuid: lteSquadUuid, name: "PULSAR_TEST_LTE" },
        ],
      })
    )) as typeof fetch
  const provider = createProvider(fetchImplementation)

  const state = await provider.getSubscriberState(remoteUserUuid)

  assert.equal(state.remoteUserId, remoteUserUuid)
  assert.equal(state.expiresAt.toISOString(), "2027-07-13T12:00:00.000Z")
  assert.equal(state.deviceLimit, 5)
  assert.equal(state.lteEnabled, true)
  assert.equal(
    state.subscriptionUrl,
    "https://sub.pulsar-cloud.space/short-user-id"
  )
})

test("Remnawave provider lists and deletes only a subscriber's HWID device", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetchImplementation = (async (
    input: URL | RequestInfo,
    init?: RequestInit
  ) => {
    calls.push({ url: String(input), init })
    if (calls.length === 1) return jsonResponse(remoteDevices())
    if (calls.length === 2) return jsonResponse(remoteDevices())
    return jsonResponse(remoteDevices([]))
  }) as typeof fetch
  const provider = createProvider(fetchImplementation)

  const listed = await provider.getSubscriberDevices(remoteUserUuid)
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.deviceModel, "Mi Note 10 Lite")
  assert.equal(listed[0]?.platform, "Android")
  assert.ok(listed[0]?.updatedAt instanceof Date)
  assert.equal(
    calls[0]?.url,
    `https://panel.example.test/api/hwid/devices/${remoteUserUuid}`
  )

  const remaining = await provider.deleteSubscriberDevice({
    remoteUserId: remoteUserUuid,
    hwid: "device-hwid-001",
  })
  assert.deepEqual(remaining, [])
  assert.equal(
    calls[2]?.url,
    "https://panel.example.test/api/hwid/devices/delete"
  )
  assert.equal(calls[2]?.init?.method, "POST")
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), {
    userUuid: remoteUserUuid,
    hwid: "device-hwid-001",
  })
})

test("Remnawave provider revokes and returns a rotated subscription URL", async () => {
  let capturedUrl = ""
  let capturedInit: RequestInit | undefined
  const fetchImplementation = (async (
    input: URL | RequestInfo,
    init?: RequestInit
  ) => {
    capturedUrl = String(input)
    capturedInit = init
    return jsonResponse(
      remoteUser({
        subscriptionUrl: "https://sub.pulsar-cloud.space/new-short-id",
      })
    )
  }) as typeof fetch
  const provider = createProvider(fetchImplementation)

  const result = await provider.regenerateSubscriptionUrl({
    remoteUserId: remoteUserUuid,
  })

  assert.equal(
    capturedUrl,
    `https://panel.example.test/api/users/${remoteUserUuid}/actions/revoke`
  )
  assert.equal(capturedInit?.method, "POST")
  assert.equal(capturedInit?.body, "{}")
  assert.equal(
    result.subscriptionUrl,
    "https://sub.pulsar-cloud.space/new-short-id"
  )
})

test("Remnawave provider resolves an ambiguous create without duplicates", async () => {
  let requestNumber = 0
  const methods: string[] = []
  const fetchImplementation = (async (
    _input: URL | RequestInfo,
    init?: RequestInit
  ) => {
    requestNumber += 1
    methods.push(String(init?.method))
    if (requestNumber === 1) return jsonResponse({ message: "not found" }, 404)
    if (requestNumber === 2)
      return jsonResponse({ message: "gateway timeout" }, 504)
    return jsonResponse(remoteUser())
  }) as typeof fetch
  const provider = createProvider(fetchImplementation)

  const result = await provider.upsertSubscriber({
    localUserId: "ambiguous-local-user",
    expiresAt: new Date("2027-07-13T12:00:00.000Z"),
    deviceLimit: 1,
    lteEnabled: false,
  })

  assert.equal(result.remoteUserId, remoteUserUuid)
  assert.deepEqual(methods, ["GET", "POST", "GET", "PATCH"])
})

test("Remnawave provider errors expose status but not token or remote body", async () => {
  const fetchImplementation = (async () =>
    jsonResponse({ message: "sensitive provider detail" }, 500)) as typeof fetch
  const provider = createProvider(fetchImplementation)

  await assert.rejects(
    () => provider.getSubscriberState(remoteUserUuid),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      assert.match(message, /HTTP 500/)
      assert.doesNotMatch(message, /test-token/)
      assert.doesNotMatch(message, /sensitive provider detail/)
      return true
    }
  )
})

test("Remnawave provider rejects oversized responses", async () => {
  const fetchImplementation = (async () =>
    new Response("{}", {
      status: 200,
      headers: { "Content-Length": String(256 * 1024 + 1) },
    })) as typeof fetch
  const provider = createProvider(fetchImplementation)

  await assert.rejects(
    () => provider.getSubscriberState(remoteUserUuid),
    /response is too large/
  )
})

test("Remnawave provider applies a bounded request timeout", async () => {
  const fetchImplementation = ((
    _input: URL | RequestInfo,
    init?: RequestInit
  ) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError"))
      )
    })) as typeof fetch
  const provider = new RemnawaveHttpProvider({
    baseUrl: "https://panel.example.test",
    apiToken: "timeout-test-token",
    standardSquadUuid,
    lteSquadUuid,
    timeoutMs: 10,
    fetchImplementation,
  })

  await assert.rejects(
    () => provider.getSubscriberState(remoteUserUuid),
    /timed out/
  )
})

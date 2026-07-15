import { createHash } from "node:crypto"
import { lstatSync, realpathSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { z } from "zod"

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true")

const optionalUrl = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.url().optional()
)

const envSchema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().startsWith("file:").default("file:./prisma/dev.db"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SESSION_SECRET: z.string().min(32),
  AUTH_PEPPER: z.string().min(32),
  DATA_ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default("Pulsar <auth@pulsar-cloud.space>"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  ADMIN_EMAIL: z.email().transform((value) => value.trim().toLowerCase()),
  ADMIN_TELEGRAM_ID: z.string().regex(/^\d+$/),
  ADMIN_TELEGRAM_USERNAME: z.string().optional(),
  PAYMENT_PROVIDER: z.enum(["test", "platega"]).default("test"),
  BILLING_ENABLED: booleanString,
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  PLATEGA_BASE_URL: z.url().default("https://app.platega.io"),
  PLATEGA_MERCHANT_ID: z.string().optional(),
  PLATEGA_SECRET: z.string().optional(),
  PLATEGA_API_KEY: z.string().optional(),
  REMNAWAVE_PROVIDER: z.enum(["mock", "http"]).default("mock"),
  REMNAWAVE_USER_NAMESPACE: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_-]{0,31}$/)
    .default("pulsar"),
  REMNAWAVE_BASE_URL: optionalUrl,
  REMNAWAVE_API_TOKEN: z.string().optional(),
  REMNAWAVE_STANDARD_SQUAD_UUID: z.uuid().optional(),
  REMNAWAVE_LTE_SQUAD_UUID: z.uuid().optional(),
  REMNAWAVE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(30_000)
    .default(8_000),
  PULSAR_TEST_MODE: booleanString,
  PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION: booleanString,
  PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE: booleanString,
  WORKER_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(250)
    .max(60_000)
    .default(1500),
  WORKER_LEASE_MS: z.coerce
    .number()
    .int()
    .min(5_000)
    .max(600_000)
    .default(60_000),
  WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(10),
})

export type AppConfig = ReturnType<typeof buildConfig>

let cachedConfig: AppConfig | undefined

function isExplicitLocalTestDatabase(databaseUrl: string) {
  let databasePath: string
  try {
    databasePath = decodeURIComponent(databaseUrl.slice("file:".length))
  } catch {
    return false
  }
  if (
    !databasePath ||
    /[?#\0]/.test(databasePath) ||
    /^\/\/[^/]/.test(databasePath) ||
    (/^[a-z][a-z\d+.-]*:\/\//i.test(databasePath) &&
      !/^[a-z]:[\\/]/i.test(databasePath))
  )
    return false
  const resolvedPath = resolve(databasePath)
  let canonicalPath: string
  try {
    if (lstatSync(resolvedPath).isSymbolicLink()) return false
    canonicalPath = realpathSync.native(resolvedPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false
    try {
      canonicalPath = resolve(
        realpathSync.native(dirname(resolvedPath)),
        basename(resolvedPath)
      )
    } catch {
      return false
    }
  }
  const filename = basename(canonicalPath).toLowerCase()
  return (
    filename === "test.db" ||
    filename.endsWith(".test.db") ||
    /^test-[a-z\d][a-z\d._-]*\.db$/.test(filename) ||
    /^[a-z\d][a-z\d._-]*-test\.db$/.test(filename)
  )
}

function buildConfig() {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${z.prettifyError(parsed.error)}`
    )
  }

  const env = parsed.data
  const productionRuntime =
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  if (productionRuntime && env.APP_ENV !== "production") {
    throw new Error(
      "APP_ENV=production is required when NODE_ENV=production at runtime"
    )
  }
  if (
    env.APP_ENV === "production" &&
    env.PULSAR_TEST_MODE &&
    !env.PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION
  ) {
    throw new Error(
      "PULSAR_TEST_MODE cannot run in production without the explicit emergency override"
    )
  }
  if (
    env.APP_ENV === "production" &&
    env.PULSAR_TEST_MODE &&
    !isExplicitLocalTestDatabase(env.DATABASE_URL)
  ) {
    throw new Error(
      "Production test-mode override requires a canonical local SQLite test database filename"
    )
  }
  if (!env.PULSAR_TEST_MODE && env.PAYMENT_PROVIDER === "test") {
    throw new Error(
      "PAYMENT_PROVIDER=test is available only when PULSAR_TEST_MODE=true"
    )
  }
  if (!env.PULSAR_TEST_MODE && env.REMNAWAVE_PROVIDER === "mock") {
    throw new Error(
      "REMNAWAVE_PROVIDER=mock is available only when PULSAR_TEST_MODE=true"
    )
  }
  if (env.PULSAR_TEST_MODE && env.PAYMENT_PROVIDER !== "test") {
    throw new Error("PULSAR_TEST_MODE=true requires PAYMENT_PROVIDER=test")
  }
  if (env.PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE && !env.PULSAR_TEST_MODE) {
    throw new Error(
      "PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE requires PULSAR_TEST_MODE=true"
    )
  }
  if (
    env.PULSAR_TEST_MODE &&
    env.REMNAWAVE_PROVIDER === "http" &&
    !env.PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE
  ) {
    throw new Error(
      "PULSAR_TEST_MODE=true requires REMNAWAVE_PROVIDER=mock unless PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE=true"
    )
  }
  if (
    env.PULSAR_TEST_MODE &&
    env.REMNAWAVE_PROVIDER === "http" &&
    env.REMNAWAVE_USER_NAMESPACE === "pulsar"
  ) {
    throw new Error(
      "Live Remnawave in test mode requires a dedicated REMNAWAVE_USER_NAMESPACE"
    )
  }
  const usesLocalTestAdapters =
    env.PULSAR_TEST_MODE && env.APP_ENV !== "production"
  if (!usesLocalTestAdapters && !env.RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY is required outside local non-production test mode"
    )
  }
  if (
    !usesLocalTestAdapters &&
    (!env.TELEGRAM_BOT_TOKEN ||
      !env.TELEGRAM_BOT_USERNAME ||
      !env.TELEGRAM_WEBHOOK_SECRET ||
      env.TELEGRAM_WEBHOOK_SECRET.length < 16)
  ) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, and a 16+ character TELEGRAM_WEBHOOK_SECRET are required outside local non-production test mode"
    )
  }
  if (
    env.PAYMENT_PROVIDER === "platega" &&
    (!env.PLATEGA_MERCHANT_ID || !(env.PLATEGA_SECRET || env.PLATEGA_API_KEY))
  ) {
    throw new Error(
      "PLATEGA_MERCHANT_ID and PLATEGA_SECRET are required for the Platega provider"
    )
  }
  if (
    env.REMNAWAVE_PROVIDER === "http" &&
    (!env.REMNAWAVE_BASE_URL ||
      !env.REMNAWAVE_API_TOKEN ||
      !env.REMNAWAVE_STANDARD_SQUAD_UUID ||
      !env.REMNAWAVE_LTE_SQUAD_UUID)
  ) {
    throw new Error(
      "REMNAWAVE_BASE_URL, REMNAWAVE_API_TOKEN, REMNAWAVE_STANDARD_SQUAD_UUID, and REMNAWAVE_LTE_SQUAD_UUID are required for the HTTP provider"
    )
  }
  if (env.APP_ENV === "production" && !env.DATA_ENCRYPTION_KEY) {
    throw new Error("DATA_ENCRYPTION_KEY is required in production")
  }

  return {
    appEnv: env.APP_ENV,
    appUrl: env.APP_URL.replace(/\/$/, ""),
    databaseUrl: env.DATABASE_URL,
    logLevel: env.LOG_LEVEL,
    sessionSecret: env.SESSION_SECRET,
    authPepper: env.AUTH_PEPPER,
    encryptionKey: Buffer.from(
      env.DATA_ENCRYPTION_KEY ??
        createHash("sha256").update(`dev:${env.SESSION_SECRET}`).digest("hex"),
      "hex"
    ),
    resend: { apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM_EMAIL },
    telegram: {
      botToken: env.TELEGRAM_BOT_TOKEN,
      botUsername: env.TELEGRAM_BOT_USERNAME,
      webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    },
    admin: {
      email: env.ADMIN_EMAIL,
      telegramId: env.ADMIN_TELEGRAM_ID,
      telegramUsername: env.ADMIN_TELEGRAM_USERNAME,
    },
    payments: {
      enabled: env.BILLING_ENABLED,
      provider: env.PAYMENT_PROVIDER,
      webhookSecret: env.PAYMENT_WEBHOOK_SECRET,
      plategaBaseUrl: env.PLATEGA_BASE_URL.replace(/\/$/, ""),
      plategaMerchantId: env.PLATEGA_MERCHANT_ID,
      plategaSecret: env.PLATEGA_SECRET ?? env.PLATEGA_API_KEY,
    },
    remnawave: {
      provider: env.REMNAWAVE_PROVIDER,
      userNamespace: env.REMNAWAVE_USER_NAMESPACE,
      baseUrl: env.REMNAWAVE_BASE_URL?.replace(/\/$/, ""),
      apiToken: env.REMNAWAVE_API_TOKEN,
      standardSquadUuid: env.REMNAWAVE_STANDARD_SQUAD_UUID,
      lteSquadUuid: env.REMNAWAVE_LTE_SQUAD_UUID,
      timeoutMs: env.REMNAWAVE_TIMEOUT_MS,
      allowLiveInTestMode: env.PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE,
    },
    testMode: env.PULSAR_TEST_MODE,
    localAuthAdaptersEnabled: usesLocalTestAdapters,
    allowTestModeInProduction: env.PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION,
    worker: {
      pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
      leaseMs: env.WORKER_LEASE_MS,
      batchSize: env.WORKER_BATCH_SIZE,
    },
  }
}

export function getConfig(): AppConfig {
  cachedConfig ??= buildConfig()
  return cachedConfig
}

export function resetConfigForTests() {
  cachedConfig = undefined
}

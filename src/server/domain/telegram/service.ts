import type { SubscriberDevice } from "@/src/server/infrastructure/remnawave/provider"
import { BusinessError } from "@/src/server/application/errors"
import {
  getCheckoutExpectation,
  getDeviceLimitUpgradeExpectation,
} from "@/src/server/domain/billing/service"
import {
  availableDurationMonths,
  calculatePrice,
} from "@/src/server/domain/billing/pricing"
import { getSubscriptionDevices } from "@/src/server/domain/subscriptions/service"
import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import { privacyHash } from "@/src/server/infrastructure/security/crypto"
import { getReferralSummaryView } from "@/src/server/queries/user-dashboard"

export type TelegramCallbackAction =
  | { kind: "home" }
  | { kind: "devices" }
  | { kind: "renewal" }
  | { kind: "referrals" }
  | { kind: "partner" }
  | { kind: "partner-history" }
  | {
      kind: "website"
      target: "home" | "instructions" | "support" | "partner"
    }
  | { kind: "device-confirm"; deviceRef: string }
  | { kind: "device-delete"; deviceRef: string }
  | { kind: "device-upgrade" }
  | { kind: "upgrade-review"; targetDeviceLimit: number }
  | {
      kind: "upgrade-checkout"
      targetDeviceLimit: number
      pricingVersion: number
      expectedAmountMinor: number
    }
  | { kind: "renew-duration"; durationMonths: number }
  | {
      kind: "renew-device-limit"
      durationMonths: number
      deviceLimit: number
    }
  | {
      kind: "renew-review"
      durationMonths: number
      deviceLimit: number
      lteEnabled: boolean
    }
  | {
      kind: "renew-checkout"
      durationMonths: number
      deviceLimit: number
      lteEnabled: boolean
      pricingVersion: number
      expectedAmountMinor: number
    }

const CALLBACK_MAX_BYTES = 64
const DEVICE_REF_PATTERN = /^[a-f0-9]{16}$/
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d{0,9}$/
const DURATION_PATTERN = /^(1|3|6|12)$/
const DEVICE_LIMIT_PATTERN = /^[1-5]$/

function positiveInteger(value: string | undefined) {
  return value && POSITIVE_INTEGER_PATTERN.test(value) ? Number(value) : null
}

export function parseTelegramCallbackAction(
  value: unknown
): TelegramCallbackAction | null {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") < 1 ||
    Buffer.byteLength(value, "utf8") > CALLBACK_MAX_BYTES
  )
    return null

  const aliases: Record<string, TelegramCallbackAction> = {
    "m:h": { kind: "home" },
    "m:d": { kind: "devices" },
    "m:r": { kind: "renewal" },
    "m:f": { kind: "referrals" },
    "m:p": { kind: "partner" },
    "p:h": { kind: "partner-history" },
    "w:h": { kind: "website", target: "home" },
    "w:i": { kind: "website", target: "instructions" },
    "w:s": { kind: "website", target: "support" },
    "w:p": { kind: "website", target: "partner" },
    "d:u": { kind: "device-upgrade" },
    "r:0": { kind: "renewal" },
    "menu:home": { kind: "home" },
    "menu:referrals": { kind: "referrals" },
    "menu:site-login": { kind: "website", target: "home" },
  }
  if (aliases[value]) return aliases[value]

  const parts = value.split(":")
  if (
    parts.length === 3 &&
    parts[0] === "d" &&
    ["c", "x"].includes(parts[1] ?? "") &&
    DEVICE_REF_PATTERN.test(parts[2] ?? "")
  )
    return {
      kind: parts[1] === "c" ? "device-confirm" : "device-delete",
      deviceRef: parts[2]!,
    }

  if (
    parts.length === 3 &&
    parts[0] === "u" &&
    parts[1] === "q" &&
    DEVICE_LIMIT_PATTERN.test(parts[2] ?? "")
  )
    return { kind: "upgrade-review", targetDeviceLimit: Number(parts[2]) }

  if (
    parts.length === 5 &&
    parts[0] === "u" &&
    parts[1] === "x" &&
    DEVICE_LIMIT_PATTERN.test(parts[2] ?? "")
  ) {
    const pricingVersion = positiveInteger(parts[3])
    const expectedAmountMinor = positiveInteger(parts[4])
    if (pricingVersion && expectedAmountMinor)
      return {
        kind: "upgrade-checkout",
        targetDeviceLimit: Number(parts[2]),
        pricingVersion,
        expectedAmountMinor,
      }
  }

  if (
    parts.length === 3 &&
    parts[0] === "r" &&
    parts[1] === "d" &&
    DURATION_PATTERN.test(parts[2] ?? "")
  )
    return { kind: "renew-duration", durationMonths: Number(parts[2]) }

  if (
    parts.length === 4 &&
    parts[0] === "r" &&
    parts[1] === "l" &&
    DURATION_PATTERN.test(parts[2] ?? "") &&
    DEVICE_LIMIT_PATTERN.test(parts[3] ?? "")
  )
    return {
      kind: "renew-device-limit",
      durationMonths: Number(parts[2]),
      deviceLimit: Number(parts[3]),
    }

  if (
    parts.length === 5 &&
    parts[0] === "r" &&
    parts[1] === "q" &&
    DURATION_PATTERN.test(parts[2] ?? "") &&
    DEVICE_LIMIT_PATTERN.test(parts[3] ?? "") &&
    ["0", "1"].includes(parts[4] ?? "")
  )
    return {
      kind: "renew-review",
      durationMonths: Number(parts[2]),
      deviceLimit: Number(parts[3]),
      lteEnabled: parts[4] === "1",
    }

  if (
    parts.length === 7 &&
    parts[0] === "r" &&
    parts[1] === "x" &&
    DURATION_PATTERN.test(parts[2] ?? "") &&
    DEVICE_LIMIT_PATTERN.test(parts[3] ?? "") &&
    ["0", "1"].includes(parts[4] ?? "")
  ) {
    const pricingVersion = positiveInteger(parts[5])
    const expectedAmountMinor = positiveInteger(parts[6])
    if (pricingVersion && expectedAmountMinor)
      return {
        kind: "renew-checkout",
        durationMonths: Number(parts[2]),
        deviceLimit: Number(parts[3]),
        lteEnabled: parts[4] === "1",
        pricingVersion,
        expectedAmountMinor,
      }
  }
  return null
}

export function isTelegramCallbackAction(value: unknown) {
  return parseTelegramCallbackAction(value) !== null
}

type TelegramButton =
  | { text: string; callback_data: string }
  | { text: string; url: string }
  | { text: string; copy_text: { text: string } }

export type TelegramScreen = {
  text: string
  parseMode: "HTML"
  replyMarkup: { inline_keyboard: TelegramButton[][] }
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Yekaterinburg",
})

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function plural(value: number, one: string, few: string, many: string) {
  const mod100 = Math.abs(value) % 100
  const mod10 = Math.abs(value) % 10
  if (mod100 >= 11 && mod100 <= 19) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

function remainingDays(expiresAt: Date) {
  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000))
}

function remainingDaysText(expiresAt: Date) {
  const days = remainingDays(expiresAt)
  if (days <= 0) return "заканчивается сегодня"
  return `${days === 1 ? "остался" : "осталось"} ${days} ${plural(days, "день", "дня", "дней")}`
}

function upperFirst(value: string) {
  return value.charAt(0).toLocaleUpperCase("ru-RU") + value.slice(1)
}

function formatRub(minor: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.floor(minor / 100))} ₽`
}

function monthsLabel(months: number) {
  return `${months} ${plural(months, "месяц", "месяца", "месяцев")}`
}

function homeButton(): TelegramButton {
  return { text: "🏠 Главное меню", callback_data: "m:h" }
}

function backButton(callbackData: string, text = "‹ Назад"): TelegramButton {
  return { text, callback_data: callbackData }
}

export function telegramMainPhotoUrl() {
  return `${getConfig().appUrl}/tg/tg4.png`
}

export async function getTelegramUserId(telegramId: string) {
  const identity = await db.authIdentity.findUnique({
    where: { telegramId },
    select: { userId: true },
  })
  return identity?.userId ?? null
}

async function actualDeviceCount(userId: string) {
  try {
    // The home screen must stay responsive even if Remnawave is unhealthy.
    // Full device management keeps the normal provider timeout.
    return (await getSubscriptionDevices(userId, { timeoutMs: 1_000 })).length
  } catch {
    return null
  }
}

export async function getTelegramMainScreen(
  userId: string
): Promise<TelegramScreen> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      telegramProfile: { select: { firstName: true, username: true } },
      identities: {
        where: { provider: "EMAIL" },
        select: { emailNormalized: true },
        take: 1,
      },
      subscription: true,
      partnerEnrollment: { select: { enabled: true } },
    },
  })
  const profile = user.telegramProfile
  const name = escapeHtml(
    (profile?.firstName?.trim() || "ПОЛЬЗОВАТЕЛЬ").toLocaleUpperCase("ru-RU")
  )
  const username = profile?.username?.trim()
    ? ` · @${escapeHtml(profile.username.trim())}`
    : ""
  const email = user.identities[0]?.emailNormalized
  const subscription = user.subscription
  const now = new Date()
  const expired = Boolean(subscription && subscription.expiresAt <= now)
  const suspended = subscription?.status === "SUSPENDED"
  const canReadDevices = Boolean(
    subscription &&
    !expired &&
    !suspended &&
    subscription.syncStatus === "SYNCED" &&
    subscription.remnawaveUserId
  )
  const usedDevices = canReadDevices ? await actualDeviceCount(userId) : null

  const lines = [
    "🪐 <b>PULSAR VPN</b>",
    "",
    `👤 <b>${name}</b>${username}`,
    email
      ? `✉️ <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`
      : "✉️ Привяжите почту на сайте",
    "",
  ]
  let renewalLabel = "💎 Продлить"

  if (!subscription) {
    lines.push("⚪ <b>Подписка не оформлена</b>")
  } else if (expired) {
    renewalLabel = "💎 Возобновить подписку"
    lines.push(
      "🔴 <b>Подписка истекла</b>",
      `Доступ был активен до <b>${dateFormatter.format(subscription.expiresAt)}</b>.`,
      "",
      `📱 Лимит устройств: <b>до ${subscription.deviceLimit}</b>`,
      `⚡️ Доступ Plus: <b>${subscription.lteEnabled ? "был" : "не был подключён"}</b>`
    )
  } else if (suspended) {
    lines.push(
      "🔴 <b>Подписка приостановлена</b>",
      "Обратитесь в поддержку — повторная оплата не требуется.",
      "",
      `📱 Лимит устройств: <b>до ${subscription.deviceLimit}</b>`,
      `⚡️ Доступ Plus: <b>${subscription.lteEnabled ? "есть" : "нет"}</b>`
    )
  } else if (subscription.syncStatus === "PENDING") {
    lines.push(
      "🟡 <b>Настраиваем подписку</b>",
      "Подключение скоро будет готово.",
      "",
      `📱 Лимит устройств: <b>до ${subscription.deviceLimit}</b>`,
      `⚡️ Доступ Plus: <b>${subscription.lteEnabled ? "есть" : "нет"}</b>`
    )
  } else if (subscription.syncStatus === "FAILED") {
    lines.push(
      "🟠 <b>Не удалось обновить доступ</b>",
      "Мы повторим синхронизацию автоматически.",
      "",
      `📱 Лимит устройств: <b>до ${subscription.deviceLimit}</b>`,
      `⚡️ Доступ Plus: <b>${subscription.lteEnabled ? "есть" : "нет"}</b>`
    )
  } else {
    const soon = remainingDays(subscription.expiresAt) <= 3
    lines.push(
      `${soon ? "🟠" : "🟢"} ${upperFirst(remainingDaysText(subscription.expiresAt))}`,
      usedDevices === null
        ? `📱 Лимит устройств: до ${subscription.deviceLimit}`
        : `📱 Подключено устройств: ${usedDevices} / ${subscription.deviceLimit}`,
      `⚡️ Доступ Plus: ${subscription.lteEnabled ? "есть" : "нет"}`
    )
  }

  const keyboard: TelegramButton[][] = [
    [{ text: "🔗 Подключиться", callback_data: "w:i" }],
    suspended
      ? [{ text: "📱 Устройства", callback_data: "m:d" }]
      : [
          { text: "📱 Устройства", callback_data: "m:d" },
          { text: renewalLabel, callback_data: "m:r" },
        ],
    [
      { text: "🎁 Пригласить", callback_data: "m:f" },
      { text: "💬 Поддержка", callback_data: "w:s" },
    ],
  ]
  if (user.partnerEnrollment?.enabled)
    keyboard.push([
      { text: "🤝 Партнёрская программа", callback_data: "m:p" },
    ])
  keyboard.push([{ text: "🌐 Сайт", callback_data: "w:h" }])

  return {
    text: lines.join("\n"),
    parseMode: "HTML",
    replyMarkup: { inline_keyboard: keyboard },
  }
}

function partnerIdentityLabel(user: {
  telegramProfile: { username: string | null } | null
  identities: Array<{
    emailNormalized: string | null
    telegramUsername: string | null
  }>
}) {
  const username =
    user.telegramProfile?.username ??
    user.identities.find((identity) => identity.telegramUsername)
      ?.telegramUsername
  if (username) return username.startsWith("@") ? username : `@${username}`
  const email = user.identities.find(
    (identity) => identity.emailNormalized
  )?.emailNormalized
  if (!email) return "Пользователь PULSAR"
  const [local = "", domain = ""] = email.split("@")
  if (!domain) return "Пользователь PULSAR"
  return `${local.slice(0, 1) || "*"}***@${domain}`
}

function partnerRateLabel(rateBps: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(
    rateBps / 100
  )
}

async function enabledPartnerEnrollment(userId: string) {
  return db.partnerEnrollment.findFirst({
    where: { userId, enabled: true },
    select: { id: true, rateBps: true },
  })
}

function getPartnerUnavailableScreen(): TelegramScreen {
  return {
    text: [
      "🤝 <b>Партнёрская программа</b>",
      "",
      "Партнёрская программа не подключена для вашего аккаунта.",
    ].join("\n"),
    parseMode: "HTML",
    replyMarkup: { inline_keyboard: [[homeButton()]] },
  }
}

export async function getTelegramPartnerScreen(
  userId: string
): Promise<TelegramScreen> {
  const enrollment = await enabledPartnerEnrollment(userId)
  if (!enrollment) return getPartnerUnavailableScreen()

  const [wallet, earned, paid, latest] = await Promise.all([
    db.walletAccount.findUnique({
      where: { userId },
      select: { availableMinor: true, reservedMinor: true },
    }),
    db.partnerCommission.aggregate({
      where: { inviterUserId: userId, status: { not: "REVERSED" } },
      _sum: { amountMinor: true },
    }),
    db.payoutRequest.aggregate({
      where: { userId, status: "PAID" },
      _sum: { amountMinor: true },
    }),
    db.partnerCommission.findFirst({
      where: { inviterUserId: userId, status: { not: "REVERSED" } },
      orderBy: { createdAt: "desc" },
      select: {
        amountMinor: true,
        invited: {
          select: {
            telegramProfile: { select: { username: true } },
            identities: {
              select: { emailNormalized: true, telegramUsername: true },
            },
          },
        },
      },
    }),
  ])
  const lines = [
    "🤝 <b>Партнёрская программа</b>",
    "",
    `Ваша ставка: <b>${partnerRateLabel(enrollment.rateBps)}%</b>`,
    "",
    `💰 Доступно: <b>${formatRub(wallet?.availableMinor ?? 0)}</b>`,
    `⏳ В резерве: <b>${formatRub(wallet?.reservedMinor ?? 0)}</b>`,
    `📈 Заработано: <b>${formatRub(earned._sum.amountMinor ?? 0)}</b>`,
    `✅ Выплачено: <b>${formatRub(paid._sum.amountMinor ?? 0)}</b>`,
  ]
  if (latest)
    lines.push(
      "",
      "Последнее начисление:",
      `${escapeHtml(partnerIdentityLabel(latest.invited))} · <b>+${formatRub(latest.amountMinor)}</b>`
    )

  return {
    text: lines.join("\n"),
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        [{ text: "💳 Вывести средства", callback_data: "w:p" }],
        [{ text: "📊 История начислений", callback_data: "p:h" }],
        [{ text: "🎁 Пригласить друзей", callback_data: "m:f" }],
        [backButton("m:h", "‹ Вернуться в главное меню")],
      ],
    },
  }
}

export async function getTelegramPartnerHistoryScreen(
  userId: string
): Promise<TelegramScreen> {
  const enrollment = await enabledPartnerEnrollment(userId)
  if (!enrollment) return getPartnerUnavailableScreen()

  const commissions = await db.partnerCommission.findMany({
    where: { inviterUserId: userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      amountMinor: true,
      status: true,
      createdAt: true,
      invited: {
        select: {
          telegramProfile: { select: { username: true } },
          identities: {
            select: { emailNormalized: true, telegramUsername: true },
          },
        },
      },
    },
  })
  const lines = ["📊 <b>История начислений</b>", "", "Последние 10 операций:"]
  if (!commissions.length) lines.push("", "Начислений пока нет.")
  else
    commissions.forEach((commission, index) => {
      const reversed = commission.status === "REVERSED"
      lines.push(
        "",
        `${index + 1}. ${dateFormatter.format(commission.createdAt)} · ${escapeHtml(partnerIdentityLabel(commission.invited))}`,
        reversed
          ? `↩️ Отменено: <b>${formatRub(commission.amountMinor)}</b>`
          : `💰 Начислено: <b>+${formatRub(commission.amountMinor)}</b>`
      )
    })

  return {
    text: lines.join("\n"),
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        [backButton("m:p", "‹ Назад к партнёрской программе")],
        [homeButton()],
      ],
    },
  }
}

export async function getReferralsScreen(
  userId: string
): Promise<TelegramScreen> {
  const [summary, pricing] = await Promise.all([
    getReferralSummaryView(userId),
    db.pricingSettings.findUniqueOrThrow({
      where: { key: "default" },
      select: { referralTrialDays: true, referralRewardDays: true },
    }),
  ])
  const lines = [
    "🎁 <b>Пригласить друзей</b>",
    "",
    `Приглашено: <b>${summary.invitedUsers}</b>`,
    `Активных: <b>${summary.activeUsers}</b>`,
    `Начислено дней: <b>${summary.rewardDays}</b>`,
    "",
    `Другу <b>${pricing.referralTrialDays} ${plural(pricing.referralTrialDays, "день", "дня", "дней")} бесплатно</b>`,
    `Вам <b>+${pricing.referralRewardDays} ${plural(pricing.referralRewardDays, "бонусный день", "бонусных дня", "бонусных дней")}</b>`,
  ]
  const keyboard: TelegramButton[][] = []
  if (summary.inviteUrl && summary.telegramInviteUrl) {
    lines.push(
      "",
      "Ваша ссылка:",
      escapeHtml(summary.inviteUrl),
      "",
      "Telegram-ссылка:",
      escapeHtml(summary.telegramInviteUrl)
    )
    if (summary.inviteUrl.length <= 256)
      keyboard.push([
        {
          text: "📋 Скопировать ссылку сайта",
          copy_text: { text: summary.inviteUrl },
        },
      ])
    if (summary.telegramInviteUrl.length <= 256)
      keyboard.push([
        {
          text: "📋 Скопировать Telegram-ссылку",
          copy_text: { text: summary.telegramInviteUrl },
        },
      ])
  } else {
    lines.push("", "Ссылки станут доступны после первой оплаты.")
  }
  keyboard.push([backButton("m:h", "‹ Вернуться в главное меню")])
  return {
    text: lines.join("\n"),
    parseMode: "HTML",
    replyMarkup: { inline_keyboard: keyboard },
  }
}

function devicePresentation(device: SubscriberDevice) {
  const value =
    `${device.platform ?? ""} ${device.deviceModel ?? ""}`.toLowerCase()
  let icon = "🔒"
  let platform = "Устройство"
  if (value.includes("android")) {
    icon = "📱"
    platform = "Android"
  } else if (/(ios|iphone|ipad)/.test(value)) {
    icon = "🍏"
    platform = value.includes("ipad") ? "iPad" : "iPhone"
  } else if (value.includes("windows")) {
    icon = "💻"
    platform = "Windows"
  } else if (/(macos|mac os|darwin|osx)/.test(value)) {
    icon = "🖥"
    platform = "macOS"
  } else if (value.includes("linux")) {
    icon = "🐧"
    platform = "Linux"
  }
  const model = device.deviceModel?.trim()
  const label =
    model && model.toLowerCase() !== platform.toLowerCase()
      ? `${platform} (${model})`
      : platform
  return { icon, label: label.slice(0, 48) }
}

export function telegramDeviceRef(userId: string, hwid: string) {
  return privacyHash(`telegram-device:${userId}:${hwid}`).slice(0, 16)
}

export function findTelegramDeviceByRef(
  userId: string,
  devices: SubscriberDevice[],
  deviceRef: string
) {
  const matches = devices.filter(
    (device) => telegramDeviceRef(userId, device.hwid) === deviceRef
  )
  return matches.length === 1 ? matches[0] : null
}

async function loadDeviceContext(userId: string) {
  const [subscription, pricing] = await Promise.all([
    db.subscription.findUnique({ where: { userId } }),
    db.pricingSettings.findUniqueOrThrow({ where: { key: "default" } }),
  ])
  return { subscription, maximum: Math.min(5, pricing.maxDeviceLimit) }
}

export async function getTelegramDevicesScreen(
  userId: string
): Promise<TelegramScreen> {
  const { subscription, maximum } = await loadDeviceContext(userId)
  const now = new Date()
  const back = [backButton("m:h", "‹ Вернуться в главное меню")]
  if (!subscription || subscription.expiresAt <= now)
    return {
      text: "📱 <b>Управление устройствами</b>\n\nНет активной подписки.",
      parseMode: "HTML",
      replyMarkup: {
        inline_keyboard: [
          [{ text: "💎 Возобновить подписку", callback_data: "m:r" }],
          back,
        ],
      },
    }
  if (subscription.status === "SUSPENDED")
    return {
      text: "📱 <b>Управление устройствами</b>\n\nПодписка приостановлена. Обратитесь в поддержку.",
      parseMode: "HTML",
      replyMarkup: {
        inline_keyboard: [
          [{ text: "💬 Поддержка", callback_data: "w:s" }],
          back,
        ],
      },
    }
  if (subscription.syncStatus === "PENDING")
    return {
      text: "📱 <b>Управление устройствами</b>\n\n🟡 Подписка настраивается. Список появится после синхронизации.",
      parseMode: "HTML",
      replyMarkup: { inline_keyboard: [back] },
    }
  if (subscription.syncStatus !== "SYNCED" || !subscription.remnawaveUserId)
    return {
      text: "📱 <b>Управление устройствами</b>\n\n🟠 Не удалось загрузить устройства. Мы повторим синхронизацию автоматически.",
      parseMode: "HTML",
      replyMarkup: {
        inline_keyboard: [
          [{ text: "💬 Поддержка", callback_data: "w:s" }],
          back,
        ],
      },
    }

  let devices: SubscriberDevice[]
  try {
    devices = await getSubscriptionDevices(userId)
  } catch {
    return {
      text: "📱 <b>Управление устройствами</b>\n\nСписок устройств временно недоступен. Попробуйте ещё раз.",
      parseMode: "HTML",
      replyMarkup: {
        inline_keyboard: [
          [{ text: "↻ Повторить", callback_data: "m:d" }],
          back,
        ],
      },
    }
  }

  const lines = [
    "📱 <b>Управление устройствами</b>",
    "",
    `🟢 Подключено устройств: <b>${devices.length} / ${subscription.deviceLimit}</b>`,
    "",
    devices.length
      ? "Нажмите на устройство, чтобы удалить его."
      : "Подключённых устройств пока нет.",
  ]
  if (devices.length >= subscription.deviceLimit)
    lines.push("", "Лимит подключённых устройств достигнут.")
  if (subscription.deviceLimit >= maximum)
    lines.push("", `Максимальный лимит: ${maximum}.`)

  const keyboard: TelegramButton[][] = devices.map((device) => {
    const presentation = devicePresentation(device)
    return [
      {
        text: `${presentation.icon} ${presentation.label}`,
        callback_data: `d:c:${telegramDeviceRef(userId, device.hwid)}`,
      },
    ]
  })
  if (subscription.deviceLimit < maximum)
    keyboard.push([
      { text: "➕ Дополнительное устройство", callback_data: "d:u" },
    ])
  keyboard.push(back)
  return {
    text: lines.join("\n"),
    parseMode: "HTML",
    replyMarkup: { inline_keyboard: keyboard },
  }
}

export async function getTelegramDeviceConfirmationScreen(
  userId: string,
  deviceRef: string
): Promise<TelegramScreen> {
  const devices = await getSubscriptionDevices(userId)
  const device = findTelegramDeviceByRef(userId, devices, deviceRef)
  if (!device) throw new BusinessError("NOT_FOUND", 404)
  const presentation = devicePresentation(device)
  return {
    text: [
      "🗑 <b>Удалить устройство?</b>",
      "",
      escapeHtml(presentation.label),
      "",
      "После удаления это устройство потеряет доступ. Его можно будет подключить заново, если лимит свободен.",
    ].join("\n"),
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        [{ text: "🗑 Удалить", callback_data: `d:x:${deviceRef}` }],
        [backButton("m:d", "‹ Назад к устройствам")],
      ],
    },
  }
}

export async function resolveTelegramDeviceHwid(
  userId: string,
  deviceRef: string
) {
  const device = findTelegramDeviceByRef(
    userId,
    await getSubscriptionDevices(userId),
    deviceRef
  )
  if (!device) throw new BusinessError("NOT_FOUND", 404)
  return device.hwid
}

export async function getTelegramDeviceUpgradeScreen(
  userId: string
): Promise<TelegramScreen> {
  const { subscription, maximum } = await loadDeviceContext(userId)
  if (
    !subscription ||
    subscription.expiresAt <= new Date() ||
    subscription.status === "SUSPENDED" ||
    subscription.syncStatus !== "SYNCED"
  )
    return getTelegramDevicesScreen(userId)
  if (subscription.deviceLimit >= maximum)
    return {
      text: `➕ <b>Увеличить лимит устройств</b>\n\nТекущий лимит: <b>${subscription.deviceLimit}</b>\nДоступен максимальный лимит: <b>${maximum}</b>.`,
      parseMode: "HTML",
      replyMarkup: { inline_keyboard: [[backButton("m:d", "‹ Назад")]] },
    }

  const keyboard: TelegramButton[][] = []
  for (
    let target = subscription.deviceLimit + 1;
    target <= maximum;
    target += 1
  ) {
    const quote = await getDeviceLimitUpgradeExpectation({
      userId,
      targetDeviceLimit: target,
    })
    keyboard.push([
      {
        text: `До ${target} · ${formatRub(quote.expectedAmountMinor)}`,
        callback_data: `u:q:${target}`,
      },
    ])
  }
  keyboard.push([backButton("m:d", "‹ Назад к устройствам")])
  return {
    text: [
      "➕ <b>Увеличить лимит устройств</b>",
      "",
      `Текущий лимит: <b>${subscription.deviceLimit}</b>`,
      `Доступное увеличение: <b>до ${maximum}</b>`,
      "",
      "Доплата рассчитывается пропорционально оставшемуся сроку.",
    ].join("\n"),
    parseMode: "HTML",
    replyMarkup: { inline_keyboard: keyboard },
  }
}

export async function getTelegramDeviceUpgradeReviewScreen(
  userId: string,
  targetDeviceLimit: number
): Promise<TelegramScreen> {
  const subscription = await db.subscription.findUniqueOrThrow({
    where: { userId },
  })
  const quote = await getDeviceLimitUpgradeExpectation({
    userId,
    targetDeviceLimit,
  })
  return {
    text: [
      "🧾 <b>Проверьте заказ</b>",
      "",
      `Текущий лимит: <b>${subscription.deviceLimit}</b>`,
      `Новый лимит: <b>${targetDeviceLimit}</b>`,
      "",
      `Итого: <b>${formatRub(quote.expectedAmountMinor)}</b>`,
    ].join("\n"),
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: "💳 Оплатить",
            callback_data: `u:x:${targetDeviceLimit}:${quote.pricingVersion}:${quote.expectedAmountMinor}`,
          },
        ],
        [backButton("d:u", "‹ Изменить")],
        [homeButton()],
      ],
    },
  }
}

export async function getTelegramRenewalDurationScreen(): Promise<TelegramScreen> {
  const pricing = await db.pricingSettings.findUniqueOrThrow({
    where: { key: "default" },
  })
  return {
    text: "💎 <b>Продление подписки</b>\n\nВыберите срок:",
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        ...availableDurationMonths(pricing).map((months) => [
          {
            text: monthsLabel(months),
            callback_data: `r:d:${months}`,
          } satisfies TelegramButton,
        ]),
        [backButton("m:h")],
      ],
    },
  }
}

export async function getTelegramRenewalDeviceScreen(
  durationMonths: number
): Promise<TelegramScreen> {
  const pricing = await db.pricingSettings.findUniqueOrThrow({
    where: { key: "default" },
  })
  if (
    !availableDurationMonths(pricing).includes(durationMonths as 1 | 3 | 6 | 12)
  )
    throw new BusinessError("PAYMENT_INVALID_PARAMETERS", 400)
  return {
    text: "📱 <b>Количество устройств</b>\n\nВыберите лимит устройств:",
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        ...Array.from(
          { length: pricing.maxDeviceLimit - pricing.minDeviceLimit + 1 },
          (_, index) => pricing.minDeviceLimit + index
        ).map((limit) => [
          {
            text: String(limit),
            callback_data: `r:l:${durationMonths}:${limit}`,
          } satisfies TelegramButton,
        ]),
        [backButton("r:0")],
      ],
    },
  }
}

export function getTelegramRenewalPlusScreen(
  durationMonths: number,
  deviceLimit: number
): TelegramScreen {
  return {
    text: "⚡️ <b>Доступ Plus</b>\n\nPlus добавляет LTE и расширенный доступ.",
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: "⚡️ Добавить Plus",
            callback_data: `r:q:${durationMonths}:${deviceLimit}:1`,
          },
        ],
        [
          {
            text: "Без Plus",
            callback_data: `r:q:${durationMonths}:${deviceLimit}:0`,
          },
        ],
        [backButton(`r:d:${durationMonths}`)],
      ],
    },
  }
}

export async function getTelegramRenewalReviewScreen(
  userId: string,
  input: { durationMonths: number; deviceLimit: number; lteEnabled: boolean }
): Promise<TelegramScreen> {
  const pricing = await db.pricingSettings.findUniqueOrThrow({
    where: { key: "default" },
  })
  const quote = calculatePrice(pricing, input)
  const expectation = await getCheckoutExpectation({ userId, ...input })
  if (
    expectation.expectedAmountMinor !== quote.amountMinor ||
    expectation.pricingVersion !== quote.pricingVersion
  )
    throw new BusinessError("PAYMENT_PRICE_CHANGED", 409)
  return {
    text: [
      "🧾 <b>Проверьте заказ</b>",
      "",
      `Срок: <b>${monthsLabel(input.durationMonths)}</b>`,
      `Устройства: <b>${input.deviceLimit}</b>`,
      `Доступ Plus: <b>${input.lteEnabled ? "да" : "нет"}</b>`,
      "",
      `Итого: <b>${formatRub(quote.amountMinor)}</b>`,
    ].join("\n"),
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: "💳 Оплатить",
            callback_data: `r:x:${input.durationMonths}:${input.deviceLimit}:${input.lteEnabled ? 1 : 0}:${quote.pricingVersion}:${quote.amountMinor}`,
          },
        ],
        [backButton("r:0", "‹ Изменить")],
        [homeButton()],
      ],
    },
  }
}

export function getTelegramCheckoutScreen(checkoutUrl: string): TelegramScreen {
  return {
    text: "💳 <b>Оплата</b>\n\nСчёт создан. Откройте защищённую страницу оплаты.",
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        [{ text: "💳 Перейти к оплате ↗", url: checkoutUrl }],
        [homeButton()],
      ],
    },
  }
}

export function getTelegramPriceChangedScreen(
  returnCallback = "m:r"
): TelegramScreen {
  return {
    text: "💎 <b>Цена изменилась</b>\n\nОбновите экран и проверьте заказ ещё раз.",
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        [{ text: "↻ Обновить", callback_data: returnCallback }],
        [homeButton()],
      ],
    },
  }
}

export function getTelegramTemporaryErrorScreen(
  returnCallback = "m:h"
): TelegramScreen {
  return {
    text: "🟠 <b>Сервис временно недоступен</b>\n\nПопробуйте ещё раз немного позже.",
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [[backButton(returnCallback)], [homeButton()]],
    },
  }
}

export function getTelegramWebsiteScreen(
  url: string,
  target: "home" | "instructions" | "support" | "partner" = "home"
): TelegramScreen {
  const labels = {
    home: ["Сайт", "🌐 Открыть личный кабинет ↗"],
    instructions: ["Подключение", "🔗 Открыть инструкции ↗"],
    support: ["Поддержка", "💬 Открыть поддержку ↗"],
    partner: ["Партнёрская программа", "🤝 Открыть партнёрку ↗"],
  } as const
  const [title, button] = labels[target]
  return {
    text: [
      `🪐 <b>PULSAR VPN — ${title}</b>`,
      "",
      "🔐 Вход подготовлен.",
      "⏳ Ссылка действует 5 минут.",
    ].join("\n"),
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [[{ text: button, url }], [backButton("m:h")]],
    },
  }
}

export async function updateTelegramReachability(input: {
  telegramId: string
  chatId: string
  status: string
}) {
  const blocked = input.status === "kicked" || input.status === "left"
  await db.telegramProfile.updateMany({
    where: { telegramId: input.telegramId },
    data: blocked
      ? { canReceiveMessages: false, botBlockedAt: new Date() }
      : {
          chatId: input.chatId,
          canReceiveMessages: true,
          botBlockedAt: null,
        },
  })
}

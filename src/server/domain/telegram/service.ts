import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import { getReferralSummaryView } from "@/src/server/queries/user-dashboard"

export const telegramCallbackActions = [
  "menu:home",
  "menu:referrals",
  "menu:site-login",
  "menu:payout-login",
] as const

export type TelegramCallbackAction = (typeof telegramCallbackActions)[number]

export function isTelegramCallbackAction(
  value: unknown
): value is TelegramCallbackAction {
  return (
    typeof value === "string" &&
    telegramCallbackActions.includes(value as TelegramCallbackAction)
  )
}

export type TelegramScreen = {
  text: string
  parseMode: "HTML"
  replyMarkup: {
    inline_keyboard: Array<
      Array<
        | { text: string; callback_data: TelegramCallbackAction }
        | { text: string; url: string }
      >
    >
  }
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
  const mod100 = value % 100
  const mod10 = value % 10
  if (mod100 >= 11 && mod100 <= 19) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

function remainingDaysText(expiresAt: Date) {
  const milliseconds = expiresAt.getTime() - Date.now()
  if (milliseconds <= 86_400_000) return "заканчивается сегодня"
  const days = Math.ceil(milliseconds / 86_400_000)
  return `${days === 1 ? "остался" : "осталось"} ${days} ${plural(days, "день", "дня", "дней")}`
}

function planText(months: number | null) {
  return months
    ? `${months} ${plural(months, "месяц", "месяца", "месяцев")}`
    : null
}

function rublesFromMinor(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(Math.floor(value / 100))
}

export function telegramMainPhotoUrl() {
  return `${getConfig().appUrl}/tg/lk.png`
}

export async function getTelegramUserId(telegramId: string) {
  const identity = await db.authIdentity.findUnique({
    where: { telegramId },
    select: { userId: true },
  })
  return identity?.userId ?? null
}

export async function getTelegramMainScreen(
  userId: string
): Promise<TelegramScreen> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      telegramProfile: {
        select: { firstName: true, username: true },
      },
      subscription: true,
    },
  })
  const profile = user.telegramProfile
  const name = escapeHtml(
    (profile?.firstName?.trim() || "ПОЛЬЗОВАТЕЛЬ").toLocaleUpperCase("ru-RU")
  )
  const username = profile?.username?.trim()
    ? ` · @${escapeHtml(profile.username.trim())}`
    : ""
  const subscription = user.subscription
  const now = new Date()
  const expired = Boolean(subscription && subscription.expiresAt <= now)
  const suspended = subscription?.status === "SUSPENDED"
  const active =
    Boolean(subscription) &&
    !expired &&
    !suspended &&
    (subscription?.status === "ACTIVE" || subscription?.status === "TRIAL")

  const lines = [
    "🪐 <b>PulsarVPN — Личный кабинет</b>",
    "",
    `👤 <b>${name}</b>${username}`,
    "",
  ]
  let purchaseLabel = "💎 Купить подписку"

  if (!subscription) {
    lines.push(
      "⚪ <b>Подписка не оформлена</b>",
      "Выберите тариф, чтобы подключить защищённый доступ."
    )
  } else if (expired) {
    purchaseLabel = "💎 Возобновить подписку"
    lines.push(
      "🔴 <b>Подписка закончилась</b>",
      `Доступ был активен до <b>${dateFormatter.format(subscription.expiresAt)}</b>.`,
      "",
      `📱 Лимит устройств: <b>${subscription.deviceLimit}</b>`,
      `⚡ LTE-доступ: <b>${subscription.lteEnabled ? "был подключён" : "не был подключён"}</b>`
    )
  } else if (suspended) {
    purchaseLabel = "💎 Возобновить подписку"
    lines.push(
      "🔴 <b>Доступ приостановлен</b>",
      `Доступ оплачен до <b>${dateFormatter.format(subscription.expiresAt)}</b>.`,
      "",
      `📱 Доступно устройств: <b>до ${subscription.deviceLimit}</b>`,
      `⚡ LTE-доступ: <b>${subscription.lteEnabled ? "есть" : "нет"}</b>`
    )
  } else {
    purchaseLabel =
      subscription.status === "TRIAL"
        ? "💎 Купить подписку"
        : "💎 Продлить подписку"
    const period = planText(subscription.planDurationMonths)
    lines.push(
      `🟢 <b>${period ? `${period} · ` : "Доступ активен · "}${remainingDaysText(subscription.expiresAt)}</b>`,
      `Подписка активна до <b>${dateFormatter.format(subscription.expiresAt)}</b>.`,
      "",
      `📱 Доступно устройств: <b>до ${subscription.deviceLimit}</b>`,
      `⚡ LTE-доступ: <b>${subscription.lteEnabled ? "есть" : "нет"}</b>`
    )
  }

  const keyboard: TelegramScreen["replyMarkup"]["inline_keyboard"] = []
  if (
    active &&
    subscription?.syncStatus === "SYNCED" &&
    subscription.subscriptionUrl
  )
    keyboard.push([
      { text: "🔗 Подключиться", url: subscription.subscriptionUrl },
    ])
  keyboard.push([
    { text: purchaseLabel, callback_data: "menu:site-login" },
  ])
  keyboard.push([
    { text: "🎁 Рефералы", callback_data: "menu:referrals" },
    { text: "🌐 Сайт", callback_data: "menu:site-login" },
  ])

  return {
    text: lines.join("\n"),
    parseMode: "HTML",
    replyMarkup: { inline_keyboard: keyboard },
  }
}

async function getReferralsScreen(userId: string): Promise<TelegramScreen> {
  const summary = await getReferralSummaryView(userId)
  const lines = [
    "🎁 <b>PulsarVPN — Рефералы</b>",
    "",
    `👥 Приглашено: <b>${summary.invitedUsers}</b>`,
    `🟢 Активных: <b>${summary.activeUsers}</b>`,
    `💰 Баланс: <b>${rublesFromMinor(summary.availableMinor)} ₽</b>`,
  ]
  if (summary.inviteUrl && summary.telegramInviteUrl)
    lines.push(
      "",
      "Ваша ссылка:",
      escapeHtml(summary.inviteUrl),
      "",
      "Ссылка для Telegram:",
      escapeHtml(summary.telegramInviteUrl)
    )
  else
    lines.push("", "Ссылки станут доступны после первой оплаты.")

  return {
    text: lines.join("\n"),
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        [{ text: "💸 Вывести", callback_data: "menu:payout-login" }],
        [{ text: "‹ Назад", callback_data: "menu:home" }],
      ],
    },
  }
}

export function getTelegramWebsiteScreen(url: string): TelegramScreen {
  return {
    text: [
      "🪐 <b>PulsarVPN — Сайт</b>",
      "",
      "🔐 Вход подготовлен.",
      "⏳ Ссылка действует 5 минут.",
    ].join("\n"),
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        [{ text: "🌐 Открыть личный кабинет ↗", url }],
        [{ text: "‹ Назад", callback_data: "menu:home" }],
      ],
    },
  }
}

export async function getTelegramScreen(
  userId: string,
  action: TelegramCallbackAction
) {
  if (action === "menu:referrals") return getReferralsScreen(userId)
  return getTelegramMainScreen(userId)
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

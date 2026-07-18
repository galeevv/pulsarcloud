import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import {
  getReferralSummaryView,
  getSubscriptionView,
  getWalletBalanceView,
} from "@/src/server/queries/user-dashboard"

export const telegramCallbackActions = [
  "menu:home",
  "menu:subscription",
  "menu:balance",
  "menu:referrals",
  "menu:support",
  "subscription:refresh",
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
  replyMarkup: {
    inline_keyboard: Array<Array<Record<string, unknown>>>
  }
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Yekaterinburg",
})

function rublesFromMinor(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(Math.floor(value / 100))
}

function mainKeyboard(): TelegramScreen["replyMarkup"] {
  return {
    inline_keyboard: [
      [
        { text: "Подписка", callback_data: "menu:subscription" },
        { text: "Баланс", callback_data: "menu:balance" },
      ],
      [
        {
          text: "Реферальная программа",
          callback_data: "menu:referrals",
        },
      ],
      [{ text: "Поддержка", callback_data: "menu:support" }],
      [
        {
          text: "Открыть сайт",
          url: `${getConfig().appUrl}/home`,
        },
      ],
    ],
  }
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
  const profile = await db.telegramProfile.findUnique({
    where: { userId },
    select: { firstName: true },
  })
  const greeting = profile?.firstName ? `, ${profile.firstName}` : ""
  return {
    text: `Добро пожаловать${greeting} в PULSAR.\n\nПодписка, баланс и реферальная программа синхронизированы с вашим аккаунтом на pulsar-cloud.space.`,
    replyMarkup: mainKeyboard(),
  }
}

async function getSubscriptionScreen(userId: string): Promise<TelegramScreen> {
  const subscription = await getSubscriptionView(userId)
  const appUrl = getConfig().appUrl
  if (!subscription)
    return {
      text: [
        "Подписка",
        "",
        "Статус: не оформлена",
        "Дата окончания: —",
        "Осталось дней: 0",
        "Устройств: —",
        "LTE-доступ: нет",
        "Remnawave: синхронизация не требуется",
      ].join("\n"),
      replyMarkup: {
        inline_keyboard: [
          [{ text: "Подключить VPN", url: `${appUrl}/subscription` }],
          [
            {
              text: "Управление устройствами",
              url: `${appUrl}/subscription`,
            },
          ],
          [{ text: "Продлить подписку", url: `${appUrl}/home` }],
          [
            { text: "Обновить", callback_data: "subscription:refresh" },
            { text: "Назад", callback_data: "menu:home" },
          ],
        ],
      },
    }

  const statuses: Record<string, string> = {
    ACTIVE: "активна",
    TRIAL: "пробная",
    EXPIRED: "истекла",
    CANCELED: "приостановлена",
  }
  const syncStatuses: Record<string, string> = {
    SYNCED: "синхронизирована",
    PENDING: "ожидает синхронизации",
    FAILED: "ошибка синхронизации",
    NOT_REQUIRED: "синхронизация не требуется",
  }
  const remainingDays = subscription.expiresAt
    ? Math.max(
        0,
        Math.ceil((subscription.expiresAt.getTime() - Date.now()) / 86_400_000)
      )
    : 0
  return {
    text: [
      "Подписка",
      "",
      `Статус: ${statuses[subscription.status] ?? subscription.status}`,
      `Дата окончания: ${subscription.expiresAt ? dateFormatter.format(subscription.expiresAt) : "—"}`,
      `Осталось дней: ${remainingDays}`,
      `Устройств: ${subscription.deviceLimit}`,
      `LTE-доступ: ${subscription.lteEnabled ? "есть" : "нет"}`,
      `Remnawave: ${syncStatuses[subscription.syncStatus] ?? subscription.syncStatus}`,
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: "Подключить VPN",
            url: subscription.subscriptionUrl ?? `${appUrl}/subscription`,
          },
        ],
        [
          {
            text: "Управление устройствами",
            url: `${appUrl}/subscription`,
          },
        ],
        [{ text: "Продлить подписку", url: `${appUrl}/home` }],
        [
          { text: "Обновить", callback_data: "subscription:refresh" },
          { text: "Назад", callback_data: "menu:home" },
        ],
      ],
    },
  }
}

async function getBalanceScreen(userId: string): Promise<TelegramScreen> {
  const balanceRub = await getWalletBalanceView(userId)
  return {
    text: `Баланс\n\nДоступно: ${Math.floor(balanceRub).toLocaleString("ru-RU")} ₽`,
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: "Использовать баланс",
            url: `${getConfig().appUrl}/home`,
          },
        ],
        [{ text: "Назад", callback_data: "menu:home" }],
      ],
    },
  }
}

async function getReferralsScreen(userId: string): Promise<TelegramScreen> {
  const summary = await getReferralSummaryView(userId)
  const link =
    summary.inviteUrl ?? "Ссылка станет доступна после первой оплаты."
  const keyboard: TelegramScreen["replyMarkup"]["inline_keyboard"] = []
  if (summary.inviteUrl)
    keyboard.push([
      {
        text: "Скопировать ссылку",
        copy_text: { text: summary.inviteUrl },
      },
    ])
  keyboard.push([{ text: "Назад", callback_data: "menu:home" }])
  return {
    text: [
      "Реферальная программа",
      "",
      `Реферальная ссылка: ${link}`,
      `Приглашено пользователей: ${summary.invitedUsers}`,
      `Активных пользователей: ${summary.activeUsers}`,
      `Начислено вознаграждений: ${rublesFromMinor(summary.rewardMinor)} ₽`,
      `Доступный баланс: ${rublesFromMinor(summary.availableMinor)} ₽`,
    ].join("\n"),
    replyMarkup: { inline_keyboard: keyboard },
  }
}

function getSupportScreen(): TelegramScreen {
  return {
    text: "Поддержка PULSAR поможет с подключением, подпиской и оплатой.",
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: "Написать в поддержку",
            url: `${getConfig().appUrl}/support`,
          },
        ],
        [{ text: "Назад", callback_data: "menu:home" }],
      ],
    },
  }
}

export async function getTelegramScreen(
  userId: string,
  action: TelegramCallbackAction
) {
  if (action === "menu:subscription" || action === "subscription:refresh")
    return getSubscriptionScreen(userId)
  if (action === "menu:balance") return getBalanceScreen(userId)
  if (action === "menu:referrals") return getReferralsScreen(userId)
  if (action === "menu:support") return getSupportScreen()
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

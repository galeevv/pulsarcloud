export const SUPPORT_MESSAGES_REFRESH_EVENT = "pulsar:support-messages-refresh"

export type SupportThreadMessage = {
  authorRole: string
  body: string
  createdAtDayKey: string
  createdAtDayLabel: string
  createdAtLabel: string
  id: string
}

type SupportMessageSource = {
  authorRole: string
  body: string
  createdAt: Date | string
  id: string
}

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

const dayLabelFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
})

const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
})

export function toSupportThreadMessage(
  message: SupportMessageSource
): SupportThreadMessage {
  const createdAt =
    message.createdAt instanceof Date
      ? message.createdAt
      : new Date(message.createdAt)

  return {
    authorRole: message.authorRole,
    body: message.body,
    createdAtDayKey: dayKeyFormatter.format(createdAt),
    createdAtDayLabel: dayLabelFormatter.format(createdAt),
    createdAtLabel: timeFormatter.format(createdAt),
    id: message.id,
  }
}

export type ErrorCode =
  | "AUTH_INVALID_OTP"
  | "AUTH_CHALLENGE_EXPIRED"
  | "AUTH_CHALLENGE_USED"
  | "AUTH_IDENTITY_IN_USE"
  | "AUTH_RATE_LIMITED"
  | "AUTH_FORBIDDEN"
  | "BILLING_DISABLED"
  | "PAYMENT_INVALID_PARAMETERS"
  | "PAYMENT_PRICE_CHANGED"
  | "PAYMENT_ALREADY_PROCESSED"
  | "SUBSCRIPTION_NOT_FOUND"
  | "SUBSCRIPTION_UPGRADE_REQUIRES_PAYMENT"
  | "REFERRAL_INVALID_INVITE"
  | "REFERRAL_ALREADY_ASSIGNED"
  | "WALLET_INSUFFICIENT_BALANCE"
  | "PAYOUT_BELOW_MINIMUM"
  | "ADMIN_FORBIDDEN"
  | "INTEGRATION_TEMPORARILY_UNAVAILABLE"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "NOT_FOUND"

const friendlyMessages: Record<ErrorCode, string> = {
  AUTH_INVALID_OTP: "Неверный код, попробуйте снова.",
  AUTH_CHALLENGE_EXPIRED: "Код устарел. Запросите новый.",
  AUTH_CHALLENGE_USED: "Этот код уже использован.",
  AUTH_IDENTITY_IN_USE: "Этот способ входа уже связан с другим аккаунтом.",
  AUTH_RATE_LIMITED: "Слишком много попыток. Попробуйте немного позже.",
  AUTH_FORBIDDEN: "Войдите в аккаунт, чтобы продолжить.",
  BILLING_DISABLED: "Оплата временно приостановлена. Попробуйте позже.",
  PAYMENT_INVALID_PARAMETERS: "Проверьте параметры подписки.",
  PAYMENT_PRICE_CHANGED:
    "Цена изменилась. Обновите страницу и проверьте сумму ещё раз.",
  PAYMENT_ALREADY_PROCESSED: "Платёж уже обработан.",
  SUBSCRIPTION_NOT_FOUND: "Подписка не найдена.",
  SUBSCRIPTION_UPGRADE_REQUIRES_PAYMENT:
    "Изменение тарифа применится при следующем продлении.",
  REFERRAL_INVALID_INVITE: "Реферальная ссылка недействительна.",
  REFERRAL_ALREADY_ASSIGNED: "Пригласившего нельзя изменить.",
  WALLET_INSUFFICIENT_BALANCE: "Недостаточно средств на внутреннем балансе.",
  PAYOUT_BELOW_MINIMUM: "Сумма меньше минимальной выплаты.",
  ADMIN_FORBIDDEN: "Доступ запрещён.",
  INTEGRATION_TEMPORARILY_UNAVAILABLE:
    "Сервис временно недоступен. Мы повторим попытку автоматически.",
  INVALID_INPUT: "Проверьте введённые данные.",
  CONFLICT: "Операция конфликтует с текущим состоянием.",
  NOT_FOUND: "Запись не найдена.",
}

export class BusinessError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status = 400,
    technicalMessage?: string
  ) {
    super(technicalMessage ?? friendlyMessages[code])
    this.name = "BusinessError"
  }
  get friendlyMessage() {
    return friendlyMessages[this.code]
  }
}

export function toFriendlyError(error: unknown) {
  return error instanceof BusinessError
    ? { code: error.code, message: error.friendlyMessage }
    : {
        code: "INTEGRATION_TEMPORARILY_UNAVAILABLE" as const,
        message: friendlyMessages.INTEGRATION_TEMPORARILY_UNAVAILABLE,
      }
}

"use client"

import * as React from "react"
import { ArrowLeftIcon, ArrowRightIcon, SendIcon } from "lucide-react"

import {
  requestEmailOtpAction,
  startTelegramLoginAction,
  verifyEmailOtpAction,
  type RequestOtpState,
  type TelegramLoginState,
  type VerifyOtpState,
} from "@/app/(auth)/actions"
import { Button } from "@/components/ui/button"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  PulsarAssetCard,
  pulsarCtaClass,
} from "@/components/app/pulsar-primitives"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Separator } from "@/components/ui/separator"

const requestInitialState: RequestOtpState = { ok: false }
const verifyInitialState: VerifyOtpState = { ok: false }
const telegramInitialState: TelegramLoginState = { ok: false }

export function AuthCard({
  authError,
  invite,
}: {
  authError?: "expired" | "used"
  invite?: string
}) {
  const [requestState, requestAction, isRequestPending] = React.useActionState(
    requestEmailOtpAction,
    requestInitialState
  )
  const [verifyState, verifyAction, isVerifyPending] = React.useActionState(
    verifyEmailOtpAction,
    verifyInitialState
  )
  const [, telegramAction, isTelegramPending] = React.useActionState(
    startTelegramLoginAction,
    telegramInitialState
  )
  const [dismissedChallengeId, setDismissedChallengeId] = React.useState<
    string | null
  >(null)

  const email = requestState.email ?? ""
  const challengeId = requestState.challengeId ?? ""
  const isLinkSent = Boolean(
    requestState.ok &&
    requestState.email &&
    requestState.challengeId &&
    requestState.challengeId !== dismissedChallengeId
  )

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-8">
      <PulsarAssetCard
        src="/hero/pulsar.gif"
        alt="PulsarVPN"
        cardClassName="w-full max-w-md"
        contentClassName="relative flex min-h-56 flex-col justify-center gap-4"
      >
        {isLinkSent ? (
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            className="absolute top-4 left-4"
            aria-label="Изменить email"
            onClick={() => setDismissedChallengeId(challengeId)}
          >
            <ArrowLeftIcon />
          </Button>
        ) : null}
        <CardHeader className="items-center gap-1.5 p-0 text-center">
          <CardTitle>
            {isLinkSent ? "Введите код" : "Добро пожаловать"}
          </CardTitle>
          <CardDescription>
            {isLinkSent
              ? `Код отправлен на ${email}`
              : "Подключиться к pulsar с помощью"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-0">
          {isLinkSent ? (
            <MagicLinkSent
              key={challengeId}
              action={verifyAction}
              challengeId={challengeId}
              email={email}
              invite={invite}
              isRequestPending={isRequestPending}
              isVerifyPending={isVerifyPending}
              message={verifyState.message}
              requestAction={requestAction}
            />
          ) : (
            <EmailStartForm
              action={requestAction}
              authError={authError}
              invite={invite}
              isRequestPending={isRequestPending}
              isTelegramPending={isTelegramPending}
              message={!requestState.ok ? requestState.message : undefined}
              telegramAction={telegramAction}
            />
          )}
        </CardContent>
      </PulsarAssetCard>
    </main>
  )
}

function EmailStartForm({
  action,
  authError,
  invite,
  isRequestPending,
  isTelegramPending,
  message,
  telegramAction,
}: {
  action: React.ComponentProps<"form">["action"]
  authError?: "expired" | "used"
  invite?: string
  isRequestPending: boolean
  isTelegramPending: boolean
  message?: string
  telegramAction: React.ComponentProps<"form">["action"]
}) {
  const authErrorMessage =
    authError === "used"
      ? "Ссылка уже использована. Запросите новую ссылку для входа."
      : authError === "expired"
        ? "Ссылка устарела. Запросите новую ссылку для входа."
        : null

  return (
    <>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="invite" value={invite ?? ""} />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email" className="sr-only">
              Email
            </FieldLabel>
            <InputGroup className="h-11 rounded-[18px] bg-input/50">
              <InputGroupInput
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Email"
                required
              />
              <InputGroupAddon align="inline-end" className="pr-1.5">
                <InputGroupButton
                  type="submit"
                  size="icon-sm"
                  variant="default"
                  aria-label={
                    isRequestPending ? "Отправляем ссылку" : "Продолжить"
                  }
                  disabled={isRequestPending}
                >
                  <ArrowRightIcon />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </FieldGroup>
        {message || authErrorMessage ? (
          <p className="text-sm text-destructive">
            {message ?? authErrorMessage}
          </p>
        ) : null}
      </form>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">или</span>
        <Separator className="flex-1" />
      </div>

      <form action={telegramAction}>
        <input type="hidden" name="invite" value={invite ?? ""} />
        <Button
          type="submit"
          variant="outline"
          className={pulsarCtaClass}
          disabled={isTelegramPending}
        >
          <SendIcon data-icon="inline-start" />С помощью Telegram
        </Button>
      </form>
    </>
  )
}

function MagicLinkSent({
  action,
  challengeId,
  email,
  invite,
  isRequestPending,
  isVerifyPending,
  message,
  requestAction,
}: {
  action: React.ComponentProps<"form">["action"]
  challengeId: string
  email: string
  invite?: string
  isRequestPending: boolean
  isVerifyPending: boolean
  message?: string
  requestAction: React.ComponentProps<"form">["action"]
}) {
  const [resendSeconds, setResendSeconds] = React.useState(60)

  React.useEffect(() => {
    if (resendSeconds <= 0) {
      return
    }

    const timer = window.setTimeout(() => {
      setResendSeconds((current) => Math.max(0, current - 1))
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [resendSeconds])

  return (
    <div className="flex flex-col gap-4">
      <ManualCodeForm
        action={action}
        challengeId={challengeId}
        email={email}
        invite={invite}
        isVerifyPending={isVerifyPending}
        message={message}
      />

      {resendSeconds > 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          Новая ссылка через {formatTimer(resendSeconds)}
        </p>
      ) : (
        <form action={requestAction} className="flex justify-center">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="invite" value={invite ?? ""} />
          <Button
            type="submit"
            size="sm"
            variant="link"
            className="h-auto px-0 text-sm"
            disabled={isRequestPending}
          >
            {isRequestPending
              ? "Отправляем ссылку..."
              : "Отправить новую ссылку"}
          </Button>
        </form>
      )}
    </div>
  )
}

function ManualCodeForm({
  action,
  challengeId,
  email,
  invite,
  isVerifyPending,
  message,
}: {
  action: React.ComponentProps<"form">["action"]
  challengeId: string
  email: string
  invite?: string
  isVerifyPending: boolean
  message?: string
}) {
  const otpFormRef = React.useRef<HTMLFormElement>(null)
  const lastSubmittedOtpRef = React.useRef("")
  const [otp, setOtp] = React.useState("")

  React.useEffect(() => {
    if (
      otp.length !== 6 ||
      isVerifyPending ||
      lastSubmittedOtpRef.current === otp
    ) {
      return
    }

    lastSubmittedOtpRef.current = otp
    otpFormRef.current?.requestSubmit()
  }, [isVerifyPending, otp])

  function handleOtpChange(value: string) {
    const nextValue = value.replace(/\D/g, "").slice(0, 6)

    if (nextValue.length < 6) {
      lastSubmittedOtpRef.current = ""
    }

    setOtp(nextValue)
  }

  return (
    <form ref={otpFormRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="challengeId" value={challengeId} />
      <input type="hidden" name="invite" value={invite ?? ""} />
      <FieldGroup>
        <Field>
          <FieldLabel className="sr-only">Код из письма</FieldLabel>
          <InputOTP
            name="otp"
            value={otp}
            onChange={handleOtpChange}
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            containerClassName="justify-center"
            disabled={isVerifyPending}
          >
            <InputOTPGroup>
              {Array.from({ length: 6 }).map((_, index) => (
                <InputOTPSlot key={index} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </Field>
      </FieldGroup>
      {message ? (
        <p className="text-center text-sm text-destructive">{message}</p>
      ) : null}
      {isVerifyPending ? (
        <p className="text-center text-sm text-muted-foreground">
          Проверяем код...
        </p>
      ) : null}
    </form>
  )
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = String(seconds % 60).padStart(2, "0")

  return `${minutes}:${rest}`
}

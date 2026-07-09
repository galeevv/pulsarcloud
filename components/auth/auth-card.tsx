"use client"

import Image from "next/image"
import Link from "next/link"
import * as React from "react"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  KeyRoundIcon,
  MailCheckIcon,
  SendIcon,
} from "lucide-react"

import {
  requestEmailOtpAction,
  startTelegramStubAction,
  verifyEmailOtpAction,
  type RequestOtpState,
  type TelegramStubState,
  type VerifyOtpState,
} from "@/app/(auth)/actions"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
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
import { cn } from "@/lib/utils"

const requestInitialState: RequestOtpState = { ok: false }
const verifyInitialState: VerifyOtpState = { ok: false }
const telegramInitialState: TelegramStubState = { ok: false }

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
  const [telegramState, telegramAction, isTelegramPending] =
    React.useActionState(startTelegramStubAction, telegramInitialState)
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
      <Card className="w-full max-w-md gap-0 overflow-hidden rounded-3xl border border-border/70 bg-card/40 py-0">
        <div className="relative aspect-[21/9] w-full">
          <Image
            src="/hero/pulsar.gif"
            alt="PulsarVPN"
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 448px"
            unoptimized
            priority
          />
        </div>
        <Separator className="my-0" />
        <div className="relative flex min-h-56 flex-col justify-center gap-4 p-4">
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
            <CardTitle>Войти или создать аккаунт</CardTitle>
            <CardDescription>
              {isLinkSent
                ? `Ссылка отправлена на ${email}`
                : "Введите email, чтобы получить ссылку для входа."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-0">
            {isLinkSent ? (
              <MagicLinkSent
                key={challengeId}
                action={verifyAction}
                challengeId={challengeId}
                devMagicLink={requestState.devMagicLink}
                devOtp={requestState.devOtp}
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
                telegramMessage={telegramState.message}
              />
            )}
          </CardContent>
        </div>
      </Card>
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
  telegramMessage,
}: {
  action: React.ComponentProps<"form">["action"]
  authError?: "expired" | "used"
  invite?: string
  isRequestPending: boolean
  isTelegramPending: boolean
  message?: string
  telegramAction: React.ComponentProps<"form">["action"]
  telegramMessage?: string
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
        <Button
          type="submit"
          variant="outline"
          className="h-11 w-full rounded-[18px]"
          disabled={isTelegramPending}
        >
          <SendIcon data-icon="inline-start" />С помощью Telegram
        </Button>
      </form>
      {telegramMessage ? (
        <p className="text-center text-xs text-muted-foreground">
          {telegramMessage}
        </p>
      ) : null}
    </>
  )
}

function MagicLinkSent({
  action,
  challengeId,
  devMagicLink,
  devOtp,
  email,
  invite,
  isRequestPending,
  isVerifyPending,
  message,
  requestAction,
}: {
  action: React.ComponentProps<"form">["action"]
  challengeId: string
  devMagicLink?: string
  devOtp?: string
  email: string
  invite?: string
  isRequestPending: boolean
  isVerifyPending: boolean
  message?: string
  requestAction: React.ComponentProps<"form">["action"]
}) {
  const [resendSeconds, setResendSeconds] = React.useState(60)
  const [showManualCode, setShowManualCode] = React.useState(false)

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
      <div className="soft-panel flex items-center gap-3 p-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/40">
          <MailCheckIcon className="size-4" />
        </div>
        <p className="text-sm leading-5 text-muted-foreground">
          Откройте письмо и нажмите “Войти в Pulsar”. Ссылка действует 5 минут.
        </p>
      </div>

      {devMagicLink ? (
        <Link
          href={devMagicLink}
          className={cn(
            buttonVariants({ size: "lg" }),
            "h-11 w-full rounded-[18px]"
          )}
        >
          Войти в dev-режиме
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      ) : null}

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full rounded-[18px]"
        onClick={() => setShowManualCode((value) => !value)}
      >
        <KeyRoundIcon data-icon="inline-start" />
        {showManualCode ? "Скрыть код" : "Ввести код вручную"}
      </Button>

      {showManualCode ? (
        <ManualCodeForm
          action={action}
          challengeId={challengeId}
          devOtp={devOtp}
          email={email}
          invite={invite}
          isVerifyPending={isVerifyPending}
          message={message}
        />
      ) : null}

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
  devOtp,
  email,
  invite,
  isVerifyPending,
  message,
}: {
  action: React.ComponentProps<"form">["action"]
  challengeId: string
  devOtp?: string
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
          {devOtp ? (
            <FieldDescription className="text-center">
              Dev code: {devOtp}
            </FieldDescription>
          ) : null}
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

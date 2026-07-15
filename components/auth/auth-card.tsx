"use client"

import * as React from "react"
import { ArrowLeftIcon, ArrowRightIcon, SendIcon } from "lucide-react"
import { toast } from "sonner"
import {
  PulsarAssetCard,
  pulsarCtaClass,
} from "@/components/app/pulsar-primitives"
import { Button } from "@/components/ui/button"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

type ApiError = { message?: string }
type ErrorTarget = "email" | "otp" | "telegram"

const RESEND_COOLDOWN_MS = 60_000

function authLinkErrorMessage(authError?: "expired" | "used") {
  if (!authError) return null
  return authError === "used"
    ? "Ссылка уже использована. Запросите новый код."
    : "Ссылка устарела. Запросите новый код."
}

export function AuthCard({
  authError,
  invite,
  admin = false,
}: {
  authError?: "expired" | "used"
  invite?: string
  admin?: boolean
}) {
  const [email, setEmail] = React.useState("")
  const [challengeId, setChallengeId] = React.useState<string>()
  const [otp, setOtp] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [errorTarget, setErrorTarget] = React.useState<ErrorTarget | null>(null)
  const [resendAvailableAt, setResendAvailableAt] = React.useState(0)
  const [clock, setClock] = React.useState(0)
  const otpRef = React.useRef<HTMLInputElement>(null)
  const verifyingRef = React.useRef(false)

  const resendSeconds = Math.max(
    0,
    Math.ceil((resendAvailableAt - clock) / 1000)
  )

  React.useEffect(() => {
    const message = authLinkErrorMessage(authError)
    if (!message) return
    toast.error(message)
  }, [authError])

  React.useEffect(() => {
    if (!challengeId || resendAvailableAt <= Date.now()) return

    const tick = () => {
      const now = Date.now()
      setClock(now)
      if (now >= resendAvailableAt) window.clearInterval(timer)
    }
    const timer = window.setInterval(tick, 1000)
    tick()
    return () => window.clearInterval(timer)
  }, [challengeId, resendAvailableAt])

  function showError(message: string, target: ErrorTarget) {
    setErrorTarget(target)
    toast.error(message)
  }

  async function requestCode(event: React.FormEvent) {
    event.preventDefault()
    await requestEmailCode()
  }

  async function requestEmailCode() {
    setPending(true)
    setErrorTarget(null)
    try {
      const response = await fetch("/api/auth/email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          invite,
          purpose: admin ? "ADMIN_LOGIN" : "USER_LOGIN",
        }),
      })
      const result = (await response.json()) as {
        challengeId?: string
        devOtp?: string
      } & ApiError
      if (!response.ok || !result.challengeId)
        throw new Error(result.message ?? "Не удалось отправить код.")
      setChallengeId(result.challengeId)
      setOtp("")
      const nextResendAt = Date.now() + RESEND_COOLDOWN_MS
      setClock(Date.now())
      setResendAvailableAt(nextResendAt)
      if (result.devOtp) toast.info(`Test mode: код ${result.devOtp}`)
    } catch (cause) {
      showError(
        cause instanceof Error ? cause.message : "Не удалось отправить код.",
        "email"
      )
    } finally {
      setPending(false)
    }
  }

  async function verifyCode(value: string) {
    if (!challengeId || verifyingRef.current) return
    verifyingRef.current = true
    setPending(true)
    setErrorTarget(null)
    let shouldRefocus = false
    try {
      const response = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, otp: value }),
      })
      const result = (await response.json()) as {
        redirectTo?: string
      } & ApiError
      if (!response.ok || !result.redirectTo)
        throw new Error(result.message ?? "Не удалось подтвердить код.")
      window.location.assign(result.redirectTo)
    } catch (cause) {
      showError(
        cause instanceof Error ? cause.message : "Не удалось подтвердить код.",
        "otp"
      )
      setOtp("")
      shouldRefocus = true
    } finally {
      verifyingRef.current = false
      setPending(false)
      if (shouldRefocus) window.setTimeout(() => otpRef.current?.focus(), 0)
    }
  }

  async function startTelegram() {
    setPending(true)
    setErrorTarget(null)
    try {
      const response = await fetch("/api/auth/telegram/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invite,
          purpose: admin ? "ADMIN_LOGIN" : "USER_LOGIN",
        }),
      })
      const result = (await response.json()) as { url?: string } & ApiError
      if (!response.ok || !result.url)
        throw new Error(result.message ?? "Telegram временно недоступен.")
      window.location.assign(result.url)
    } catch (cause) {
      showError(
        cause instanceof Error
          ? cause.message
          : "Telegram временно недоступен.",
        "telegram"
      )
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-svh w-full items-center justify-center overflow-x-hidden px-4 py-8">
      <PulsarAssetCard
        src="/hero/pulsar.gif"
        alt="PulsarVPN"
        cardClassName="isolate w-full max-w-md"
        contentClassName="relative flex min-h-56 w-full min-w-0 flex-col justify-center gap-4 overflow-hidden"
      >
        {challengeId ? (
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            className="absolute top-4 left-4"
            aria-label="Изменить email"
            onClick={() => {
              setChallengeId(undefined)
              setOtp("")
              setErrorTarget(null)
            }}
          >
            <ArrowLeftIcon />
          </Button>
        ) : null}
        <CardHeader className="items-center gap-1.5 p-0 text-center">
          <CardTitle className="text-lg font-semibold">
            {challengeId
              ? "Введите код"
              : admin
                ? "Вход администратора"
                : "Добро пожаловать"}
          </CardTitle>
          <CardDescription>
            {challengeId
              ? `Код отправлен на ${email}`
              : "Подключиться к Pulsar с помощью"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4 p-0">
          {challengeId ? (
            <div className="flex w-full min-w-0 flex-col gap-3">
              <FieldGroup className="min-w-0">
                <Field className="min-w-0" data-invalid={errorTarget === "otp"}>
                  <FieldLabel className="sr-only">Код из письма</FieldLabel>
                  <InputOTP
                    ref={otpRef}
                    name="otp"
                    value={otp}
                    onChange={(value) => {
                      setOtp(value.replace(/\D/g, "").slice(0, 6))
                      setErrorTarget(null)
                    }}
                    onComplete={(value) => void verifyCode(value)}
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    pushPasswordManagerStrategy="none"
                    containerClassName="w-full min-w-0 justify-center"
                    disabled={pending}
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <InputOTPSlot
                          key={index}
                          index={index}
                          aria-invalid={errorTarget === "otp"}
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </Field>
              </FieldGroup>
              <Button
                type="button"
                size="sm"
                variant="link"
                className="h-auto px-0 text-sm"
                disabled={pending || resendSeconds > 0}
                onClick={() => void requestEmailCode()}
              >
                {resendSeconds > 0
                  ? `Отправить новый код через ${resendSeconds} сек.`
                  : "Отправить новый код"}
              </Button>
            </div>
          ) : (
            <>
              <form className="flex flex-col gap-4" onSubmit={requestCode}>
                <FieldGroup>
                  <Field data-invalid={errorTarget === "email"}>
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
                        value={email}
                        onChange={(event) => {
                          setEmail(event.target.value)
                          setErrorTarget(null)
                        }}
                        aria-invalid={errorTarget === "email"}
                        disabled={pending}
                      />
                      <InputGroupAddon align="inline-end" className="pr-1.5">
                        <InputGroupButton
                          type="submit"
                          size="icon-sm"
                          variant="default"
                          aria-label="Продолжить"
                          disabled={pending}
                        >
                          <ArrowRightIcon />
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>
                </FieldGroup>
              </form>
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">или</span>
                <Separator className="flex-1" />
              </div>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className={pulsarCtaClass}
                onClick={startTelegram}
                disabled={pending}
                aria-invalid={errorTarget === "telegram"}
              >
                <span className="flex w-full items-center justify-between px-0">
                  <span className="flex items-center gap-2">
                    <SendIcon data-icon="inline-start" />С помощью Telegram
                  </span>
                  <ArrowRightIcon data-icon="inline-end" />
                </span>
              </Button>
            </>
          )}
        </CardContent>
      </PulsarAssetCard>
    </main>
  )
}

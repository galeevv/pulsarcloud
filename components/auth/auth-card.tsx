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
  const [error, setError] = React.useState<string | null>(() =>
    authLinkErrorMessage(authError)
  )
  const otpRef = React.useRef<HTMLInputElement>(null)
  const verifyingRef = React.useRef(false)

  React.useEffect(() => {
    const message = authLinkErrorMessage(authError)
    if (!message) return
    toast.error(message)
  }, [authError])

  function showError(message: string) {
    setError(message)
    toast.error(message)
  }

  async function requestCode(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
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
      if (result.devOtp) toast.info(`Test mode: код ${result.devOtp}`)
    } catch (cause) {
      showError(
        cause instanceof Error ? cause.message : "Не удалось отправить код."
      )
    } finally {
      setPending(false)
    }
  }

  async function verifyCode(value: string) {
    if (!challengeId || verifyingRef.current) return
    verifyingRef.current = true
    setPending(true)
    setError(null)
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
        cause instanceof Error ? cause.message : "Не удалось подтвердить код."
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
    setError(null)
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
        cause instanceof Error ? cause.message : "Telegram временно недоступен."
      )
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-8">
      <PulsarAssetCard
        src="/hero/pulsar.gif"
        alt="PulsarVPN"
        cardClassName="w-full max-w-md"
        contentClassName="relative flex min-h-56 flex-col justify-center gap-4"
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
              setError(null)
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
        <CardContent className="flex flex-col gap-4 p-0">
          {challengeId ? (
            <div className="flex flex-col gap-3">
              <FieldGroup>
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel className="sr-only">Код из письма</FieldLabel>
                  <InputOTP
                    ref={otpRef}
                    name="otp"
                    value={otp}
                    onChange={(value) => {
                      setOtp(value.replace(/\D/g, "").slice(0, 6))
                      setError(null)
                    }}
                    onComplete={(value) => void verifyCode(value)}
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    containerClassName="justify-center"
                    disabled={pending}
                  >
                    {
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot
                            key={index}
                            index={index}
                            aria-invalid={Boolean(error)}
                          />
                        ))}
                      </InputOTPGroup>
                    }
                  </InputOTP>
                </Field>
              </FieldGroup>
              <Button
                type="button"
                size="sm"
                variant="link"
                className="h-auto px-0 text-sm"
                disabled={pending}
                onClick={() => {
                  setChallengeId(undefined)
                  setOtp("")
                }}
              >
                Отправить новый код
              </Button>
            </div>
          ) : (
            <>
              <form className="flex flex-col gap-4" onSubmit={requestCode}>
                <FieldGroup>
                  <Field data-invalid={Boolean(error)}>
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
                          setError(null)
                        }}
                        aria-invalid={Boolean(error)}
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
              >
                <span className="flex w-full items-center justify-between px-2">
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

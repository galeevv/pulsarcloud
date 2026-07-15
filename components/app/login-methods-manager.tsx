"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  MailIcon,
  SendIcon,
} from "lucide-react"
import { toast } from "sonner"

import { PulsarIconContainer } from "@/components/app/pulsar-primitives"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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

export function LoginMethodsManager({
  email,
  telegramId,
  telegramUsername,
}: {
  email: string | null
  telegramId: string | null
  telegramUsername: string | null
}) {
  const router = useRouter()
  const [emailDialogOpen, setEmailDialogOpen] = React.useState(false)
  const [challengeId, setChallengeId] = React.useState<string>()
  const [otp, setOtp] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const otpRef = React.useRef<HTMLInputElement>(null)

  function changeEmailDialog(open: boolean) {
    setEmailDialogOpen(open)
    if (!open) {
      setChallengeId(undefined)
      setOtp("")
      setPending(false)
    }
  }

  async function linkEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const value = new FormData(event.currentTarget).get("email")

    try {
      const response = await fetch("/api/auth/email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, purpose: "LINK_EMAIL" }),
      })
      const result = (await response.json()) as {
        challengeId?: string
        devOtp?: string
        message?: string
      }

      if (!response.ok || !result.challengeId)
        throw new Error(result.message ?? "Не удалось отправить код.")

      setChallengeId(result.challengeId)
      setOtp("")
      if (result.devOtp) toast.info(`Test mode: код ${result.devOtp}`)
      window.setTimeout(() => otpRef.current?.focus(), 0)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось отправить код."
      )
    } finally {
      setPending(false)
    }
  }

  async function verifyEmail(value: string) {
    if (!challengeId || pending) return
    setPending(true)

    try {
      const response = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, otp: value }),
      })
      const result = (await response.json()) as { message?: string }

      if (!response.ok)
        throw new Error(result.message ?? "Не удалось привязать email.")

      toast.success("Email привязан.")
      changeEmailDialog(false)
      router.refresh()
    } catch (error) {
      setOtp("")
      toast.error(
        error instanceof Error ? error.message : "Не удалось привязать email."
      )
      window.setTimeout(() => otpRef.current?.focus(), 0)
    } finally {
      setPending(false)
    }
  }

  async function linkTelegram() {
    setPending(true)

    try {
      const response = await fetch("/api/auth/telegram/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "LINK_TELEGRAM" }),
      })
      const result = (await response.json()) as {
        url?: string
        message?: string
      }

      if (!response.ok || !result.url)
        throw new Error(result.message ?? "Telegram недоступен.")

      window.location.assign(result.url)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Telegram недоступен."
      )
      setPending(false)
    }
  }

  return (
    <div className="soft-panel flex flex-col gap-3 p-3">
      <p className="text-center text-sm font-semibold">Способы входа</p>

      <MethodCard
        icon={MailIcon}
        label="Email"
        value={email ?? "Не привязан"}
        connected={Boolean(email)}
        action={
          !email ? (
            <Dialog open={emailDialogOpen} onOpenChange={changeEmailDialog}>
              <DialogTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                  />
                }
              >
                Привязать
              </DialogTrigger>
              <DialogContent className="w-full min-w-0 gap-5 p-5 sm:max-w-sm">
                <DialogHeader className="items-center text-center">
                  <DialogTitle className="text-lg font-semibold">
                    {challengeId ? "Введите код" : "Привязать email"}
                  </DialogTitle>
                  <DialogDescription>
                    {challengeId
                      ? "Введите шестизначный код из письма."
                      : "Укажите email, который будет использоваться для входа."}
                  </DialogDescription>
                </DialogHeader>

                {challengeId ? (
                  <div className="relative flex w-full min-w-0 flex-col gap-4 pt-1">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      className="absolute -top-1 left-0"
                      aria-label="Изменить email"
                      disabled={pending}
                      onClick={() => {
                        setChallengeId(undefined)
                        setOtp("")
                      }}
                    >
                      <ArrowLeftIcon />
                    </Button>
                    <FieldGroup className="min-w-0 pt-10">
                      <Field className="min-w-0">
                        <FieldLabel className="sr-only">
                          Код из письма
                        </FieldLabel>
                        <InputOTP
                          ref={otpRef}
                          value={otp}
                          onChange={(value) =>
                            setOtp(value.replace(/\D/g, "").slice(0, 6))
                          }
                          onComplete={(value) => void verifyEmail(value)}
                          maxLength={6}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pushPasswordManagerStrategy="none"
                          containerClassName="w-full min-w-0 justify-center"
                          disabled={pending}
                        >
                          <InputOTPGroup>
                            {Array.from({ length: 6 }).map((_, index) => (
                              <InputOTPSlot key={index} index={index} />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </Field>
                    </FieldGroup>
                  </div>
                ) : (
                  <form className="w-full" onSubmit={linkEmail}>
                    <FieldGroup>
                      <Field>
                        <FieldLabel className="sr-only" htmlFor="link-email">
                          Email
                        </FieldLabel>
                        <InputGroup className="h-11 rounded-[18px] bg-input/50">
                          <InputGroupInput
                            id="link-email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            placeholder="Email"
                            required
                            disabled={pending}
                          />
                          <InputGroupAddon
                            align="inline-end"
                            className="pr-1.5"
                          >
                            <InputGroupButton
                              type="submit"
                              size="icon-sm"
                              variant="default"
                              aria-label="Отправить код"
                              disabled={pending}
                            >
                              <ArrowRightIcon />
                            </InputGroupButton>
                          </InputGroupAddon>
                        </InputGroup>
                      </Field>
                    </FieldGroup>
                  </form>
                )}
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      <MethodCard
        icon={SendIcon}
        label="Telegram"
        value={
          telegramId
            ? telegramUsername
              ? `@${telegramUsername.replace(/^@/, "")}`
              : "Username не указан"
            : "Не привязан"
        }
        connected={Boolean(telegramId)}
        action={
          !telegramId ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={linkTelegram}
              disabled={pending}
            >
              Привязать
            </Button>
          ) : undefined
        }
      />
    </div>
  )
}

function MethodCard({
  action,
  connected,
  icon: Icon,
  label,
  value,
}: {
  action?: React.ReactNode
  connected: boolean
  icon: typeof MailIcon
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/25 p-3">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PulsarIconContainer icon={Icon} />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="truncate text-sm font-medium">{value}</p>
          </div>
        </div>
        <div className="shrink-0">
          {connected ? (
            <Badge variant="secondary">
              <CheckIcon data-icon="inline-start" />
              Привязан
            </Badge>
          ) : (
            action
          )}
        </div>
      </div>
    </div>
  )
}

"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, MailIcon, SendIcon } from "lucide-react"
import { toast } from "sonner"
import { PulsarIconContainer } from "@/components/app/pulsar-primitives"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"

export function LoginMethodsManager({
  email,
  telegramId,
  telegramSettings,
}: {
  email: string | null
  telegramId: string | null
  telegramSettings?: { transactional: boolean; news: boolean }
}) {
  const router = useRouter()
  const [challengeId, setChallengeId] = React.useState<string>()
  const [otp, setOtp] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [settings, setSettings] = React.useState(telegramSettings)
  async function linkEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const value = new FormData(event.currentTarget).get("email")
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
    if (response.ok && result.challengeId) {
      setChallengeId(result.challengeId)
      if (result.devOtp) toast.info(`Test mode: код ${result.devOtp}`)
    } else toast.error(result.message ?? "Не удалось отправить код.")
    setPending(false)
  }
  async function verifyEmail(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    const response = await fetch("/api/auth/email/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, otp }),
    })
    const result = (await response.json()) as { message?: string }
    if (response.ok) {
      toast.success("Email привязан.")
      router.refresh()
    } else toast.error(result.message ?? "Не удалось привязать email.")
    setPending(false)
  }
  async function linkTelegram() {
    setPending(true)
    const response = await fetch("/api/auth/telegram/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "LINK_TELEGRAM" }),
    })
    const result = (await response.json()) as { url?: string; message?: string }
    if (response.ok && result.url) window.location.assign(result.url)
    else {
      toast.error(result.message ?? "Telegram недоступен.")
      setPending(false)
    }
  }
  async function updateTelegramSettings(next: { transactional: boolean; news: boolean }) {
    setSettings(next)
    const response = await fetch("/api/telegram/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    })
    if (!response.ok) {
      setSettings(settings)
      toast.error("Не удалось сохранить настройки уведомлений.")
    }
  }
  return (
    <div className="soft-panel flex flex-col gap-3 p-3">
      <p className="text-center text-sm font-semibold">Способы входа</p>
      <MethodRow
        icon={MailIcon}
        label="Email"
        value={email ?? "Не привязан"}
        connected={Boolean(email)}
      />
      {!email ? (
        challengeId ? (
          <form onSubmit={verifyEmail}>
            <FieldGroup>
              <Field>
                <FieldLabel className="sr-only">Код</FieldLabel>
                <InputOTP
                  value={otp}
                  onChange={setOtp}
                  maxLength={6}
                  disabled={pending}
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, index) => (
                      <InputOTPSlot key={index} index={index} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <Button
                  className="mt-2 w-full"
                  disabled={pending || otp.length !== 6}
                >
                  Подтвердить
                </Button>
              </Field>
            </FieldGroup>
          </form>
        ) : (
          <form onSubmit={linkEmail}>
            <FieldGroup>
              <Field orientation="horizontal">
                <FieldLabel className="sr-only" htmlFor="link-email">
                  Email
                </FieldLabel>
                <Input
                  id="link-email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  disabled={pending}
                />
                <Button type="submit" variant="outline" disabled={pending}>
                  Привязать
                </Button>
              </Field>
            </FieldGroup>
          </form>
        )
      ) : null}
      <MethodRow
        icon={SendIcon}
        label="Telegram"
        value={telegramId ? `id: ${telegramId}` : "Не привязан"}
        connected={Boolean(telegramId)}
      />
      {!telegramId ? (
        <Button
          type="button"
          variant="outline"
          onClick={linkTelegram}
          disabled={pending}
        >
          Привязать Telegram
        </Button>
      ) : settings ? (
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="telegram-transactional">Сервисные уведомления</FieldLabel>
            <Switch id="telegram-transactional" checked={settings.transactional} onCheckedChange={(value) => updateTelegramSettings({ ...settings, transactional: value })} />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="telegram-news">Новости</FieldLabel>
            <Switch id="telegram-news" checked={settings.news} onCheckedChange={(value) => updateTelegramSettings({ ...settings, news: value })} />
          </Field>
        </FieldGroup>
      ) : null}
    </div>
  )
}

function MethodRow({
  icon: Icon,
  label,
  value,
  connected,
}: {
  icon: typeof MailIcon
  label: string
  value: string
  connected: boolean
}) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/25 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <PulsarIconContainer icon={Icon} />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-medium">{value}</p>
        </div>
      </div>
      {connected ? (
        <Badge variant="secondary">
          <CheckIcon data-icon="inline-start" />
          Привязан
        </Badge>
      ) : null}
    </div>
  )
}

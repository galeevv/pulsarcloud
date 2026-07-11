"use client"

import * as React from "react"
import { CheckIcon, MailIcon, SendIcon } from "lucide-react"

import {
  requestEmailBindingAction,
  startTelegramBindingAction,
  verifyEmailBindingAction,
  type EmailBindingState,
  type TelegramBindingState,
} from "@/app/(dashboard)/profile/actions"
import { PulsarIconContainer } from "@/components/app/pulsar-primitives"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const emailInitial: EmailBindingState = { ok: false }
const telegramInitial: TelegramBindingState = { ok: false }

export function LoginMethodsManager({
  email,
  telegramId,
}: {
  email: string | null
  telegramId: string | null
}) {
  const [emailState, requestEmail, requestingEmail] = React.useActionState(
    requestEmailBindingAction,
    emailInitial
  )
  const [verifyState, verifyEmail, verifyingEmail] = React.useActionState(
    verifyEmailBindingAction,
    emailInitial
  )
  const [telegramState, startTelegram, startingTelegram] = React.useActionState(
    async () => startTelegramBindingAction(),
    telegramInitial
  )

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
        emailState.challengeId ? (
          <form action={verifyEmail} className="flex flex-col gap-2">
            <input
              type="hidden"
              name="challengeId"
              value={emailState.challengeId}
            />
            <input type="hidden" name="email" value={emailState.email} />
            <Input
              name="otp"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="Код из письма"
              required
            />
            <Button type="submit" disabled={verifyingEmail}>
              Подтвердить email
            </Button>
            <Message value={verifyState.message ?? emailState.message} />
          </form>
        ) : (
          <form action={requestEmail} className="flex gap-2">
            <Input
              name="email"
              type="email"
              placeholder="you@example.com"
              required
            />
            <Button type="submit" variant="outline" disabled={requestingEmail}>
              Привязать
            </Button>
            <Message value={emailState.message} />
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
        <form action={startTelegram} className="flex flex-col gap-2">
          <Button type="submit" variant="outline" disabled={startingTelegram}>
            Привязать Telegram
          </Button>
          {telegramState.url ? (
            <Button
              render={
                <a href={telegramState.url} target="_blank" rel="noreferrer" />
              }
            >
              Открыть Telegram
            </Button>
          ) : null}
          <Message value={telegramState.message} />
        </form>
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

function Message({ value }: { value?: string }) {
  return value ? <p className="text-xs text-muted-foreground">{value}</p> : null
}

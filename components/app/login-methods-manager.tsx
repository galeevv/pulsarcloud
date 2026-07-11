"use client"

import * as React from "react"
import { CheckIcon, MailIcon, SendIcon } from "lucide-react"
import { toast } from "sonner"

import { PulsarIconContainer } from "@/components/app/pulsar-primitives"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { backendUnavailableMessage } from "@/src/frontend-preview/config"

export function LoginMethodsManager({
  email,
  telegramId,
}: {
  email: string | null
  telegramId: string | null
}) {
  function handlePreviewSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    toast.info(backendUnavailableMessage)
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
        <form onSubmit={handlePreviewSubmit} className="flex gap-2">
          <Input
            name="email"
            type="email"
            placeholder="you@example.com"
            required
          />
          <Button type="submit" variant="outline">
            Привязать
          </Button>
        </form>
      ) : null}

      <MethodRow
        icon={SendIcon}
        label="Telegram"
        value={telegramId ? `id: ${telegramId}` : "Не привязан"}
        connected={Boolean(telegramId)}
      />
      {!telegramId ? (
        <form onSubmit={handlePreviewSubmit} className="flex flex-col gap-2">
          <Button type="submit" variant="outline">
            Привязать Telegram
          </Button>
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

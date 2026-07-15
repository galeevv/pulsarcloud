"use client"

import * as React from "react"
import { SendIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type TelegramPurpose = "USER_LOGIN" | "ADMIN_LOGIN" | "LINK_TELEGRAM"

export function TestTelegramForm({
  challengeId,
  purpose,
  token,
}: {
  challengeId: string
  purpose: TelegramPurpose
  token: string
}) {
  const [pending, setPending] = React.useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const formData = new FormData(event.currentTarget)

    try {
      const response = await fetch(
        `/api/test/telegram/${encodeURIComponent(challengeId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            telegramId: String(formData.get("telegramId") ?? ""),
            username: String(formData.get("username") ?? "") || undefined,
          }),
        }
      )
      const result = (await response.json()) as {
        redirectTo?: string
        message?: string
      }
      if (!response.ok || !result.redirectTo)
        throw new Error(result.message ?? "Не удалось завершить тестовый вход.")

      window.location.assign(result.redirectTo)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Не удалось завершить тестовый вход."
      )
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="test-telegram-id">Telegram ID</FieldLabel>
          <Input
            id="test-telegram-id"
            name="telegramId"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]+"
            maxLength={20}
            placeholder="Например, 900000001"
            required
            disabled={pending}
          />
          <FieldDescription>
            Новый ID создаст тестовый аккаунт, уже использованный — выполнит
            вход.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="test-telegram-username">
            Username{" "}
            <span className="text-muted-foreground">(необязательно)</span>
          </FieldLabel>
          <Input
            id="test-telegram-username"
            name="username"
            autoComplete="off"
            maxLength={32}
            placeholder="pulsar_tester"
            disabled={pending}
          />
        </Field>
        <Button type="submit" size="lg" disabled={pending}>
          <SendIcon data-icon="inline-start" />
          {pending
            ? "Подключаем…"
            : purpose === "LINK_TELEGRAM"
              ? "Привязать Telegram"
              : "Войти через Telegram"}
        </Button>
      </FieldGroup>
    </form>
  )
}

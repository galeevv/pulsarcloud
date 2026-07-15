import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { TestTelegramForm } from "@/app/test/telegram/[challengeId]/test-telegram-form"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getConfig } from "@/src/server/config"
import { getPendingTelegramTestChallenge } from "@/src/server/domain/auth/service"

export const metadata: Metadata = {
  title: { absolute: "PULSAR" },
}

export default async function TestTelegramPage({
  params,
  searchParams,
}: {
  params: Promise<{ challengeId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const config = getConfig()
  if (!config.localAuthAdaptersEnabled) notFound()

  const { challengeId } = await params
  const tokenValue = (await searchParams).token
  const token = Array.isArray(tokenValue) ? tokenValue[0] : tokenValue
  if (!token) notFound()

  let challenge: Awaited<ReturnType<typeof getPendingTelegramTestChallenge>>
  try {
    challenge = await getPendingTelegramTestChallenge({
      challengeId,
      rawStartToken: token,
    })
  } catch {
    notFound()
  }

  const title =
    challenge.purpose === "LINK_TELEGRAM"
      ? "Тестовая привязка Telegram"
      : challenge.purpose === "ADMIN_LOGIN"
        ? "Тестовый вход администратора"
        : "Тестовый вход через Telegram"

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-3">
          <Badge variant="outline">TEST MODE</Badge>
          <div className="space-y-1.5">
            <CardTitle className="text-lg font-semibold">{title}</CardTitle>
            <CardDescription>
              Эта локальная форма имитирует ответ Telegram-бота и недоступна в
              production.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <TestTelegramForm
            challengeId={challenge.id}
            purpose={challenge.purpose}
            token={token}
          />
        </CardContent>
      </Card>
    </main>
  )
}

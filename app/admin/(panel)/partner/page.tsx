import type { Metadata } from "next"
import { CheckCircle2Icon, Clock3Icon, WalletCardsIcon, XCircleIcon } from "lucide-react"

import { reviewPartnerPayout } from "@/app/admin/actions"
import { Badge } from "@/components/ui/badge"
import { PulsarIconContainer } from "@/components/app/pulsar-primitives"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { formatPreviewRub } from "@/src/frontend-preview/format"
import { db } from "@/src/server/infrastructure/db/client"
import { decryptSensitive } from "@/src/server/infrastructure/security/crypto"
import { requireWebSession } from "@/src/server/transport/web/session"

export const metadata: Metadata = { title: "Партнёрка · PULSAR Admin" }
const cardClass =
  "gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!"

export default async function AdminPartnerPage() {
  await requireWebSession("ADMIN")
  const requests = await db.payoutRequest.findMany({
    include: {
      user: { include: { identities: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-8 pb-4 md:px-6 md:pb-6">
      <Card className={cardClass}>
        <CardHeader className="p-4">
          <CardTitle>Заявки на вывод</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {requests.length ? (
            requests.map((request) => {
              const details = safeDetails(request.payoutDetailsEncrypted)
              const isPending = request.status === "PENDING"
              return (
                <div
                  key={request.id}
                  className="flex flex-col gap-4 border-b border-border/70 p-4 last:border-b-0"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <PulsarIconContainer icon={isPending ? Clock3Icon : WalletCardsIcon} />
                      <div className="min-w-0">
                        <p className="font-medium">{userLabel(request.user)}</p>
                      <p className="text-sm text-muted-foreground">{dateTime(request.createdAt)}</p>
                      </div>
                    </div>
                    <Badge variant="secondary">{rub(request.amountMinor)}</Badge>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-3">
                    <Detail label="Способ" value="Телефон или карта" />
                    <Detail
                      label="Реквизиты"
                      value={details.recipient ?? "Не указаны"}
                    />
                    <Detail label="Банк" value={details.bank ?? "Не указан"} />
                  </div>
                  {isPending ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={reviewPartnerPayout}>
                        <input type="hidden" name="payoutId" value={request.id} />
                        <input type="hidden" name="decision" value="PAID" />
                        <Button type="submit">
                          <CheckCircle2Icon data-icon="inline-start" /> Выплата
                          выполнена
                        </Button>
                      </form>
                      <form action={reviewPartnerPayout} className="flex items-center gap-2">
                        <input type="hidden" name="payoutId" value={request.id} />
                        <input type="hidden" name="decision" value="REJECTED" />
                        <Input name="rejectionReason" placeholder="Причина отказа" className="w-48" />
                        <Button type="submit" variant="outline">
                          <XCircleIcon data-icon="inline-start" /> Отклонить
                        </Button>
                      </form>
                    </div>
                  ) : (
                    <Badge variant={request.status === "REJECTED" ? "destructive" : "outline"}>
                      {request.status === "PAID"
                        ? `Выплачено ${dateOnly(request.reviewedAt ?? request.updatedAt)}`
                        : "Отклонено"}
                    </Badge>
                  )}
                </div>
              )
            })
          ) : (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Ожидающих заявок нет.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="soft-panel p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  )
}
function safeDetails(value: string) {
  try {
    return JSON.parse(decryptSensitive(value)) as {
      method?: string
      recipient?: string
      bank?: string
    }
  } catch {
    return {}
  }
}
function userLabel(user: {
  identities: Array<{
    provider: string
    providerSubject: string
    emailNormalized: string | null
    telegramUsername: string | null
  }>
}) {
  const identity =
    user.identities.find((item) => item.provider === "TELEGRAM") ??
    user.identities.find((item) => item.provider === "EMAIL")
  return identity?.telegramUsername
    ? `@${identity.telegramUsername}`
    : (identity?.emailNormalized ??
        identity?.providerSubject ??
        "Пользователь Pulsar")
}
function rub(value: number) {
  return formatPreviewRub(value / 100)
}
function dateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}
function dateOnly(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short" }).format(value)
}

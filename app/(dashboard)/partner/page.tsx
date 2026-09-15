import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowLeftIcon,
  BanknoteIcon,
  CheckCircle2Icon,
  Clock3Icon,
  PercentIcon,
  UserRoundIcon,
  WalletCardsIcon,
} from "lucide-react"

import { PartnerPayoutForm } from "@/components/app/partner-payout-form"
import { PulsarIconContainer } from "@/components/app/pulsar-primitives"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { formatPreviewRub } from "@/src/frontend-preview/format"
import { getPartnerView } from "@/src/server/queries/user-dashboard"
import { requireWebSession } from "@/src/server/transport/web/session"

export const metadata: Metadata = { title: { absolute: "PULSAR" } }

const cardClass =
  "gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!"

export default async function PartnerPage() {
  const session = await requireWebSession("USER")
  const view = await getPartnerView(session.userId)

  if (!view.enrollment?.enabled) {
    return (
      <main className="pulsar-container">
        <Card className={`${cardClass} mx-auto w-full max-w-lg`}>
          <CardContent className="flex min-h-56 flex-col justify-center p-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PercentIcon />
                </EmptyMedia>
                <EmptyTitle>Партнёрская программа</EmptyTitle>
                <EmptyDescription>
                  Партнёрская программа пока не подключена для вашего аккаунта.
                </EmptyDescription>
              </EmptyHeader>
              <Button
                nativeButton={false}
                render={<Link href="/referrals" />}
                variant="outline"
              >
                <ArrowLeftIcon data-icon="inline-start" /> К рефералам
              </Button>
            </Empty>
          </CardContent>
        </Card>
      </main>
    )
  }

  const earnedMinor = view.commissions
    .filter((item) => item.status !== "REVERSED")
    .reduce((sum, item) => sum + item.amountMinor, 0)
  const paidOutMinor = view.payouts
    .filter((item) => item.status === "PAID")
    .reduce((sum, item) => sum + item.amountMinor, 0)

  return (
    <main className="pulsar-container flex flex-col gap-4">
      <Card className={`${cardClass} mx-auto w-full max-w-lg`}>
        <CardHeader className="gap-3 p-6">
          <div className="flex flex-col items-center text-center">
            <CardTitle className="text-2xl">Партнёрская программа</CardTitle>
            <Badge className="mt-2" variant="secondary">
              {view.enrollment.rateBps / 100}% с платежей
            </Badge>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
          <Summary
            label="Доступно"
            value={rub(view.wallet.availableMinor)}
            icon={WalletCardsIcon}
          />
          <Summary
            label="В резерве"
            value={rub(view.wallet.reservedMinor)}
            icon={Clock3Icon}
          />
          <Summary
            label="Заработано"
            value={rub(earnedMinor)}
            icon={BanknoteIcon}
          />
          <Summary
            label="Выплачено"
            value={rub(paidOutMinor)}
            icon={CheckCircle2Icon}
          />
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium">Вывод средств</p>
            <p className="text-sm text-muted-foreground">
              Минимум {view.minimalPayoutMinor / 100} ₽
            </p>
          </div>
          <Dialog>
            <DialogTrigger render={<Button>Вывести</Button>} />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Заявка на вывод</DialogTitle>
              </DialogHeader>
              <PartnerPayoutForm minAmountRub={view.minimalPayoutMinor / 100} />
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader className="p-4">
          <CardTitle>Доход от приглашённых</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="flex flex-col gap-2 p-3">
          {view.commissions.length ? (
            <div className="flex flex-col gap-2">
              {view.commissions.map((commission) => (
                <div
                  key={commission.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/20 p-3"
                >
                  <PulsarIconContainer icon={UserRoundIcon} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {maskedUser(commission.invited)}
                    </p>
                    <p className="text-xs text-muted-foreground">{dateTime(commission.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant="outline">{rub(commission.baseAmountMinor)}</Badge>
                    <Badge
                      variant="outline"
                      className={commission.status === "AVAILABLE" ? "border-success/30 bg-success/10 text-success" : undefined}
                    >
                      +{rub(commission.amountMinor)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Пока нет подтверждённых платежей приглашённых.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader className="p-4">
          <CardTitle>Заявки на вывод</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="flex flex-col gap-2 p-3">
          {view.payouts.length ? (
            view.payouts.map((payout) => (
                <div
                  key={payout.id}
                  className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/20 p-3"
                >
                  <PulsarIconContainer icon={WalletCardsIcon} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">Сумма вывода {rub(payout.amountMinor)}</p>
                    <p className="text-xs text-muted-foreground">{dateTime(payout.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={payout.status === "PAID" ? "outline" : "outline"} className={payout.status === "PAID" ? "border-success/30 bg-success/10 text-success" : undefined}>
                      {statusLabel(payout.status)}
                    </Badge>
                  </div>
                </div>
            ))
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Заявок пока нет.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

function Summary({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof WalletCardsIcon
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-background/20 p-3">
      <PulsarIconContainer icon={Icon} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  )
}

function rub(minor: number) {
  return formatPreviewRub(minor / 100)
}
function dateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}
function maskedUser(user: {
  telegramProfile: { username: string | null; firstName: string | null; lastName: string | null } | null
  identities: Array<{
    provider: string
    providerSubject: string
    emailNormalized: string | null
    telegramUsername: string | null
  }>
}) {
  const telegram = user.telegramProfile?.username ??
    user.identities.find((item) => item.telegramUsername)?.telegramUsername
  if (telegram) return telegram.startsWith("@") ? telegram : `@${telegram}`
  const name = [user.telegramProfile?.firstName, user.telegramProfile?.lastName]
    .filter(Boolean)
    .join(" ")
  if (name) return name
  return user.identities.find((item) => item.emailNormalized)?.emailNormalized ?? "Пользователь Pulsar"
}
function statusLabel(status: string) {
  return (
    (
      {
        PENDING: "В обработке",
        APPROVED: "Одобрено",
        PAID: "Выплачено",
        REJECTED: "Отклонено",
        CANCELED: "Отменено",
      } as Record<string, string>
    )[status] ?? status
  )
}

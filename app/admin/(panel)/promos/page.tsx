import { randomUUID } from "node:crypto"
import type { Metadata } from "next"
import {
  CalendarDaysIcon,
  GiftIcon,
  RadioTowerIcon,
  SmartphoneIcon,
  TicketPercentIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react"
import Link from "next/link"

import { PulsarIconContainer } from "@/components/app/pulsar-primitives"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { CreatePromoDialog } from "./create-promo-dialog"
import { PromoCampaignControls } from "./promo-campaign-controls"
import { getAdminPromosView } from "./query"

export const metadata: Metadata = {
  title: "Промокампании · PULSAR Admin",
}

function formatDate(value: Date | null) {
  if (!value) return "После активации"
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
}

function statusBadge(status: "DRAFT" | "ACTIVE" | "PAUSED", ended: boolean) {
  if (ended) return <Badge variant="outline">Завершена</Badge>
  if (status === "ACTIVE") return <Badge>Активна</Badge>
  if (status === "PAUSED")
    return <Badge variant="secondary">Приостановлена</Badge>
  return <Badge variant="outline">Черновик</Badge>
}

function syncBadge(
  status: "NOT_REQUIRED" | "PENDING" | "SYNCED" | "FAILED" | null
) {
  if (status === "SYNCED") return <Badge variant="secondary">Готово</Badge>
  if (status === "FAILED") return <Badge variant="destructive">Ошибка</Badge>
  if (status === "PENDING") return <Badge variant="outline">В очереди</Badge>
  return <Badge variant="outline">Нет данных</Badge>
}

function SummaryCard({
  description,
  icon: Icon,
  label,
  value,
}: {
  description: string
  icon: typeof GiftIcon
  label: string
  value: string | number
}) {
  return (
    <Card className="h-full gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!">
      <CardHeader className="gap-0 p-4 pb-0">
        <CardDescription className="text-sm font-medium">
          {label}
        </CardDescription>
        <CardAction>
          <PulsarIconContainer icon={Icon} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 p-4 pt-2">
        <CardTitle className="truncate text-3xl leading-none font-semibold tracking-tight tabular-nums">
          {value}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

export default async function AdminPromosPage() {
  const view = await getAdminPromosView()

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-8 pb-4 md:px-6 md:pb-6">
      <section
        aria-label="Сводка по промокампаниям"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <SummaryCard
          label="Активная кампания"
          value={view.metrics.activeCampaignName ?? "Нет"}
          description="Только одна кампания может выдавать подписки"
          icon={TicketPercentIcon}
        />
        <SummaryCard
          label="Выдано"
          value={view.metrics.totalGranted}
          description="Всего промоподписок в текущем окружении"
          icon={UsersIcon}
        />
        <SummaryCard
          label="Осталось мест"
          value={view.metrics.remaining}
          description="В текущей активной кампании"
          icon={GiftIcon}
        />
        <SummaryCard
          label="Ошибки синхронизации"
          value={view.metrics.failedSyncs}
          description="Требуют проверки worker и Remnawave"
          icon={TriangleAlertIcon}
        />
      </section>

      <Card className="gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!">
        <CardHeader className="gap-0 p-4">
          <CardTitle>Промокампании</CardTitle>
          <CardDescription>
            Условия фиксируются в момент выдачи и не зависят от будущих
            изменений тарифов.
          </CardDescription>
          <CardAction>
            <CreatePromoDialog idempotencyKey={randomUUID()} />
          </CardAction>
        </CardHeader>
        <Separator />
        <CardContent className="grid gap-4 p-4 md:grid-cols-2">
          {view.campaigns.length ? (
            view.campaigns.map((campaign) => {
              const active = campaign.status === "ACTIVE" && !campaign.ended
              return (
                <Card
                  key={campaign.id}
                  size="sm"
                  className="h-full gap-0 rounded-2xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!"
                >
                  <CardHeader className="gap-1 p-4">
                    <CardTitle className="truncate">{campaign.name}</CardTitle>
                    <CardDescription>/{campaign.slug}</CardDescription>
                    <CardAction>
                      {statusBadge(campaign.status, campaign.ended)}
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4 p-4 pt-0">
                    <Progress
                      value={Math.min(100, campaign.progress)}
                      aria-label={`Выдано ${campaign.claimedCount} из ${campaign.claimLimit}`}
                    >
                      <ProgressLabel>
                        Использовано {campaign.claimedCount} из{" "}
                        {campaign.claimLimit}
                      </ProgressLabel>
                      <ProgressValue />
                    </Progress>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div className="soft-panel p-3">
                        <dt className="text-xs text-muted-foreground">
                          Подписка
                        </dt>
                        <dd className="mt-1 font-medium tabular-nums">
                          {campaign.durationDays} дней
                        </dd>
                      </div>
                      <div className="soft-panel p-3">
                        <dt className="text-xs text-muted-foreground">
                          Устройства
                        </dt>
                        <dd className="mt-1 font-medium tabular-nums">
                          {campaign.deviceLimit}
                        </dd>
                      </div>
                      <div className="soft-panel p-3">
                        <dt className="text-xs text-muted-foreground">LTE</dt>
                        <dd className="mt-1 font-medium">
                          {campaign.lteEnabled ? "Включён" : "Выключен"}
                        </dd>
                      </div>
                      <div className="soft-panel p-3">
                        <dt className="text-xs text-muted-foreground">
                          Окно выдачи
                        </dt>
                        <dd className="mt-1 font-medium tabular-nums">
                          {campaign.registrationWindowDays} дней
                        </dd>
                      </div>
                    </dl>
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                      <span>Старт: {formatDate(campaign.startsAt)}</span>
                      <span>Окончание: {formatDate(campaign.endsAt)}</span>
                    </div>
                  </CardContent>
                  <Separator />
                  <CardFooter className="p-3">
                    <PromoCampaignControls
                      campaignId={campaign.id}
                      active={active}
                      ended={campaign.ended}
                    />
                  </CardFooter>
                </Card>
              )
            })
          ) : (
            <Empty className="min-h-64 border-0 md:col-span-2">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <GiftIcon />
                </EmptyMedia>
                <EmptyTitle>Промокампаний пока нет</EmptyTitle>
                <EmptyDescription>
                  Создайте черновик, проверьте условия и активируйте выдачу.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card className="gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!">
        <CardHeader className="gap-0 p-4">
          <CardTitle>Последние получатели</CardTitle>
          <CardDescription>
            Snapshot выданных условий и состояние синхронизации подписки.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {view.recentClaims.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Пользователь</TableHead>
                  <TableHead>Кампания</TableHead>
                  <TableHead>Условия</TableHead>
                  <TableHead>Выдано</TableHead>
                  <TableHead>Синхронизация</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.recentClaims.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell>
                      <Button
                        variant="link"
                        nativeButton={false}
                        className="h-auto justify-start p-0"
                        render={<Link href={`/admin/users/${claim.userId}`} />}
                      >
                        {claim.userLabel}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">
                          {claim.campaignName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Место №{claim.claimNumber}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          <CalendarDaysIcon data-icon="inline-start" />
                          {claim.durationDays} дней
                        </Badge>
                        <Badge variant="outline">
                          <SmartphoneIcon data-icon="inline-start" />
                          {claim.deviceLimit}
                        </Badge>
                        {claim.lteEnabled ? (
                          <Badge variant="secondary">
                            <RadioTowerIcon data-icon="inline-start" />
                            LTE
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(claim.grantedAt)}</TableCell>
                    <TableCell>{syncBadge(claim.syncStatus)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty className="min-h-56 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon />
                </EmptyMedia>
                <EmptyTitle>Выдач пока нет</EmptyTitle>
                <EmptyDescription>
                  Получатели появятся после регистрации новых пользователей.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

import { randomUUID } from "node:crypto"
import type { Metadata } from "next"
import {
  CalendarDaysIcon,
  CreditCardIcon,
  HistoryIcon,
  RadioTowerIcon,
  SmartphoneIcon,
} from "lucide-react"

import { PulsarIconContainer } from "@/components/app/pulsar-primitives"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
import { Separator } from "@/components/ui/separator"
import { formatPreviewRub } from "@/src/frontend-preview/format"

import { PricingDialog } from "./pricing-dialog"
import { getAdminPlansView } from "./query"

export const metadata: Metadata = {
  title: "Тарифы · PULSAR Admin",
}

function monthLabel(months: number) {
  if (months === 1) return "1 месяц"
  if (months >= 2 && months <= 4) return `${months} месяца`
  return `${months} месяцев`
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
}

export default async function AdminPlansPage() {
  const view = await getAdminPlansView()
  const idempotencyKey = randomUUID()

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-8 pb-4 md:px-6 md:pb-6">
      <section
        aria-label="Сводка по тарифам"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <SummaryCard
          label="Версия цен"
          value={`v${view.pricing.version}`}
          description={`Обновлено ${formatDate(view.pricing.updatedAt)}`}
          icon={HistoryIcon}
        />
        <SummaryCard
          label="База за месяц"
          value={formatPreviewRub(view.pricing.baseMonthlyPriceMinor / 100)}
          description={`От ${view.pricing.minDeviceLimit} устройства`}
          icon={CreditCardIcon}
        />
        <SummaryCard
          label="Доп. устройство"
          value={formatPreviewRub(
            view.pricing.extraDeviceMonthlyPriceMinor / 100
          )}
          description={`Лимит до ${view.pricing.maxDeviceLimit}`}
          icon={SmartphoneIcon}
        />
        <SummaryCard
          label="Действующие подписки"
          value={view.activeSubscriptions}
          description="Активные и пробные в текущем окружении"
          icon={CalendarDaysIcon}
        />
      </section>

      <Card className="gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!">
        <CardHeader className="gap-0 p-4">
          <CardTitle>Тарифы</CardTitle>
          <CardDescription>
            Четыре срока используют одну авторитетную версию настроек.
          </CardDescription>
          <CardAction>
            <PricingDialog
              idempotencyKey={idempotencyKey}
              pricing={view.pricing}
            />
          </CardAction>
        </CardHeader>
        <Separator />
        <CardContent className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
          {view.plans.map((plan) => (
            <Card
              key={plan.months}
              size="sm"
              className="h-full gap-0 rounded-2xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!"
            >
              <CardHeader className="gap-1 p-4">
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>
                  {monthLabel(plan.months)} · {plan.durationDays} дней
                </CardDescription>
                <CardAction>
                  <div className="flex flex-wrap justify-end gap-1">
                    <Badge variant={plan.available ? "secondary" : "outline"}>
                      {plan.available ? "Активен" : "Скрыт"}
                    </Badge>
                    {plan.discountPct ? (
                    <Badge variant="secondary">−{plan.discountPct}%</Badge>
                    ) : null}
                  </div>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 p-4 pt-0">
                <div>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums">
                    {formatPreviewRub(plan.amountMinor / 100)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatPreviewRub(plan.monthlyAmountMinor / 100)} в месяц
                  </p>
                </div>
                <dl className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Скидка</dt>
                    <dd className="font-medium tabular-nums">
                      {plan.discountPct}%
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Устройства</dt>
                    <dd className="font-medium tabular-nums">
                      {view.pricing.minDeviceLimit}–
                      {view.pricing.maxDeviceLimit}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">LTE</dt>
                    <dd className="font-medium">
                      +
                      {formatPreviewRub(
                        view.pricing.lteMonthlyPriceMinor / 100
                      )}
                      /мес.
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">
                      Активные подписки
                    </dt>
                    <dd className="font-medium tabular-nums">
                      {plan.activeSubscriptions}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      <Card className="gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!">
        <CardHeader className="gap-0 p-4">
          <CardTitle>История цен</CardTitle>
          <CardDescription>
            Версии сохраняются в неизменяемом журнале действий.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="flex flex-col p-3">
          {view.history.length ? (
            view.history.map((entry, index) => (
              <div key={entry.id}>
                <div className="flex items-start gap-3 px-2 py-3">
                  <PulsarIconContainer icon={HistoryIcon} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {entry.previousVersion && entry.nextVersion
                          ? `Версия ${entry.previousVersion} → ${entry.nextVersion}`
                          : "Обновлены настройки тарифов"}
                      </p>
                      <time className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(entry.createdAt)}
                      </time>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.reason ?? "Изменение зафиксировано в AuditLog"}
                    </p>
                    {entry.changes.length ? (
                      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                        {entry.changes.map((change) => (
                          <div
                            key={change.label}
                            className="soft-panel min-w-0 p-3"
                          >
                            <dt className="text-xs font-medium">
                              {change.label}
                            </dt>
                            <dd className="mt-1 break-words text-xs text-muted-foreground">
                              <span className="line-through">
                                {change.before}
                              </span>
                              <span aria-hidden="true"> → </span>
                              <span className="text-foreground">
                                {change.after}
                              </span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Подробный снимок для этой записи недоступен.
                      </p>
                    )}
                  </div>
                </div>
                {index < view.history.length - 1 ? <Separator /> : null}
              </div>
            ))
          ) : (
            <Empty className="min-h-44 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <RadioTowerIcon />
                </EmptyMedia>
                <EmptyTitle>История пока пуста</EmptyTitle>
                <EmptyDescription>
                  Первая запись появится после изменения настроек.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({
  description,
  icon: Icon,
  label,
  value,
}: {
  description: string
  icon: typeof HistoryIcon
  label: string
  value: React.ReactNode
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
        <CardTitle className="text-3xl leading-none font-semibold tracking-tight tabular-nums">
          {value}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

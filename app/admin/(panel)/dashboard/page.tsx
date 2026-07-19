import type { Metadata } from "next"
import type { LucideIcon } from "lucide-react"
import {
  ActivityIcon,
  ArrowRightIcon,
  CreditCardIcon,
  HeadphonesIcon,
  ServerCogIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  UserPlusIcon,
  UsersIcon,
  WalletCardsIcon,
} from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { PulsarIconContainer } from "@/components/app/pulsar-primitives"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { formatPreviewRub } from "@/src/frontend-preview/format"
import {
  getAdminDashboardView,
  type AdminDashboardActivity,
} from "@/src/server/queries/admin-dashboard"
import { getSession } from "@/src/server/transport/web/session"

export const metadata: Metadata = {
  title: "Dashboard · PULSAR Admin",
}

function relativeTime(value: Date, now: Date) {
  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - value.getTime()) / 60_000)
  )
  if (minutes < 1) return "только что"
  if (minutes < 60) return `${minutes} мин. назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч. назад`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} дн. назад`
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: value.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(value)
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

function trendLabel(value: number, period: string) {
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "→"
  return `${arrow} ${Math.abs(value)}% ${period}`
}

function trendTone(value: number) {
  if (value > 0) return "positive" as const
  if (value < 0) return "negative" as const
  return "neutral" as const
}

function MetricCard({
  label,
  value,
  trend,
  trendTone: tone = "neutral",
  icon: Icon,
  attention = false,
}: {
  label: string
  value: string | number
  trend: string
  trendTone?: "positive" | "negative" | "neutral"
  icon: LucideIcon
  attention?: boolean
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
      <CardContent className="flex items-end justify-between gap-3 p-4 pt-2">
        <CardTitle className="text-3xl leading-none font-semibold tracking-tight tabular-nums">
          {value}
        </CardTitle>
        <span
          className={cn(
            "text-right text-xs font-medium text-muted-foreground",
            !attention && tone === "positive" && "text-success",
            !attention && tone === "negative" && "text-destructive",
            attention && "text-destructive"
          )}
        >
          {trend}
        </span>
      </CardContent>
    </Card>
  )
}

function activityIcon(kind: AdminDashboardActivity["kind"]) {
  if (kind === "user") return UserPlusIcon
  if (kind === "payment") return CreditCardIcon
  return ShieldCheckIcon
}

function referralCountLabel(count: number) {
  const lastTwoDigits = Math.abs(count) % 100
  const lastDigit = Math.abs(count) % 10
  const noun =
    lastDigit === 1 && lastTwoDigits !== 11
      ? "приглашение"
      : lastDigit >= 2 &&
          lastDigit <= 4 &&
          (lastTwoDigits < 12 || lastTwoDigits > 14)
        ? "приглашения"
        : "приглашений"

  return `${count} ${noun}`
}

export default async function AdminDashboardPage() {
  const session = await getSession("ADMIN")
  if (!session || session.user.role !== "ADMIN") redirect("/admin")

  const dashboard = await getAdminDashboardView()
  const userTrend = percentChange(
    dashboard.metrics.newUsersThisWeek,
    dashboard.metrics.newUsersPreviousWeek
  )
  const revenueTrend = percentChange(
    dashboard.metrics.revenueThisMonthMinor,
    dashboard.metrics.revenuePreviousMonthMinor
  )
  const attentionItems = [
    {
      label: "Обращения поддержки",
      description: "Открытые диалоги ждут ответа",
      value: dashboard.attention.openSupport,
      href: "/admin/support",
      icon: HeadphonesIcon,
    },
    {
      label: "Выплаты",
      description: "Заявки ожидают решения",
      value: dashboard.attention.pendingPayouts,
      href: "/admin/payouts",
      icon: WalletCardsIcon,
    },
    {
      label: "Синхронизация подписок",
      description: "Активные подписки с ошибкой",
      value: dashboard.attention.failedSubscriptionSyncs,
      href: "/admin/operations?tab=sync",
      icon: ServerCogIcon,
    },
    {
      label: "Задания worker",
      description: "FAILED или DEAD",
      value: dashboard.attention.failedJobs,
      href: "/admin/operations?tab=queue",
      icon: TriangleAlertIcon,
    },
  ]

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-8 pb-4 md:px-6 md:pb-6">
      <section
        aria-label="Ключевые показатели"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Пользователи"
          value={dashboard.metrics.totalUsers}
          trend={trendLabel(userTrend, "за 7 дней")}
          trendTone={trendTone(userTrend)}
          icon={UsersIcon}
        />
        <MetricCard
          label="Активные подписки"
          value={dashboard.metrics.activeSubscriptions}
          trend={`${dashboard.metrics.trialSubscriptions} trial`}
          icon={ActivityIcon}
        />
        <MetricCard
          label="Выручка за месяц"
          value={formatPreviewRub(
            dashboard.metrics.revenueThisMonthMinor / 100
          )}
          trend={trendLabel(revenueTrend, "за месяц")}
          trendTone={trendTone(revenueTrend)}
          icon={CreditCardIcon}
        />
        <MetricCard
          label="Требуют внимания"
          value={dashboard.metrics.attentionTotal}
          trend={
            dashboard.metrics.attentionTotal
              ? "Проверьте задачи ниже"
              : "Критичных задач нет"
          }
          icon={TriangleAlertIcon}
          attention={dashboard.metrics.attentionTotal > 0}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.75fr)]">
        <Card className="gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!">
          <CardHeader className="gap-0 p-4">
            <CardTitle>Требуют внимания</CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="flex flex-col gap-1 p-3">
            {attentionItems.map((item) => {
              const Icon = item.icon
              return (
                <Button
                  key={item.label}
                  variant="ghost"
                  nativeButton={false}
                  className="h-auto w-full justify-start gap-3 rounded-2xl px-3 py-3"
                  render={<Link href={item.href} />}
                >
                  <PulsarIconContainer icon={Icon} />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium">
                      {item.label}
                    </span>
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                  <Badge variant={item.value ? "destructive" : "secondary"}>
                    {item.value}
                  </Badge>
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              )
            })}
          </CardContent>
        </Card>

        <Card className="gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!">
          <CardHeader className="gap-0 p-4">
            <CardTitle>Топ рефералов</CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="flex flex-col gap-2 p-3">
            {dashboard.topReferrers.length ? (
              dashboard.topReferrers.map((referrer) => (
                <Link
                  key={referrer.userId}
                  href={`/admin/users/${referrer.userId}`}
                  className="soft-panel flex min-h-14 items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-card/55 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-background text-foreground">
                        {(referrer.telegram !== "Телеграм не привязан"
                          ? referrer.telegram.replace(/^@/, "")
                          : referrer.email !== "Почта не привязана"
                            ? referrer.email
                            : "П"
                        )
                          .slice(0, 1)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {referrer.telegram}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {referrer.email}
                      </span>
                    </span>
                  </span>
                  <Badge variant="secondary">
                    {referralCountLabel(referrer.invites)}
                  </Badge>
                </Link>
              ))
            ) : (
              <Empty className="min-h-56">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersIcon />
                  </EmptyMedia>
                  <EmptyTitle>Пока нет приглашений</EmptyTitle>
                  <EmptyDescription>
                    Статистика появится после первой регистрации по ссылке.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!">
        <CardHeader className="gap-0 p-4">
          <CardTitle>Последняя активность</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="flex flex-col p-3">
          {dashboard.activities.length ? (
            dashboard.activities.map((activity, index) => {
              const Icon = activityIcon(activity.kind)
              const content = (
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <PulsarIconContainer icon={Icon} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {activity.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {activity.description}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {relativeTime(activity.occurredAt, dashboard.generatedAt)}
                  </span>
                </div>
              )

              return (
                <div key={activity.id}>
                  {activity.href ? (
                    <Link
                      href={activity.href}
                      className="flex rounded-xl px-2 py-3 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="flex px-2 py-3">{content}</div>
                  )}
                  {index < dashboard.activities.length - 1 ? (
                    <Separator />
                  ) : null}
                </div>
              )
            })
          ) : (
            <div className="flex min-h-32 flex-col items-center justify-center gap-2 text-center">
              <ActivityIcon className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">Активности пока нет</p>
              <p className="text-xs text-muted-foreground">
                Здесь появятся регистрации, платежи и действия администратора.
              </p>
            </div>
          )}
        </CardContent>
        <Separator />
        <CardFooter className="p-3">
          <Button
            variant="outline"
            nativeButton={false}
            className="w-full rounded-2xl"
            render={<Link href="/admin/operations?tab=audit" />}
          >
            Посмотреть все активности
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

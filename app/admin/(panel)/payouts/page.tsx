import type { Metadata } from "next"
import type { LucideIcon } from "lucide-react"
import {
  BanIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleDollarSignIcon,
  HandCoinsIcon,
  HourglassIcon,
  WalletCardsIcon,
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
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatPreviewRub } from "@/src/frontend-preview/format"

import { PayoutTableRow } from "./_components/payout-table-row"
import { PayoutsToolbar } from "./_components/payouts-toolbar"
import { parsePayoutFilter, type PayoutFilter } from "./_lib/filters"
import { getAdminPayoutsView } from "./_lib/query"

export const metadata: Metadata = {
  title: "Выплаты · PULSAR Admin",
}

type SearchParams = Promise<{
  status?: string | string[]
  page?: string | string[]
}>

const cardClass =
  "gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!"

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  attention = false,
}: {
  label: string
  value: string | number
  note: string
  icon: LucideIcon
  attention?: boolean
}) {
  return (
    <Card className={cn("h-full", cardClass)}>
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
        <p
          className={cn(
            "text-right text-xs font-medium text-muted-foreground",
            attention && "text-destructive"
          )}
        >
          {note}
        </p>
      </CardContent>
    </Card>
  )
}

function payoutStatusBadge(status: string) {
  if (status === "PENDING") return <Badge variant="outline">Ожидает</Badge>
  if (status === "APPROVED") return <Badge>Одобрена</Badge>
  if (status === "PAID") return <Badge variant="secondary">Выплачена</Badge>
  return <Badge variant="destructive">Отклонена</Badge>
}

function telegramLabel(value: string | null) {
  if (!value) return "Telegram не привязан"
  return value.startsWith("@") ? value : `@${value}`
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}

function pageHref(input: { page: number; filter: PayoutFilter }) {
  const params = new URLSearchParams()
  if (input.filter !== "pending") params.set("status", input.filter)
  if (input.page > 1) params.set("page", String(input.page))
  const suffix = params.size ? `?${params.toString()}` : ""
  return `/admin/payouts${suffix}`
}

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const filter = parsePayoutFilter(first(params.status))
  const requestedPage = Math.max(1, Number(first(params.page)) || 1)
  const view = await getAdminPayoutsView({
    filter,
    page: requestedPage,
  })
  const rangeStart = view.total ? (view.page - 1) * view.pageSize + 1 : 0
  const rangeEnd = Math.min(view.page * view.pageSize, view.total)

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-8 pb-4 md:px-6 md:pb-6">
      <section
        aria-label="Показатели выплат"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Ожидают решения"
          value={view.metrics.pending}
          note="Новые заявки администратора"
          icon={HourglassIcon}
          attention={view.metrics.pending > 0}
        />
        <MetricCard
          label="Зарезервировано"
          value={formatPreviewRub(view.metrics.reservedMinor / 100)}
          note="Ожидающие и одобренные заявки"
          icon={WalletCardsIcon}
        />
        <MetricCard
          label="Выплачено за месяц"
          value={formatPreviewRub(view.metrics.paidThisMonthMinor / 100)}
          note="Завершённые выплаты"
          icon={HandCoinsIcon}
        />
        <MetricCard
          label="Отклонено"
          value={view.metrics.rejected}
          note="За всё время"
          icon={BanIcon}
        />
      </section>

      <Card className={cardClass}>
        <CardContent className="p-4">
          <PayoutsToolbar key={filter} filter={filter} />
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader className="gap-0 p-4">
          <CardTitle>Заявки на выплату</CardTitle>
          <CardAction className="self-center">
            <Badge variant="secondary">{view.total}</Badge>
          </CardAction>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {view.payouts.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Пользователь</TableHead>
                  <TableHead>Telegram username</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                  <TableHead>Реквизиты</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Дата заявки</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.payouts.map((payout) => (
                  <PayoutTableRow
                    key={payout.id}
                    href={`/admin/payouts/${payout.id}`}
                  >
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/users/${payout.user.id}`}
                        className="underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {payout.email ?? "Почта не привязана"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {telegramLabel(payout.telegramUsername)}
                    </TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                      {formatPreviewRub(payout.amountMinor / 100)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {payout.payoutDetailsMasked}
                    </TableCell>
                    <TableCell>{payoutStatusBadge(payout.status)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {dateTime(payout.createdAt)}
                    </TableCell>
                  </PayoutTableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty className="min-h-72 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CircleDollarSignIcon />
                </EmptyMedia>
                <EmptyTitle>Заявок в этом статусе нет</EmptyTitle>
                <EmptyDescription>
                  Переключите фильтр, чтобы посмотреть другие выплаты.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
        <Separator />
        <CardFooter className="flex items-center justify-between gap-3 p-3">
          <p className="text-sm text-muted-foreground">
            {rangeStart}–{rangeEnd} из {view.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              nativeButton={false}
              disabled={view.page <= 1}
              aria-label="Предыдущая страница"
              render={
                <Link
                  href={pageHref({
                    page: view.page - 1,
                    filter,
                  })}
                />
              }
            >
              <ChevronLeftIcon />
            </Button>
            <span className="min-w-16 text-center text-sm tabular-nums">
              {view.page} / {view.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              nativeButton={false}
              disabled={view.page >= view.totalPages}
              aria-label="Следующая страница"
              render={
                <Link
                  href={pageHref({
                    page: view.page + 1,
                    filter,
                  })}
                />
              }
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}

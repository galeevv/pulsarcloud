import type { Metadata } from "next"
import type { LucideIcon } from "lucide-react"
import {
  AlertTriangleIcon,
  BanknoteArrowDownIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Clock3Icon,
  CreditCardIcon,
} from "lucide-react"
import Link from "next/link"

import { PulsarIconContainer } from "@/components/app/pulsar-primitives"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
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
import { formatPreviewRub } from "@/src/frontend-preview/format"

import { PaymentsToolbar } from "./_components/payments-toolbar"
import {
  parsePaymentFilter,
  parsePaymentPeriod,
  parsePaymentSort,
  type PaymentFilter,
  type PaymentPeriod,
  type PaymentSort,
} from "./_lib/filters"
import { getAdminPaymentsView } from "./_lib/query"

export const metadata: Metadata = {
  title: "Платежи · PULSAR Admin",
}

type SearchParams = Promise<{
  q?: string | string[]
  status?: string | string[]
  period?: string | string[]
  sort?: string | string[]
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
    <Card className={cardClass}>
      <CardHeader className="gap-0 p-4 pb-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <CardAction>
          <PulsarIconContainer icon={Icon} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 p-4 pt-2">
        <CardTitle className={attention ? "text-destructive" : undefined}>
          {value}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  )
}

function paymentStatusBadge(status: string) {
  if (status === "CONFIRMED") return <Badge>Успешно</Badge>
  if (status === "CREATED" || status === "PENDING")
    return <Badge variant="outline">Ожидает</Badge>
  if (status === "REFUNDED") return <Badge variant="secondary">Возврат</Badge>
  if (status === "PARTIALLY_REFUNDED")
    return <Badge variant="secondary">Частичный возврат</Badge>
  return <Badge variant="destructive">Ошибка</Badge>
}

function purposeLabel(value: string) {
  return value === "DEVICE_LIMIT_UPGRADE"
    ? "Дополнительное устройство"
    : "Подписка"
}

function telegramLabel(value: string | null) {
  if (!value) return null
  return value.startsWith("@") ? value : `@${value}`
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}

function pageHref(input: {
  page: number
  query: string
  filter: PaymentFilter
  period: PaymentPeriod
  sort: PaymentSort
}) {
  const params = new URLSearchParams()
  if (input.query) params.set("q", input.query)
  if (input.filter !== "all") params.set("status", input.filter)
  if (input.period !== "30d") params.set("period", input.period)
  if (input.sort !== "newest") params.set("sort", input.sort)
  if (input.page > 1) params.set("page", String(input.page))
  const suffix = params.size ? `?${params.toString()}` : ""
  return `/admin/payments${suffix}`
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const query = first(params.q)?.trim().slice(0, 100) ?? ""
  const filter = parsePaymentFilter(first(params.status))
  const period = parsePaymentPeriod(first(params.period))
  const sort = parsePaymentSort(first(params.sort))
  const requestedPage = Math.max(1, Number(first(params.page)) || 1)
  const view = await getAdminPaymentsView({
    query,
    filter,
    period,
    sort,
    page: requestedPage,
  })
  const rangeStart = view.total ? (view.page - 1) * view.pageSize + 1 : 0
  const rangeEnd = Math.min(view.page * view.pageSize, view.total)

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-8 pb-4 md:px-6 md:pb-6">
      <section
        aria-label="Показатели платежей"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Оборот за месяц"
          value={formatPreviewRub(view.metrics.revenueThisMonthMinor / 100)}
          note="Только подтверждённые платежи"
          icon={CreditCardIcon}
        />
        <MetricCard
          label="Успешные"
          value={view.metrics.successfulThisMonth}
          note="Подтверждены в этом месяце"
          icon={CheckCircle2Icon}
        />
        <MetricCard
          label="Ожидающие"
          value={view.metrics.pending}
          note="Созданы или обрабатываются"
          icon={Clock3Icon}
        />
        <MetricCard
          label="Ошибочные"
          value={view.metrics.failedThisMonth}
          note="За текущий месяц"
          icon={AlertTriangleIcon}
          attention={view.metrics.failedThisMonth > 0}
        />
      </section>

      <Card className={cardClass}>
        <CardContent className="p-4">
          <PaymentsToolbar
            key={`${query}:${filter}:${period}:${sort}`}
            query={query}
            filter={filter}
            period={period}
            sort={sort}
          />
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader className="gap-0 p-4">
          <CardTitle>Платежи</CardTitle>
          <CardAction>
            <Badge variant="secondary">{view.total}</Badge>
          </CardAction>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {view.payments.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Пользователь</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                  <TableHead>Назначение</TableHead>
                  <TableHead>Провайдер</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead>Внешний ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.payments.map((payment) => {
                  const telegram = telegramLabel(payment.telegramUsername)
                  const primary =
                    telegram ?? payment.email ?? "Пользователь Pulsar"
                  const secondary =
                    telegram && payment.email ? payment.email : null
                  return (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <Link
                          href={`/admin/users/${payment.user.id}`}
                          className="flex min-w-40 flex-col gap-0.5 rounded-md underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <span className="truncate font-medium">
                            {primary}
                          </span>
                          {secondary ? (
                            <span className="truncate text-xs text-muted-foreground">
                              {secondary}
                            </span>
                          ) : null}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                        {formatPreviewRub(payment.amountMinor / 100)}
                      </TableCell>
                      <TableCell>{purposeLabel(payment.purpose)}</TableCell>
                      <TableCell>{payment.provider}</TableCell>
                      <TableCell>
                        {paymentStatusBadge(payment.status)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {dateTime(payment.createdAt)}
                      </TableCell>
                      <TableCell className="max-w-48 truncate font-mono text-xs">
                        {payment.externalPaymentId ?? "Не назначен"}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <Empty className="min-h-72 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BanknoteArrowDownIcon />
                </EmptyMedia>
                <EmptyTitle>Платежи не найдены</EmptyTitle>
                <EmptyDescription>
                  Измените поисковый запрос, период или выбранный фильтр.
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
                    query,
                    filter,
                    period,
                    sort,
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
                    query,
                    filter,
                    period,
                    sort,
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

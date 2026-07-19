import type { Metadata } from "next"
import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  CircleDollarSignIcon,
  GiftIcon,
  HistoryIcon,
  MailIcon,
  MessageSquareTextIcon,
  SendIcon,
  SmartphoneIcon,
  UserRoundIcon,
  WalletIcon,
} from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { PayoutDetailsReveal } from "@/components/admin/payout-details-reveal"
import { PulsarIconContainer } from "@/components/app/pulsar-primitives"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

import { PayoutActions } from "../_components/payout-actions"
import { getAdminPayoutDetail } from "../_lib/query"

export const metadata: Metadata = {
  title: "Заявка на выплату · PULSAR Admin",
}

const cardClass =
  "gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!"

function telegramLabel(value: string | null) {
  if (!value) return "Telegram не привязан"
  return value.startsWith("@") ? value : `@${value}`
}

function statusBadge(status: string) {
  if (status === "PENDING") return <Badge variant="outline">Ожидает</Badge>
  if (status === "APPROVED") return <Badge>Одобрена</Badge>
  if (status === "PAID") return <Badge variant="secondary">Выплачена</Badge>
  return <Badge variant="destructive">Отклонена</Badge>
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}

function actionLabel(value: string) {
  if (value === "PAYOUT_APPROVE") return "Заявка одобрена"
  if (value === "PAYOUT_REJECT") return "Заявка отклонена"
  if (value === "PAYOUT_PAID") return "Выплата подтверждена"
  if (value === "PAYOUT_DETAILS_REVEALED") return "Просмотрены реквизиты"
  return value
}

function auditComment(value: string | null) {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as { reason?: unknown }
    return typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim()
      : null
  } catch {
    return null
  }
}

function SummaryCard({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string
  value: string | number
  note: string
  icon: LucideIcon
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
        <CardTitle>{value}</CardTitle>
        <p className="text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  )
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-2 py-2.5">
      <PulsarIconContainer icon={Icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block truncate text-sm font-medium">{value}</span>
      </span>
    </div>
  )
}

function SectionCard({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <Card className={cardClass}>
      <CardHeader className="gap-0 p-4">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="p-3">{children}</CardContent>
    </Card>
  )
}

export default async function AdminPayoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const payout = await getAdminPayoutDetail(id)
  if (!payout) notFound()

  const reviewer = payout.reviewer
    ? telegramLabel(payout.reviewer.telegramUsername) !== "Telegram не привязан"
      ? telegramLabel(payout.reviewer.telegramUsername)
      : (payout.reviewer.email ?? "Pulsar")
    : "Не рассмотрена"

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-8 pb-4 md:px-6 md:pb-6">
      <Card className={cardClass}>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">
                Выплата {formatPreviewRub(payout.amountMinor / 100)}
              </h2>
              {statusBadge(payout.status)}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              Заявка от {dateTime(payout.createdAt)}
            </p>
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            className="shrink-0 rounded-2xl"
            render={<Link href="/admin/payouts" />}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Все выплаты
          </Button>
        </CardContent>
      </Card>

      <section
        aria-label="Сводка по заявке"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <SummaryCard
          label="Сумма"
          value={formatPreviewRub(payout.amountMinor / 100)}
          note="Заявлено к выплате"
          icon={CircleDollarSignIcon}
        />
        <SummaryCard
          label="Доступный баланс"
          value={formatPreviewRub(
            (payout.user.wallet?.availableMinor ?? 0) / 100
          )}
          note="После резервирования"
          icon={WalletIcon}
        />
        <SummaryCard
          label="В резерве"
          value={formatPreviewRub(
            (payout.user.wallet?.reservedMinor ?? 0) / 100
          )}
          note="По всем заявкам пользователя"
          icon={SendIcon}
        />
        <SummaryCard
          label="Рефералы"
          value={payout.user._count.sentInvites}
          note={`${payout.paidReferrals} оплатили`}
          icon={GiftIcon}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Заявка">
          <DetailRow
            icon={CalendarDaysIcon}
            label="Создана"
            value={dateTime(payout.createdAt)}
          />
          <DetailRow
            icon={HistoryIcon}
            label="Рассмотрена"
            value={
              payout.reviewedAt
                ? dateTime(payout.reviewedAt)
                : "Ожидает решения"
            }
          />
          <DetailRow
            icon={UserRoundIcon}
            label="Администратор"
            value={reviewer}
          />
          <DetailRow
            icon={CircleDollarSignIcon}
            label="Реквизиты"
            value={
              <PayoutDetailsReveal
                payoutId={payout.id}
                masked={payout.payoutDetailsMasked}
              />
            }
          />
        </SectionCard>

        <SectionCard title="Пользователь">
          <DetailRow
            icon={SmartphoneIcon}
            label="Telegram"
            value={telegramLabel(payout.telegramUsername)}
          />
          <DetailRow
            icon={MailIcon}
            label="Email"
            value={payout.email ?? "Почта не привязана"}
          />
          <DetailRow
            icon={GiftIcon}
            label="Реферальный код"
            value={payout.user.referralProfile?.inviteCode ?? "Не создан"}
          />
          <DetailRow
            icon={UserRoundIcon}
            label="Карточка пользователя"
            value={
              <Link
                href={`/admin/users/${payout.user.id}`}
                className="underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Открыть профиль
              </Link>
            }
          />
        </SectionCard>

        <SectionCard title="Комментарий администратора">
          <DetailRow
            icon={MessageSquareTextIcon}
            label="Последнее решение"
            value={
              payout.rejectionReason ??
              payout.auditLogs
                .map((item) => auditComment(item.metadataJson))
                .find(Boolean) ??
              "Комментарий появится после первого решения."
            }
          />
        </SectionCard>

        <SectionCard title="Действия">
          <div className="flex flex-col gap-3 px-2 py-2.5">
            <p className="text-sm text-muted-foreground">
              Все изменения выполняются транзакционно и записываются в AuditLog.
            </p>
            <PayoutActions payoutId={payout.id} status={payout.status} />
          </div>
        </SectionCard>
      </section>

      <Card className={cardClass}>
        <CardHeader className="gap-0 p-4">
          <CardTitle>История статусов</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Событие</TableHead>
                <TableHead>Комментарий</TableHead>
                <TableHead>Correlation ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payout.auditLogs.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">
                    {dateTime(item.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {actionLabel(item.action)}
                  </TableCell>
                  <TableCell className="max-w-md">
                    {auditComment(item.metadataJson) ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-52 truncate font-mono text-xs">
                    {item.correlationId}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="whitespace-nowrap">
                  {dateTime(payout.createdAt)}
                </TableCell>
                <TableCell className="font-medium">Заявка создана</TableCell>
                <TableCell>Средства зарезервированы</TableCell>
                <TableCell>—</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

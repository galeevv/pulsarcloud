import { randomUUID } from "node:crypto"
import type { Metadata } from "next"
import {
  BanIcon,
  BotIcon,
  CircleCheckIcon,
  MessageSquareWarningIcon,
  RadioTowerIcon,
  SendIcon,
  UsersIcon,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { BroadcastControls } from "./broadcast-controls"
import { CreateBroadcastDialog } from "./create-broadcast-dialog"
import { getAdminTelegramView } from "./query"

export const metadata: Metadata = {
  title: "Telegram · PULSAR Admin",
}

function formatDate(value: Date | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}

function targetLabel(target: "NEWS_OPTED_IN" | "ALL_REACHABLE") {
  return target === "NEWS_OPTED_IN"
    ? "Подписаны на новости"
    : "Устаревшая · только opt-in"
}

function statusBadge(
  status: "DRAFT" | "QUEUED" | "SENDING" | "COMPLETED" | "CANCELED",
  failedDeliveries: number
) {
  if (status === "DRAFT") return <Badge variant="outline">Черновик</Badge>
  if (status === "QUEUED") return <Badge variant="secondary">В очереди</Badge>
  if (status === "SENDING") return <Badge>Отправляется</Badge>
  if (status === "COMPLETED")
    return failedDeliveries ? (
      <Badge variant="destructive">Завершена с ошибками</Badge>
    ) : (
      <Badge>Завершена</Badge>
    )
  return <Badge variant="secondary">Отменена</Badge>
}

export default async function AdminTelegramPage() {
  const view = await getAdminTelegramView()

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-8 pb-4 md:px-6 md:pb-6">
      <section
        aria-label="Telegram показатели"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Привязали Telegram"
          value={view.audience.linked}
          description="Пользователи текущего окружения"
          icon={UsersIcon}
        />
        <MetricCard
          label="Доступны для новостей"
          value={view.audience.newsOptedIn}
          description={`Всего доступно: ${view.audience.reachable}`}
          icon={SendIcon}
        />
        <MetricCard
          label="Заблокировали бота"
          value={view.audience.blocked}
          description="Доставка им отключена"
          icon={BanIcon}
        />
        <MetricCard
          label="Ошибки доставки"
          value={view.audience.failedDeliveries}
          description="По сохранённым рассылкам"
          icon={MessageSquareWarningIcon}
          attention={view.audience.failedDeliveries > 0}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card className="gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!">
          <CardHeader className="gap-0 p-4">
            <CardTitle>Состояние бота</CardTitle>
            <CardDescription>
              Метрики входящих update относятся ко всей текущей БД: до
              обработки update может быть не связан с пользователем.
            </CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="flex flex-col gap-1 p-3">
            <StatusRow
              label="Bot API"
              value={
                view.bot.configured
                  ? `@${view.bot.username ?? "настроен"}`
                  : "Не настроен"
              }
              ready={view.bot.configured}
            />
            <StatusRow
              label="Webhook secret"
              value={view.bot.webhookConfigured ? "Настроен" : "Не настроен"}
              ready={view.bot.webhookConfigured}
            />
            <StatusRow
              label="Последний update"
              value={formatDate(view.bot.latestUpdate?.receivedAt ?? null)}
              ready={Boolean(view.bot.latestUpdate?.processedAt)}
            />
            <StatusRow
              label="Ошибки обработки"
              value={String(view.bot.pendingUpdateErrors)}
              ready={view.bot.pendingUpdateErrors === 0}
            />
          </CardContent>
        </Card>

        <Card className="gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!">
          <CardHeader className="gap-0 p-4">
            <CardTitle>Рассылки и новости</CardTitle>
            <CardDescription>
              Отправка выполняется worker небольшими пакетами.
            </CardDescription>
            <CardAction>
              <CreateBroadcastDialog initialIdempotencyKey={randomUUID()} />
            </CardAction>
          </CardHeader>
          <Separator />
          <CardContent className="flex min-h-40 items-center p-4">
            <div className="flex items-start gap-3">
              <PulsarIconContainer icon={RadioTowerIcon} />
              <div>
                <p className="text-sm font-medium">
                  Без синхронных API-вызовов
                </p>
                <p className="text-sm text-muted-foreground">
                  Эта страница читает локальную БД и конфигурацию. Проверка
                  реальной доставки происходит через очередь и журнал
                  интеграций.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!">
        <CardHeader className="gap-0 p-4">
          <CardTitle>История рассылок</CardTitle>
          <CardAction>
            <Badge variant="secondary">{view.broadcasts.length}</Badge>
          </CardAction>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {view.broadcasts.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Рассылка</TableHead>
                  <TableHead>Аудитория</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Доставка</TableHead>
                  <TableHead>Создана</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.broadcasts.map((broadcast) => (
                  <TableRow key={broadcast.id}>
                    <TableCell className="max-w-80">
                      <p className="truncate font-medium">{broadcast.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {broadcast.body}
                      </p>
                    </TableCell>
                    <TableCell>{targetLabel(broadcast.target)}</TableCell>
                    <TableCell>
                      {statusBadge(
                        broadcast.status,
                        broadcast.deliveries.failed
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary">
                          {broadcast.deliveries.sent} отправлено
                        </Badge>
                        {broadcast.deliveries.pending ? (
                          <Badge variant="outline">
                            {broadcast.deliveries.pending} ожидает
                          </Badge>
                        ) : null}
                        {broadcast.deliveries.failed ? (
                          <Badge variant="destructive">
                            {broadcast.deliveries.failed} ошибок
                          </Badge>
                        ) : null}
                        {broadcast.deliveries.skipped ? (
                          <Badge variant="outline">
                            {broadcast.deliveries.skipped} пропущено
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(broadcast.createdAt)}</TableCell>
                    <TableCell>
                      <BroadcastControls
                        broadcastId={broadcast.id}
                        status={broadcast.status}
                        initialQueueKey={randomUUID()}
                        initialCancelKey={randomUUID()}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty className="min-h-64 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BotIcon />
                </EmptyMedia>
                <EmptyTitle>Рассылок пока нет</EmptyTitle>
                <EmptyDescription>
                  Создайте новость, проверьте предпросмотр и поставьте черновик
                  в очередь.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({
  attention = false,
  description,
  icon: Icon,
  label,
  value,
}: {
  attention?: boolean
  description: string
  icon: typeof UsersIcon
  label: string
  value: number
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
        <p
          className={cn(
            "text-xs text-muted-foreground",
            attention && "text-destructive"
          )}
        >
          {description}
        </p>
      </CardContent>
    </Card>
  )
}

function StatusRow({
  label,
  ready,
  value,
}: {
  label: string
  ready: boolean
  value: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-3 py-2">
      <PulsarIconContainer
        icon={ready ? CircleCheckIcon : MessageSquareWarningIcon}
      />
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <Badge variant={ready ? "secondary" : "destructive"}>{value}</Badge>
    </div>
  )
}

import { randomUUID } from "node:crypto"
import type { Metadata } from "next"
import type { LucideIcon } from "lucide-react"
import {
  ActivityIcon,
  CircleCheckIcon,
  Clock3Icon,
  DatabaseIcon,
  ListTodoIcon,
  OctagonXIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react"
import Link from "next/link"

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
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

import { getAdminOperationsView, type SystemTone } from "./_lib/query"
import { JobActions } from "./job-actions"
import { OperationsTabs, type OperationTab } from "./operations-tabs"

export const metadata: Metadata = {
  title: "Операции · PULSAR Admin",
}

const cardClass =
  "gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!"

const operationTabs = ["queue", "sync", "audit", "system"] as const

export default async function AdminOperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab
  const activeTab = operationTabs.includes(requestedTab as OperationTab)
    ? (requestedTab as OperationTab)
    : "queue"
  const view = await getAdminOperationsView()

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-8 pb-4 md:px-6 md:pb-6">
      <section
        aria-label="Сводка по очереди"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="В очереди"
          value={view.metrics.pending}
          note="Ожидают запуска"
          icon={Clock3Icon}
        />
        <MetricCard
          label="Выполняются"
          value={view.metrics.processing}
          note="Сейчас обрабатываются worker"
          icon={ActivityIcon}
        />
        <MetricCard
          label="Ошибки"
          value={view.metrics.failed}
          note="Будут повторены автоматически"
          icon={TriangleAlertIcon}
          attention={view.metrics.failed > 0}
        />
        <MetricCard
          label="Dead jobs"
          value={view.metrics.dead}
          note="Требуют ручного решения"
          icon={OctagonXIcon}
          attention={view.metrics.dead > 0}
        />
      </section>

      <OperationsTabs activeTab={activeTab}>
        <TabsList
          variant="line"
          className="w-full justify-start overflow-x-auto border-b border-border/70 px-1"
        >
          <TabsTrigger value="queue">Очередь</TabsTrigger>
          <TabsTrigger value="sync">Синхронизация</TabsTrigger>
          <TabsTrigger value="audit">AuditLog</TabsTrigger>
          <TabsTrigger value="system">Система</TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          <SectionCard title="Задачи worker" count={view.jobs.length}>
            {view.jobs.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Тип</TableHead>
                      <TableHead>Сущность</TableHead>
                      <TableHead>Попытки</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Следующий запуск</TableHead>
                      <TableHead>Ошибка</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {view.jobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="max-w-64 font-medium">
                          <span className="block truncate">{job.type}</span>
                        </TableCell>
                        <TableCell>
                          {job.href ? (
                            <Link
                              href={job.href}
                              className="underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                              {job.aggregateType}
                            </Link>
                          ) : (
                            job.aggregateType
                          )}
                          <span className="block max-w-48 truncate font-mono text-xs text-muted-foreground">
                            {job.aggregateId}
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {job.attempts} / {job.maxAttempts}
                        </TableCell>
                        <TableCell>
                          <JobStatusBadge status={job.status} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {dateTime(job.runAfter)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              job.safeError
                                ? "text-destructive"
                                : "text-muted-foreground"
                            }
                          >
                            {job.safeError ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <JobActions
                            jobId={job.id}
                            retryable={job.retryable}
                            cancellable={job.cancellable}
                            retryIdempotencyKey={randomUUID()}
                            cancelIdempotencyKey={randomUUID()}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <OperationsEmpty
                icon={ListTodoIcon}
                title="Очередь пуста"
                description="Задач worker пока нет."
              />
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="sync">
          <SectionCard
            title="Синхронизация подписок"
            count={view.subscriptions.length}
          >
            {view.subscriptions.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Пользователь</TableHead>
                      <TableHead>Подписка</TableHead>
                      <TableHead>syncVersion</TableHead>
                      <TableHead>Remnawave</TableHead>
                      <TableHead>Последняя синхронизация</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {view.subscriptions.map((subscription) => (
                      <TableRow key={subscription.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/admin/users/${subscription.userId}`}
                            className="underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {subscription.userLabel}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="block max-w-64 truncate font-mono text-xs">
                            {subscription.id}
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {subscription.syncVersion}
                        </TableCell>
                        <TableCell>
                          <SyncStatusBadge status={subscription.syncStatus} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {subscription.lastSyncedAt
                            ? dateTime(subscription.lastSyncedAt)
                            : "Ещё не синхронизирована"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <OperationsEmpty
                icon={CircleCheckIcon}
                title="Синхронизаций нет"
                description="Активные или проблемные подписки не найдены."
              />
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="audit">
          <SectionCard title="Журнал аудита" count={view.auditLogs.length}>
            {view.auditLogs.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Инициатор</TableHead>
                      <TableHead>Действие</TableHead>
                      <TableHead>Сущность</TableHead>
                      <TableHead>Дата</TableHead>
                      <TableHead>Correlation ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {view.auditLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant="outline">{log.actorType}</Badge>
                          <span className="block max-w-44 truncate font-mono text-xs text-muted-foreground">
                            {log.actorId ?? "system"}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">
                          {log.action}
                        </TableCell>
                        <TableCell>
                          {log.entityType}
                          <span className="block max-w-44 truncate font-mono text-xs text-muted-foreground">
                            {log.entityId ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {dateTime(log.createdAt)}
                        </TableCell>
                        <TableCell>
                          <span className="block max-w-52 truncate font-mono text-xs">
                            {log.correlationId}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <OperationsEmpty
                icon={ShieldCheckIcon}
                title="Журнал пуст"
                description="Записей AuditLog пока нет."
              />
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="system">
          <SectionCard title="Состояние management plane">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {view.system.map((item) => (
                <Card
                  key={item.name}
                  className="gap-0 rounded-2xl border border-border/70 bg-background/30 py-0 shadow-none! ring-0!"
                >
                  <CardHeader className="gap-1 p-4">
                    <CardTitle>{item.name}</CardTitle>
                    <CardAction>
                      <SystemBadge tone={item.tone} status={item.status} />
                    </CardAction>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <p className="text-sm text-muted-foreground">
                      {item.detail}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="px-1 pt-4 text-xs text-muted-foreground">
              Провайдеры не опрашиваются синхронно: состояние основано на
              конфигурации, очереди, heartbeat и локальных журналах.
            </p>
          </SectionCard>
        </TabsContent>
      </OperationsTabs>
    </div>
  )
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  attention = false,
}: {
  label: string
  value: number
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

function SectionCard({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <Card className={cardClass}>
      <CardHeader className="gap-0 p-4">
        <CardTitle>{title}</CardTitle>
        {count !== undefined ? (
          <CardAction className="self-center">
            <Badge variant="secondary">{count}</Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <Separator />
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  )
}

function JobStatusBadge({ status }: { status: string }) {
  if (status === "COMPLETED")
    return <Badge variant="secondary">Завершена</Badge>
  if (status === "PROCESSING") return <Badge>В работе</Badge>
  if (status === "FAILED") return <Badge variant="destructive">Ошибка</Badge>
  if (status === "DEAD") return <Badge variant="destructive">Dead</Badge>
  return <Badge variant="outline">В очереди</Badge>
}

function SyncStatusBadge({ status }: { status: string }) {
  if (status === "SYNCED")
    return <Badge variant="secondary">Синхронизирована</Badge>
  if (status === "FAILED") return <Badge variant="destructive">Ошибка</Badge>
  if (status === "PENDING") return <Badge>В очереди</Badge>
  return <Badge variant="outline">Не требуется</Badge>
}

function SystemBadge({ tone, status }: { tone: SystemTone; status: string }) {
  if (tone === "negative") return <Badge variant="destructive">{status}</Badge>
  if (tone === "positive") return <Badge variant="secondary">{status}</Badge>
  return <Badge variant="outline">{status}</Badge>
}

function OperationsEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof DatabaseIcon
  title: string
  description: string
}) {
  return (
    <Empty className="min-h-72 border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}
